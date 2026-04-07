import { generateId } from '../utils/id';
import {
  Game, Character, Player, Clue, ClueType, GameState, GameStates,
  GenerationPhase, GenerationPhases, FullCase, AIServiceClue, AIServiceCharacter,
  DetectiveMatrix, Alibi, Difficulty
} from '../types/game.types';
import { GameStoreService } from './game-store.service';
import { AIService } from './AIService';
import { nowIso } from '../utils/id';
import { telemetryService } from './telemetry.service';
import { errorLogger } from '../utils/error-logger';
import { env } from '../config/env';
import { buildDetectiveMatrix } from '../game/detective-matrix';
import { validateCase } from '../game/case-validation';

export class CaseOrchestratorService {
  private STEP_TIMEOUT_MS = env.GENERATION_STEP_TIMEOUT_MS || 90000;
  private GLOBAL_TIMEOUT_MS = env.GENERATION_GLOBAL_TIMEOUT_MS || 600000;

  constructor(
    private store: GameStoreService,
    private aiService: AIService,
    private onGameStateChange?: (gameId: string, state: any) => void,
    private onGenerationProgress?: (gameId: string, progress: any) => void
  ) {}

  public setGenerationProgressListener(listener: (gameId: string, progress: any) => void) {
    this.onGenerationProgress = listener;
  }

  public setGameStateChangeListener(listener: (gameId: string, state: any) => void) {
    this.onGameStateChange = listener;
  }

  public async generateCase(gameId: string, maxRounds: number = 3) {
    const game = this.store.getById(gameId);
    if (!game) return;

    const difficulty = game.difficulty || 'hard';
    const globalStartTime = Date.now();
    const globalController = new AbortController();
    const globalTimeout = setTimeout(() => {
        console.error(`[ORCHESTRATOR] Global timeout reached for game ${gameId}`);
        globalController.abort();
    }, this.GLOBAL_TIMEOUT_MS);

    try {
      // 1. SKELETON
      const skeleton = await this.executeStep<Partial<FullCase>>(
        gameId,
        GenerationPhases.SKELETON,
        "skeleton",
        (sig) => this.aiService.generateCaseSkeleton(gameId, difficulty, sig),
        globalController.signal
      );

      let fullCase: Partial<FullCase> = {
        ...skeleton,
        clues: {}
      };

      // Immediate persistence of solution seed
      this.persistPartialData(gameId, {
        murder: {
          killerPlayerId: '', // To be filled in finalize
          weapon: skeleton.weapon || '',
          location: skeleton.location || '',
          victim: skeleton.victim || '',
          crimeWindow: skeleton.crimeWindow || { start: "20:00", end: "21:00" }
        },
        solution: {
          assassin: skeleton.assassin || '',
          weapon: skeleton.weapon || '',
          location: skeleton.location || '',
          victimName: skeleton.victim || '',
          finalNarrative: ''
        }
      });

      // 2. CHARACTERS
      const basicCharacters = await this.executeStep<AIServiceCharacter[]>(
        gameId,
        GenerationPhases.CHARACTERS,
        "characters_basic",
        (sig) => this.aiService.generateBasicCharacters(gameId, game.players.map(p => p.nickname), skeleton.assassin || '', skeleton.victim || '', difficulty, sig),
        globalController.signal
      );

      const enrichedCharacters = await this.executeStep<AIServiceCharacter[]>(
        gameId,
        GenerationPhases.CHARACTERS,
        "characters_enrich",
        (sig) => this.aiService.enrichCharacters(gameId, basicCharacters, fullCase as FullCase, difficulty, sig),
        globalController.signal
      );
      fullCase.characters = enrichedCharacters;

      // 3. NARRATIVES
      const narratives = await this.executeStep<{ introductionNarrative: string; solutionNarrative: string }>(
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

      this.finalizeGame(gameId, fullCase as FullCase, maxRounds);
      const totalTimeMs = Date.now() - globalStartTime;
      console.log("[GENERATION] Total time:", totalTimeMs, "ms");
      telemetryService.setTotalTime(gameId, totalTimeMs);

    } catch (error: any) {
      const totalTimeMs = Date.now() - globalStartTime;
      console.log("[GENERATION] Total time:", totalTimeMs, "ms");
      telemetryService.setTotalTime(gameId, totalTimeMs);

      console.error(`[ORCHESTRATOR ERROR] Game ${gameId}: `, error.message);
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

  private mapToCharacters(aiCharacters: AIServiceCharacter[], assassinName: string): Character[] {
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

  private shuffle<T>(array: T[]): T[] {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArray[i], newArray[j]] = [newArray[j] as T, newArray[i] as T];
    }
    return newArray;
  }

  private finalizeGame(gameId: string, caseData: FullCase, maxRounds: number) {
    const game = this.store.getById(gameId);
    if (!game) return;

    // 1. Initial Mapping
    const characters = this.mapToCharacters(caseData.characters, caseData.assassin);
    game.characters = characters;

    // 2. Assign Alibis (Deterministic)
    const locations = ['Celler', 'Cuina', 'Jardí', 'Habitació', 'Sala', 'Garate', 'Biblioteca'];
    const killer = characters.find(c => c.isAssassin);

    // Pick 1-2 liars including killer
    const innocentCharacters = characters.filter(c => !c.isAssassin);
    const shuffledInnocents = this.shuffle(innocentCharacters);
    const additionalLiar = shuffledInnocents[0];

    characters.forEach(char => {
        const isLiar = char.isAssassin || char.id === additionalLiar?.id;
        char.alibi = {
            location: locations[Math.floor(Math.random() * locations.length)],
            timeStart: 2000,
            timeEnd: 2100,
            witnessId: isLiar ? undefined : shuffledInnocents.find(i => i.id !== char.id)?.id,
            credibility: char.isAssassin ? 0 : (isLiar ? 1 : 2),
            isLie: isLiar
        };
    });

    // 3. Generate Clues (Backend Logic)
    const generatedClues: Clue[] = [];

    // 2 Facts about killer
    if (killer) {
        for (let i = 0; i < 2; i++) {
            generatedClues.push({
                id: generateId(),
                type: 'evidence',
                text: `S'ha trobat un rastre que apunta directament a ${killer.name}.`,
                isTrue: true,
                truth: true,
                subjects: [killer.id],
                weight: 2,
                roundNumber: 1 + i,
                createdAt: nowIso()
            });
        }
    }

    // 2 Contradictions
    characters.filter(c => c.alibi?.isLie).forEach((liar, idx) => {
        if (idx < 2) {
            generatedClues.push({
                id: generateId(),
                type: 'contradiction',
                text: `La coartada de ${liar.name} no s'aguanta per enlloc.`,
                isTrue: true,
                truth: false,
                subjects: [liar.id],
                weight: 1,
                roundNumber: 1 + idx,
                createdAt: nowIso()
            });
        }
    });

    // 2 Timeline clues
    characters.slice(0, 2).forEach((char, idx) => {
        generatedClues.push({
            id: generateId(),
            type: 'witness',
            text: `Algú va veure a ${char.name} a prop de la zona a les 20:30.`,
            isTrue: true,
            truth: true,
            subjects: [char.id],
            weight: 1,
            roundNumber: 1 + idx,
            createdAt: nowIso()
        });
    });

    // 1 Misleading
    const randomInnocent = shuffledInnocents[1] || shuffledInnocents[0];
    if (randomInnocent) {
        generatedClues.push({
            id: generateId(),
            type: 'rumor',
            text: `Es diu que ${randomInnocent.name} tenia un deute pendent.`,
            isTrue: false,
            truth: false,
            subjects: [randomInnocent.id],
            weight: 0,
            roundNumber: 3,
            createdAt: nowIso()
        });
    }

    // Mix with AI descriptions if available
    const aiClues: AIServiceClue[] = [];
    Object.values(caseData.clues).forEach(roundClues => {
        aiClues.push(...roundClues);
    });

    generatedClues.forEach((clue, idx) => {
        if (aiClues[idx]) {
            clue.text = aiClues[idx].text;
        }
    });

    game.clues = generatedClues;

    // 4. Build Matrix
    const matrix = buildDetectiveMatrix({
        characters,
        clues: generatedClues
    });
    game.detectiveMatrix = matrix;

    // 5. Validate
    const validation = validateCase({
        characters,
        clues: generatedClues,
        matrix
    });

    if (!validation.valid) {
        console.error("[ORCHESTRATOR] Validation failed:", validation.errors);
        throw new Error("CASE_VALIDATION_FAILED: " + validation.errors.join(", "));
    }

    // Finalize state
    game.murder = {
      killerPlayerId: game.murder?.killerPlayerId || '',
      weapon: caseData.weapon,
      location: caseData.location,
      victim: caseData.victim,
      crimeWindow: caseData.crimeWindow || { start: "20:00", end: "21:00" }
    };

    game.introNarrative = caseData.introductionNarrative;
    game.solution = {
      assassin: caseData.assassin,
      weapon: caseData.weapon,
      location: caseData.location,
      victimName: caseData.victim,
      finalNarrative: caseData.solutionNarrative
    };

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
