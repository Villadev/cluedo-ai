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
  Clue
} from '../types/game.types.js';
import { generateId } from '../utils/id.js';
import { env } from '../config/env.js';

const nowIso = () => new Date().toISOString();

export class CaseOrchestratorService {
  private readonly STEP_TIMEOUT_MS = env.GENERATION_STEP_TIMEOUT_MS;
  private readonly GLOBAL_TIMEOUT_MS = env.GENERATION_GLOBAL_TIMEOUT_MS;
  private readonly BATCH_SIZE = env.GENERATION_CHARACTER_BATCH_SIZE;

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

  public async generateCase(gameId: string, difficulty: Difficulty, maxRounds: number) {
    const globalStartTime = Date.now();
    const game = this.store.getById(gameId);
    if (!game) return;

    const globalController = new AbortController();
    const globalTimeout = setTimeout(() => {
        console.error(`[ORCHESTRATOR] Global generation timeout for game ${gameId}`);
        globalController.abort();
    }, this.GLOBAL_TIMEOUT_MS);

    try {
      let fullCase: Partial<FullCase> = {};

      // 1. SKELETON
      const skeleton = await this.executeStep<Partial<FullCase>>(
        gameId,
        GenerationPhases.SKELETON,
        "skeleton",
        (sig) => this.aiService.generateCaseSkeleton(gameId, difficulty, sig),
        globalController.signal
      );
      fullCase = { ...skeleton, characters: [], clues: {} };

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
      const allowedPlayerNames = game.players.map(p => p.nickname).filter(Boolean);

      const basicCharacters = await this.executeStep<Partial<AIServiceCharacter>[]>(
        gameId,
        GenerationPhases.CHARACTERS,
        "characters_basic",
        (sig) => this.aiService.generateBasicCharacters(gameId, fullCase, expectedCount, allowedPlayerNames, difficulty, sig),
        globalController.signal
      );

      // CHARACTERS ENRICH (Batched & Multi-pass)
      const characterChunks = this.chunkArray(basicCharacters, this.BATCH_SIZE);
      const enrichedChunks = await Promise.all(characterChunks.map((chunk, index) =>
        this.executeStep<Partial<AIServiceCharacter>[]>(
            gameId,
            GenerationPhases.CHARACTERS,
            `characters_enrich_batch_${index}`,
            (sig) => this.aiService.enrichCharacters(gameId, fullCase, chunk, difficulty, sig),
            globalController.signal
        )
      ));

      const enrichedCharacters = enrichedChunks.flat() as AIServiceCharacter[];
      fullCase.characters = enrichedCharacters;

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

      // 4. CLUES
      const clues = await this.executeStep<Record<string, AIServiceClue[]>>(
        gameId,
        GenerationPhases.CLUES,
        "clues",
        (sig) => this.aiService.generateCluesByRounds(gameId, fullCase as FullCase, maxRounds, difficulty, sig),
        globalController.signal
      );
      fullCase.clues = clues;

      // 5. RECOVERY
      const missingRounds = this.aiService.validateClueCoverage(fullCase as FullCase, maxRounds);
      if (missingRounds.length > 0) {
        const recoveredClues = await this.executeStep<FullCase>(
          gameId,
          GenerationPhases.RECOVERY,
          "recovery",
          (sig) => this.aiService.recoverMissingClues(gameId, fullCase as FullCase, missingRounds, difficulty, sig),
          globalController.signal
        );
        fullCase = recoveredClues;
      }

      this.finalizeGame(gameId, fullCase as FullCase);
      const totalTimeMs = Date.now() - globalStartTime;
      console.log("[GENERATION] Total time:", totalTimeMs, "ms");
      telemetryService.setTotalTime(gameId, totalTimeMs);

    } catch (error: any) {
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
      this.handleFailure(gameId, error.message || 'Error desconegut durant la generació');
    } finally {
      clearTimeout(globalTimeout);
    }
  }

  private async executeStep<T>(
    gameId: string,
    phase: GenerationPhase,
    stepName: string,
    task: (sig: AbortSignal) => Promise<T>,
    globalSignal: AbortSignal
  ): Promise<T> {
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
    globalSignal.addEventListener('abort', abortHandler);

    try {
      const result = await task(stepController.signal);
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

  private mapToCharacters(aiCharacters: any[], assassinName: string): Character[] {
    return aiCharacters.map(c => ({
      id: generateId(),
      name: c.name || 'Sense nom',
      profession: c.profession || 'Sense professió',
      description: c.description || 'Sense descripció',
      personality: c.personality || 'Sense personalitat',
      possibleMotive: c.possibleMotive || 'Sense motiu',
      secret: c.secret || 'Sense secret',
      secretKnowledge: c.secretKnowledge || 'Sense coneixement secret',
      coartada: c.coartada || { location: 'Desconeguda', timeStart: '00:00', timeEnd: '00:00', witness: 'Cap', credibility: 'baixa' },
      rumor: c.rumor || 'Cap rumor',
      relationships: c.relationships || 'Cap relació',
      tensions: c.tensions || 'Cap tensió',
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

    // Randomize character-to-player assignment
    const shuffledPlayers = this.shuffle(game.players);
    shuffledPlayers.forEach((p, i) => {
      const char = characters[i];
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
