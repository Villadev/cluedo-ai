export type GameState = 'LOBBY' | 'GENERATING' | 'PLAYER_INFO' | 'PLAYING' | 'FINISHED';

export const GameStates: Record<GameState, GameState> = {
  LOBBY: 'LOBBY',
  GENERATING: 'GENERATING',
  PLAYER_INFO: 'PLAYER_INFO',
  PLAYING: 'PLAYING',
  FINISHED: 'FINISHED'
};

export type GenerationPhase = 'IDLE' | 'SKELETON' | 'CHARACTERS' | 'NARRATIVES' | 'CLUES' | 'RECOVERY' | 'DONE' | 'FAILED';

export const GenerationPhases: Record<GenerationPhase, GenerationPhase> = {
  IDLE: 'IDLE',
  SKELETON: 'SKELETON',
  CHARACTERS: 'CHARACTERS',
  NARRATIVES: 'NARRATIVES',
  CLUES: 'CLUES',
  RECOVERY: 'RECOVERY',
  DONE: 'DONE',
  FAILED: 'FAILED'
};

export interface GameResult {
  winner: WinnerType;
  killer: string;
  weapon: string;
  location: string;
  finalNarrative?: string;
}

export type WinnerType = 'INVESTIGATORS' | 'ASSASSIN';
export type Difficulty = 'easy' | 'medium' | 'hard' | 'extreme';

export interface TimelineEvent {
  timestamp: string;
  type:
    | 'PLAYER_JOIN'
    | 'CHARACTER_ASSIGNED'
    | 'ROUND_START'
    | 'QUESTION'
    | 'CLUE'
    | 'ACCUSATION'
    | 'GAME_END'
    | 'STATE_CHANGE'
    | 'TTS_PLAYED'
    | 'CLUE_ROUND_REVEALED'
    | 'PLAYER_SECRET_ASSIGNED'
    | 'CRIME_TIME_WINDOW_GENERATED'
    | 'ALIBI_NETWORK_GENERATED'
    | 'ALIBI_CONTRADICTION_CREATED'
    | 'CHARACTER_COARTADA_ASSIGNED'
    | 'DIFFICULTY_CHANGED';
  playerId?: string;
  characterId?: string;
  roundNumber?: number;
  sequenceId?: number;
  text?: string;
  isTrue?: boolean;
  targetCharacterId?: string;
  success?: boolean;
  winnerPlayerId?: string;
  description: string;
}

export interface Turn {
  id: string;
  playerId: string;
  question: string;
  answer: string;
  createdAt: string;
}

export type ClueType = 'rumor' | 'witness' | 'contradiction' | 'evidence';

export interface Clue {
  id: string;
  playerId?: string; // Optional if pre-generated and not yet assigned
  type: ClueType;
  text: string;
  isTrue: boolean;
  roundNumber: number;
  createdAt: string;
}

export interface CrimeWindow {
  start: string;
  end: string;
}

export interface Murder {
  killerPlayerId: string;
  weapon: string;
  location: string;
  victim: string;
  crimeWindow?: CrimeWindow;
}

export interface Coartada {
  location: string;
  timeStart: string;
  timeEnd: string;
  witness: string;
  credibility: 'alta' | 'mitjana' | 'baixa';
}

export interface Character {
  id: string;
  name: string;
  profession: string;
  description: string;
  personality: string;
  possibleMotive: string;
  secret: string;
  secretKnowledge: string;
  coartada: Coartada;
  rumor: string;
  relationships: string;
  tensions: string;
  isAssassin: boolean;
}

export interface Player {
  id: string;
  nickname: string;
  characterId: string | null;
  isReady: boolean;
  isEliminated: boolean;
  hasAccused: boolean;
  askedThisRound: boolean;
  accusedThisRound: boolean;
  accusationCooldown: number;
  type: 'real' | 'npc';
}

export interface ChatMessage {
  type: 'player' | 'narrator' | 'system' | 'clue';
  playerId?: string;
  playerName?: string;
  roundNumber?: number;
  sequenceId?: number;
  message: string;
  timestamp: number;
}

export interface Question {
  playerId: string;
  playerName: string;
  question: string;
  timestamp: number;
  roundNumber: number;
  sequenceId: number;
}

export interface Game {
  id: string;
  state: GameState;
  players: Player[];
  characters: Character[];
  assassinCharacterId: string | null;
  murder: Murder | null;
  introNarrative: string | null;
  solution: GameSolution | null;
  clues: Clue[];
  turns: Turn[];
  currentTurnIndex: number;
  roundNumber: number;
  maxRounds: number;
  tensionLevel: number;
  difficulty: Difficulty;
  winnerPlayerId: string | null;
  winnerType: WinnerType | null;
  timeline: TimelineEvent[];
  chatHistory: ChatMessage[];
  questionHistory: Question[];
  nextSequenceId: number;
  createdAt: string;
  updatedAt: string;
  // Generation Phase Metadata
  generationPhase?: GenerationPhase;
  generationStepStartedAt?: number;
  generationAttempts?: number;
  generationError?: string;
}

export interface AskQuestionInput {
  playerId: string;
  question: string;
}

export interface AccusationInput {
  playerId: string;
  accusedPlayerId: string;
  weapon: string;
  location: string;
}

export interface PublicCharacterView {
  id: string;
  name: string;
  profession: string;
  description: string;
  personality: string;
  possibleMotive: string;
  secret: string;
  secretKnowledge: string;
  coartada: Coartada;
  rumor: string;
  relationships: string;
  tensions: string;
}

export interface PublicClueView {
  id: string;
  playerId?: string;
  type: ClueType;
  text: string;
  roundNumber: number;
  createdAt: string;
}

export interface PublicPlayerView {
  id: string;
  nickname: string;
  character?: PublicCharacterView;
  isReady: boolean;
  isEliminated: boolean;
  hasAccused: boolean;
  askedThisRound: boolean;
  accusedThisRound: boolean;
  accusationCooldown: number;
  isAssassin: boolean;
  type: 'real' | 'npc';
}

export interface PublicGameView {
  result?: GameResult;
  assassinId?: string;
  id: string;
  state: GameState;
  players: PublicPlayerView[];
  clues: PublicClueView[];
  currentTurnPlayerId: string | null;
  roundNumber: number;
  maxRounds: number;
  tensionLevel: number;
  difficulty: Difficulty;
  winnerPlayerId: string | null;
  winnerType: WinnerType | null;
  createdAt: string;
  updatedAt: string;
  nextSequenceId: number;
  // Generation Phase Metadata
  generationPhase?: GenerationPhase;
  generationStepStartedAt?: number;
  generationAttempts?: number;
  generationError?: string;
}

export interface PublicParticipant {
  id: string;
  publicCharacter: string;
}

export interface GameSolution {
  assassinId?: string;
  assassin: string;
  weapon: string;
  location: string;
  victimName: string;
  finalNarrative: string;
}

export interface AIServiceCharacter {
  name: string;
  profession: string;
  description: string;
  personality: string;
  possibleMotive: string;
  secret: string;
  secretKnowledge: string;
  coartada: Coartada;
  rumor: string;
  relationships: string;
  tensions: string;
}

export interface AIServiceClue {
  type: ClueType;
  text: string;
  isTrue: boolean;
}

export interface FullCase {
  victim: string;
  weapon: string;
  location: string;
  assassin: string;
  crimeWindow: CrimeWindow;
  characters: AIServiceCharacter[];
  introductionNarrative: string;
  solutionNarrative: string;
  difficulty?: Difficulty;
  clues: Record<string, AIServiceClue[]>;
}

export interface GenerationTelemetryEvent {
  gameId: string;
  phase: GenerationPhase;
  stepLabel: string;
  stepName: string;
  attempt: number;
  startAt: number;
  endAt: number;
  durationMs: number;
  outcome: 'success' | 'validation_failed' | 'timeout' | 'aborted' | 'error';
  errorMessage?: string;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  validationDetails?: {
    expectedCount?: number;
    returnedCount?: number;
    assassinExpected?: string;
    assassinMatched?: boolean;
  };
}

export interface GenerationTelemetrySummary {
  totalCalls: number;
  totalAttempts: number;
  avgDurationMs: number;
  p95DurationMs: number;
  totalValidationFailed: number;
  totalAborted: number;
  totalTimeouts: number;
  totalErrors: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
}

export interface GenerationTelemetry {
  events: GenerationTelemetryEvent[];
  summary: GenerationTelemetrySummary;
  totalTimeMs?: number;
}

export interface DebugData {
  game: Game;
  players: Player[];
  characters: Character[];
  clues: Clue[];
  roundNumber: number;
  nextSequenceId: number;
  state: GameState;
  generationPhase?: GenerationPhase;
  generationError?: string;
  generationAttempts?: number;
  errors: any[];
  generationTelemetry: GenerationTelemetry;
}
