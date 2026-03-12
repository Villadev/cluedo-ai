export type GameState = 'LOBBY' | 'READY' | 'PLAYING' | 'FINISHED';

export const GameStates: Record<GameState, GameState> = {
  LOBBY: 'LOBBY',
  READY: 'READY',
  PLAYING: 'PLAYING',
  FINISHED: 'FINISHED'
};

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
    | 'CHARACTER_COARTADA_ASSIGNED';
  playerId?: string;
  characterId?: string;
  roundNumber?: number;
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
  tensionLevel: number;
  winnerPlayerId: string | null;
  timeline: TimelineEvent[];
  createdAt: string;
  updatedAt: string;
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
}

export interface PublicGameView {
  id: string;
  state: GameState;
  players: PublicPlayerView[];
  clues: PublicClueView[];
  currentTurnPlayerId: string | null;
  roundNumber: number;
  tensionLevel: number;
  winnerPlayerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicParticipant {
  id: string;
  publicCharacter: string;
}

export interface GameSolution {
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
  clues: {
    round1: AIServiceClue[];
    round2: AIServiceClue[];
    round3: AIServiceClue[];
    round4: AIServiceClue[];
  };
}
