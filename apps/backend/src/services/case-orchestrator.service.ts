import { AIService } from './AIService.js';
import { GameStoreService } from './game-store.service.js';
import { telemetryService } from './telemetry.service.js';
import { errorLogger } from '../utils/error-logger.js';
import {
  FullCase,
  Difficulty,
  AIServiceCharacter,
  AIServiceClue,
  GenerationPhase,
  GenerationPhases,
  Game,
  GameStates,
  Character,
  Clue,
  RelationshipMatrix
} from '../types/game.types.js';
import { generateId } from '../utils/id.js';
import { buildCaseFacts } from '../game/case-facts.js';
import { buildCanonicalTimeline } from '../game/case-validation.js';
import { createHash } from 'node:crypto';
import { env } from '../config/env.js';

const CLUE_STEP_PREFIX = 'clues_round_v2_';
const CASE_REVIEW_STEP = 'case_review_v2';

const nowIso = () => new Date().toISOString();

class CaseReviewError extends Error {
  constructor(public readonly areas: string[], message: string) { super(message); }
}

export class CaseOrchestratorService {
  private readonly active = new Map<string, AbortController>();
  public isGenerating(gameId: string): boolean { return this.active.has(gameId); }
  public cancel(gameId: string): void { this.active.get(gameId)?.abort(); this.active.delete(gameId); }
  public cancelAll(): void { for (const gameId of this.active.keys()) this.cancel(gameId); }

  public async generateCase(gameId: string, difficulty: Difficulty, maxRounds: number): Promise<void> {
    if (this.active.has(gameId)) return;
    const controller = new AbortController();
    this.active.set(gameId, controller);
    try {
      await this.runGeneration(gameId, difficulty, maxRounds, controller.signal, Date.now(), 0);
    } finally { if (this.active.get(gameId) === controller) this.active.delete(gameId); }
  }

  private readonly STEP_TIMEOUT_MS = env.GENERATION_STEP_TIMEOUT_MS;
  private readonly GLOBAL_TIMEOUT_MS = env.GENERATION_GLOBAL_TIMEOUT_MS;
  private readonly BATCH_SIZE = env.GENERATION_CHARACTER_BATCH_SIZE;
  private readonly CONCURRENCY = env.GENERATION_CHARACTER_CONCURRENCY;

  public onGenerationProgress?: (gameId: string, progress: { phase: GenerationPhase, attempt: number, elapsedMs: number, error?: string }) => void;
  public onGameStateChange?: (gameId: string, state: any) => void;

  constructor(
    private aiService: AIService,
    private store: GameStoreService
  ) {}

  public setGenerationProgressListener(listener: (gameId: string, progress: any) => void) {
    this.onGenerationProgress = listener;
  }

  public setGameStateChangeListener(listener: (gameId: string, gameInfo: any) => void) {
    this.onGameStateChange = listener;
  }

  private async runGeneration(gameId: string, difficulty: Difficulty, maxRounds: number, externalSignal: AbortSignal, globalStartTime: number, repairAttempt: number): Promise<void> {
    const game = this.store.getById(gameId);
    if (!game) return;

    const signature = createHash('sha256').update(JSON.stringify({ version: 4,
      players: game.players.map(p => [p.id, p.nickname]), difficulty, maxRounds,
      model: env.OPENAI_MODEL, batchSize: this.BATCH_SIZE,
      budgets: [env.OPENAI_MAX_TOKENS_JSON, env.OPENAI_MAX_TOKENS_CLUES, env.OPENAI_MAX_TOKENS_NARRATIVES, env.OPENAI_MAX_TOKENS_REVIEW]
    })).digest('hex');
    if (game.generationCheckpoint?.signature !== signature) {
      game.generationCheckpoint = { signature, steps: {} };
      this.store.save(game);
    }
    const globalController = new AbortController();
    const cancel = () => globalController.abort();
    externalSignal.addEventListener('abort', cancel, { once: true });
    if (externalSignal.aborted) globalController.abort();
    const globalTimeout = setTimeout(() => {
        console.error(`[ORCHESTRATOR] Global generation timeout for game ${gameId}`);
        globalController.abort();
    }, Math.max(1, this.GLOBAL_TIMEOUT_MS - (Date.now() - globalStartTime)));

    try {
      let fullCase: Partial<FullCase> = {};

      const allowedPlayerNames = game.players.map(p => p.nickname).filter(Boolean);
      // 1. SKELETON
      const skeleton = await this.executeStep<Partial<FullCase>>(
        gameId,
        GenerationPhases.SKELETON,
        "skeleton",
        (sig) => this.aiService.generateCaseSkeleton(gameId, allowedPlayerNames, difficulty, sig),
        globalController.signal
      );
      if (!skeleton.assassin || !skeleton.victim) {
        throw new Error('Invalid skeleton: assassin must be participant and victim must be external');
      }
      fullCase = { ...skeleton, characters: [], clues: {}, generationFeedback: game.generationCheckpoint?.feedback };

      // Immediate persistence of solution seed
      this.persistPartialData(gameId, {
        solution: {
          assassin: skeleton.assassin || '',
          weapon: skeleton.weapon || '',
          location: skeleton.location || '',
          victimName: skeleton.victim || '',
          finalNarrative: ''
        },
        murder: {
            killerPlayerId: '',
            weapon: skeleton.weapon || '',
            location: skeleton.location || '',
            victim: skeleton.victim || '',
            crimeWindow: skeleton.crimeWindow
        }
      });

      // 2. CHARACTERS BASIC
      const expectedCount = game.players.length;

      const basicCharacters = await this.executeStep<Partial<AIServiceCharacter>[]>(
        gameId,
        GenerationPhases.CHARACTERS,
        "characters_basic",
        (sig) => this.aiService.generateBasicCharacters(gameId, fullCase, expectedCount, allowedPlayerNames, difficulty, sig),
        globalController.signal
      );

      fullCase.relationsMatrix = { relations: [] };
      fullCase.characters = basicCharacters as AIServiceCharacter[];
      const plannedCharacters = this.aiService.buildSimpleCasePlan(fullCase, basicCharacters);
      fullCase.characters = plannedCharacters as AIServiceCharacter[];

      const characterChunks = this.chunkArray(plannedCharacters, this.BATCH_SIZE);
      const enrichedChunks: Partial<AIServiceCharacter>[][] = [];

      for (let i = 0; i < characterChunks.length; i += this.CONCURRENCY) {
        const batch = characterChunks.slice(i, i + this.CONCURRENCY);
        const results = await Promise.all(batch.map((chunk, batchIdx) => {
          const index = i + batchIdx;
          return this.executeStep<Partial<AIServiceCharacter>[]>(
              gameId,
              GenerationPhases.CHARACTERS,
              `characters_enrich_batch_${index}`,
              (sig) => this.aiService.enrichCharacterProfilesBatch(gameId, fullCase, chunk, difficulty, index, sig),
              globalController.signal
          );
        }));
        enrichedChunks.push(...results);
      }

      const enrichedCharacters = enrichedChunks.flat();
      fullCase.characters = this.aiService.normalizeCharacters(enrichedCharacters, fullCase);

      // Post-generation safety validation
      const finalNames = fullCase.characters.map(c => c.name?.trim().toLowerCase());
      const normalizedAllowed = allowedPlayerNames.map(n => n.trim().toLowerCase());
      const allNamesValid = finalNames.every(name => normalizedAllowed.includes(name || ''));

      if (!allNamesValid) {
          throw new Error("Invalid character names generated: names do not match allowed player names");
      }

      // Validation: Victim must not be a participant
      if (fullCase.characters.some(c => c.name === fullCase.victim)) {
        console.warn(`[ORCHESTRATOR] Victim name (${fullCase.victim}) collision detected with character list. Applying fallback.`);
        fullCase.victim = `${fullCase.victim} (Víctima)`;
      }

      telemetryService.record({
        gameId, phase: GenerationPhases.CHARACTERS, stepLabel: 'characters_complete', stepName: 'orch:chars_done', attempt: 1,
        startAt: Date.now(), endAt: Date.now(), durationMs: 0, outcome: 'success', model: 'orchestrator'
      });

      fullCase.canonicalTimeline = buildCanonicalTimeline(fullCase as FullCase);
      fullCase.facts = buildCaseFacts(fullCase as FullCase, maxRounds);

      // 3. NARRATIVES
      const narratives = await this.executeStep<{ introductionNarrative: string, solutionNarrative: string }>(
        gameId,
        GenerationPhases.NARRATIVES,
        "narratives",
        (sig) => this.aiService.generateNarratives(gameId, fullCase as FullCase, difficulty, sig),
        globalController.signal
      );
      fullCase.introductionNarrative = narratives.introductionNarrative;
      fullCase.solutionNarrative = narratives.solutionNarrative;

      // Immediate persistence of introduction and final narrative
      const currentSolution = this.store.getById(gameId)?.solution;
      this.persistPartialData(gameId, {
        introNarrative: narratives.introductionNarrative,
        solution: currentSolution ? { ...currentSolution, finalNarrative: narratives.solutionNarrative } : null
      });

      // Persist each round separately; an interrupted generation resumes at its missing round.
      for (let round = 1; round <= maxRounds; round++) {
        fullCase.clues![`round${round}`] = await this.executeStep<AIServiceClue[]>(
          gameId, GenerationPhases.CLUES, `${CLUE_STEP_PREFIX}${round}`,
          sig => this.aiService.generateClueRound(gameId, fullCase as FullCase, round, maxRounds, difficulty, sig),
          globalController.signal
        );
      }
      const review = await this.executeStep<{ issues: { area: string; reason: string }[] }>(
        gameId, GenerationPhases.RECOVERY, CASE_REVIEW_STEP,
        sig => this.aiService.reviewCase(gameId, fullCase as FullCase, sig), globalController.signal
      );
      if (review.issues.length) throw new CaseReviewError(review.issues.map(i => i.area), review.issues.map(i => i.reason).join(' '));
      globalController.signal.throwIfAborted();
      this.finalizeGame(gameId, fullCase as FullCase);
      const totalTimeMs = Date.now() - globalStartTime;
      console.log("[GENERATION] Total time:", totalTimeMs, "ms");
      telemetryService.setTotalTime(gameId, totalTimeMs);

    } catch (error: any) {
      if (externalSignal.aborted) return;
      if (error instanceof CaseReviewError) {
        const current = this.store.getById(gameId);
        if (current?.generationCheckpoint) {
          const checkpoint = current.generationCheckpoint;
          checkpoint.feedback = error.message;
          const invalidPlan = error.areas.includes('plan');
          for (const key of Object.keys(checkpoint.steps)) {
            if (key === CASE_REVIEW_STEP || key === 'case_review' ||
                (invalidPlan && (key === 'characters_basic' || key === 'relations_matrix' || key === 'case_plan' || key.startsWith('characters_enrich'))) ||
                ((invalidPlan || error.areas.includes('clues')) && key.startsWith('clues_round_')) ||
                ((invalidPlan || error.areas.includes('narratives')) && key === 'narratives')) delete checkpoint.steps[key];
          }
          this.store.save(current);
        }
        if (repairAttempt < 2 && !globalController.signal.aborted) {
          clearTimeout(globalTimeout);
          return await this.runGeneration(gameId, difficulty, maxRounds, externalSignal, globalStartTime, repairAttempt + 1);
        }
      }
      globalController.abort();
      const totalTimeMs = Date.now() - globalStartTime;
      console.log("[GENERATION] Total time:", totalTimeMs, "ms");
      telemetryService.setTotalTime(gameId, totalTimeMs);

      console.error(`[ORCHESTRATOR ERROR] Game ${gameId}:`, error.message);
      errorLogger.push('ORCHESTRATOR_STEP_FAILURE', {
        gameId,
        phase: game.generationPhase,
        message: error.message || 'Error desconegut durant la generació',
        stack: error.stack
      });
      this.handleFailure(gameId, error instanceof CaseReviewError ? 'El cas encara presenta incoherències. Torna a iniciar per recuperar la generació.' : 'No s’ha pogut completar la generació. Torna a iniciar per reprendre-la.');
    } finally {
      clearTimeout(globalTimeout);
      externalSignal.removeEventListener('abort', cancel);
    }
  }

  private async executeStep<T>(
    gameId: string,
    phase: GenerationPhase,
    stepName: string,
    task: (sig: AbortSignal) => Promise<T>,
    globalSignal: AbortSignal
  ): Promise<T> {
    globalSignal.throwIfAborted();
    const cached = this.store.getById(gameId)?.generationCheckpoint?.steps[stepName];
    if (cached !== undefined) return structuredClone(cached) as T;
    const startedAt = Date.now();
    this.updateGenerationMetadata(gameId, phase, 1);

    if (this.onGenerationProgress) this.onGenerationProgress(gameId, {
      phase,
      attempt: 1,
      elapsedMs: 0
    });

    const stepController = new AbortController();
    const stepTimeout = setTimeout(() => {
        console.warn(`[ORCHESTRATOR] Step ${stepName} timeout reached for game ${gameId}`);
        stepController.abort();
    }, this.STEP_TIMEOUT_MS);

    // Link global signal to step controller
    const abortHandler = () => stepController.abort();
    globalSignal.addEventListener('abort', abortHandler, { once: true });
    if (globalSignal.aborted) stepController.abort();

    try {
      const result = await task(stepController.signal);
      stepController.signal.throwIfAborted();
      const current = this.store.getById(gameId);
      if (!current || current.state !== GameStates.GENERATING) throw new Error('Generació cancel·lada.');
      if (current.generationCheckpoint) {
        current.generationCheckpoint.steps[stepName] = structuredClone(result);
        this.store.save(current);
      }
      const endedAt = Date.now();

      telemetryService.record({
        gameId, phase, stepLabel: stepName, stepName: 'orch:' + stepName, attempt: 1,
        startAt: startedAt, endAt: endedAt, durationMs: endedAt - startedAt,
        outcome: 'success', model: 'orchestrator'
      });

      return result;
    } catch (err: any) {
      const endedAt = Date.now();
      const isAbort = globalSignal.aborted || stepController.signal.aborted;
      const outcome = isAbort ? 'aborted' : (err.message?.includes('timeout') ? 'timeout' : 'error');

      telemetryService.record({
        gameId, phase, stepLabel: stepName, stepName: 'orch:' + stepName, attempt: 1,
        startAt: startedAt, endAt: endedAt, durationMs: endedAt - startedAt,
        outcome, model: 'orchestrator', errorMessage: err.message
      });

      if (globalSignal.aborted) throw new Error('Global generation timeout exceeded');
      if (stepController.signal.aborted) throw new Error(`Step ${stepName} timeout`);
      throw err;
    } finally {
      clearTimeout(stepTimeout);
      globalSignal.removeEventListener('abort', abortHandler);
    }
  }

  private updateGenerationMetadata(gameId: string, phase: GenerationPhase, attempt: number) {
    const game = this.store.getById(gameId);
    if (game) {
      game.generationPhase = phase;
      game.generationStepStartedAt = Date.now();
      game.generationAttempts = attempt;
      game.updatedAt = nowIso();
      this.store.save(game);
    }
  }

  private persistPartialData(gameId: string, data: Partial<Game>) {
    const game = this.store.getById(gameId);
    if (game) {
      Object.assign(game, data);
      game.updatedAt = nowIso();
      this.store.save(game);

      const gameInfo = this.getGameStateInfo(game);
      if (this.onGameStateChange) this.onGameStateChange(gameId, gameInfo);
    }
  }

  private mapToCharacters(aiCharacters: AIServiceCharacter[], assassinName: string): Character[] {
    return aiCharacters.map(c => ({
      id: generateId(),
      ...c,
      isAssassin: c.name?.trim().toLowerCase() === assassinName?.trim().toLowerCase()
    }));
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private shuffle<T>(array: T[]): T[] {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArray[i], newArray[j]] = [newArray[j] as T, newArray[i] as T];
    }
    return newArray;
  }

  private finalizeGame(gameId: string, caseData: FullCase) {
    const game = this.store.getById(gameId);
    if (!game) return;

    // Use already persisted solution/murder seed if available
    game.murder = {
      killerPlayerId: game.murder?.killerPlayerId || '',
      weapon: caseData.weapon,
      location: caseData.location,
      victim: caseData.victim,
      crimeWindow: caseData.crimeWindow
    };

    game.introNarrative = caseData.introductionNarrative;
    game.solution = {
      assassin: caseData.assassin,
      weapon: caseData.weapon,
      location: caseData.location,
      victimName: caseData.victim,
      finalNarrative: caseData.solutionNarrative
    };

    const characters = this.mapToCharacters(caseData.characters, caseData.assassin);
    game.characters = characters;

    // Logic character-to-player assignment by name
    game.players.forEach(p => {
      const char = characters.find(c => c.name.trim().toLowerCase() === p.nickname.trim().toLowerCase());
      if (char) {
        p.characterId = char.id;
        if (char.isAssassin) {
          game.assassinCharacterId = char.id;
          game.murder!.killerPlayerId = p.id;
          game.solution!.assassinId = p.id;
        }
      }
    });

    const allClues: Clue[] = [];
    Object.entries(caseData.clues).forEach(([roundKey, cluesForRound]) => {
      const roundNum = parseInt(roundKey.replace('round', ''));
      if (isNaN(roundNum)) return;

      cluesForRound.forEach((c: AIServiceClue) => {
        allClues.push({
          id: generateId(),
          type: c.type || 'rumor',
          text: c.text || 'Pista no disponible temporalment',
          isTrue: typeof c.isTrue === 'boolean' ? c.isTrue : true,
          roundNumber: roundNum,
          createdAt: nowIso()
        });
      });
    });
    game.clues = allClues;

    game.generationCheckpoint = undefined;
    game.generationError = undefined;
    game.generationPhase = GenerationPhases.DONE;
    game.state = GameStates.PLAYER_INFO;
    game.updatedAt = nowIso();
    this.store.save(game);

    if (this.onGenerationProgress) this.onGenerationProgress(gameId, {
      phase: GenerationPhases.DONE,
      attempt: 1,
      elapsedMs: 0
    });

    const gameInfo = this.getGameStateInfo(game);
    if (this.onGameStateChange) this.onGameStateChange(gameId, gameInfo);
  }

  private handleFailure(gameId: string, error: string) {
    const game = this.store.getById(gameId);
    if (game) {
      game.state = GameStates.LOBBY;
      game.generationPhase = GenerationPhases.FAILED;
      game.generationError = error;
      game.updatedAt = nowIso();
      this.store.save(game);

      const gameInfo = this.getGameStateInfo(game);
      if (this.onGameStateChange) this.onGameStateChange(gameId, gameInfo);

      if (this.onGenerationProgress) this.onGenerationProgress(gameId, {
        phase: GenerationPhases.FAILED,
        attempt: game.generationAttempts || 1,
        elapsedMs: 0,
        error
      });
    }
  }

  private getGameStateInfo(game: Game) {
    return {
      gameId: game.id,
      state: game.state,
      status: game.state,
      playersCount: game.players.length,
      charactersCount: game.characters.length,
      roundNumber: game.roundNumber,
      nextSequenceId: game.nextSequenceId,
      maxRounds: game.maxRounds,
      difficulty: game.difficulty,
      winnerType: game.winnerType,
      generationPhase: game.generationPhase,
      generationError: game.generationError
    };
  }
}
