import { AIService } from './AIService.js';
import { GameStoreService } from './game-store.service.js';
import {
  FullCase,
  Difficulty,
  GenerationPhase,
  GenerationPhases,
  Game,
  GameStates,
  Character,
  Clue,
  AIServiceClue,
  AIServiceCharacter
} from '../types/game.types.js';
import { emitGenerationProgress, emitGameStateUpdate } from '../websocket/socket.js';
import { generateId, nowIso } from '../utils/id.js';
import { env } from '../config/env.js';

export class CaseOrchestratorService {
  private readonly STEP_TIMEOUT_MS = env.GENERATION_STEP_TIMEOUT_MS;
  private readonly GLOBAL_TIMEOUT_MS = env.GENERATION_GLOBAL_TIMEOUT_MS;

  constructor(
    private aiService: AIService,
    private store: GameStoreService
  ) {}

  public async generateCase(gameId: string): Promise<void> {
    const game = this.store.getById(gameId);
    if (!game) throw new Error('Game not found');

    const expectedCount = game.players.length;
    const difficulty = game.difficulty;
    const maxRounds = game.maxRounds;

    const globalController = new AbortController();
    const globalTimeout = setTimeout(() => {
      console.warn(`[ORCHESTRATOR] Global timeout reached for game ${gameId}`);
      globalController.abort();
    }, this.GLOBAL_TIMEOUT_MS);

    try {
      // 1. SKELETON
      let fullCase = await this.executeStep<Partial<FullCase>>(
        gameId,
        GenerationPhases.SKELETON,
        (sig) => this.aiService.generateCaseSkeleton(difficulty, sig),
        globalController.signal
      );

      // Early persistence of solution seed
      this.persistPartialData(gameId, {
        murder: {
          killerPlayerId: '',
          weapon: fullCase.weapon || '',
          location: fullCase.location || '',
          victim: fullCase.victim || '',
          crimeWindow: fullCase.crimeWindow
        },
        solution: {
          assassin: fullCase.assassin || '',
          weapon: fullCase.weapon || '',
          location: fullCase.location || '',
          victimName: fullCase.victim || '',
          finalNarrative: ''
        }
      });

      // 2. CHARACTERS BASIC
      const basicCharacters = await this.executeStep<Partial<AIServiceCharacter>[]>(
        gameId,
        GenerationPhases.CHARACTERS,
        (sig) => this.aiService.generateBasicCharacters(fullCase, expectedCount, difficulty, sig),
        globalController.signal
      );

      // CHARACTERS ENRICH
      const aiCharacters = await this.executeStep<AIServiceCharacter[]>(
        gameId,
        GenerationPhases.CHARACTERS,
        (sig) => this.aiService.enrichCharacters(fullCase, basicCharacters, difficulty, sig),
        globalController.signal
      );

      fullCase.characters = aiCharacters;

      // Immediate persistence of characters
      this.persistPartialData(gameId, {
        characters: this.mapToCharacters(aiCharacters, fullCase.assassin || '')
      });

      // 3. NARRATIVES
      const narratives = await this.executeStep<{ introductionNarrative: string, solutionNarrative: string }>(
        gameId,
        GenerationPhases.NARRATIVES,
        (sig) => this.aiService.generateNarratives(fullCase as FullCase, difficulty, sig),
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
        (sig) => this.aiService.generateCluesByRounds(fullCase as FullCase, maxRounds, difficulty, sig),
        globalController.signal
      );
      fullCase.clues = clues;

      // 5. RECOVERY
      const missingRounds = this.aiService.validateClueCoverage(fullCase as FullCase, maxRounds);
      if (missingRounds.length > 0) {
        const recoveredClues = await this.executeStep<FullCase>(
          gameId,
          GenerationPhases.RECOVERY,
          (sig) => this.aiService.recoverMissingClues(fullCase as FullCase, missingRounds, difficulty, sig),
          globalController.signal
        );
        fullCase = recoveredClues;
      }

      this.finalizeGame(gameId, fullCase as FullCase);

    } catch (error: any) {
      console.error(`[ORCHESTRATOR ERROR] Game ${gameId}:`, error.message);
      this.handleFailure(gameId, error.message || 'Error desconegut durant la generació');
    } finally {
      clearTimeout(globalTimeout);
    }
  }

  private async executeStep<T>(
    gameId: string,
    phase: GenerationPhase,
    task: (sig: AbortSignal) => Promise<T>,
    globalSignal: AbortSignal
  ): Promise<T> {
    const stepStartTime = Date.now();

    this.updateGenerationMetadata(gameId, phase, 1);
    emitGenerationProgress(gameId, {
      phase,
      attempt: 1,
      elapsedMs: 0
    });

    const stepController = new AbortController();
    const stepTimeout = setTimeout(() => {
        console.warn(`[ORCHESTRATOR] Step ${phase} timeout reached for game ${gameId}`);
        stepController.abort();
    }, this.STEP_TIMEOUT_MS);

    // Link global signal to step controller
    const abortHandler = () => stepController.abort();
    globalSignal.addEventListener('abort', abortHandler);

    try {
      const result = await task(stepController.signal);
      return result;
    } catch (err: any) {
      if (globalSignal.aborted) throw new Error('Global generation timeout exceeded');
      if (stepController.signal.aborted) throw new Error(`Step ${phase} timeout`);
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
      emitGameStateUpdate(gameId, gameInfo);
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

    game.players.forEach((p, i) => {
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

    emitGenerationProgress(gameId, {
      phase: GenerationPhases.DONE,
      attempt: 1,
      elapsedMs: 0
    });

    const gameInfo = this.getGameStateInfo(game);
    emitGameStateUpdate(gameId, gameInfo);
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
      emitGameStateUpdate(gameId, gameInfo);

      emitGenerationProgress(gameId, {
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
