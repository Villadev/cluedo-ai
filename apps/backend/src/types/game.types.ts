export type GameState = 'LOBBY' | 'READY' | 'PLAYING' | 'FINISHED';

export interface Turn {
  id: string;
  playerId: string;
  question: string;
  answer: string;
  createdAt: string;
}

export interface Clue {
  id: string;
  playerId: string;
  text: string;
  isTrue: boolean;
  roundNumber: number;
  createdAt: string;
}

export interface Murder {
  killerPlayerId: string;
  weapon: string;
  location: string;
  victim: string;
}

export interface Player {
  id: string;
  name: string;
  description: string;
  personality: string;
  publicCharacter: string;
  secretInfo: string;
  isKiller: boolean;
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
  murder: Murder | null;
  introNarrative: string | null;
  solution: {
    assassin: string;
    weapon: string;
    location: string;
    explanation: string;
  } | null;
  clues: Clue[];
  turns: Turn[];
  currentTurnIndex: number;
  roundNumber: number;
  tensionLevel: number;
  winnerPlayerId: string | null;
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

export interface PublicPlayerView {
  id: string;
  name: string;
  description: string;
  personality: string;
  publicCharacter: string;
  isReady: boolean;
  isEliminated: boolean;
  hasAccused: boolean;
  askedThisRound: boolean;
  accusedThisRound: boolean;
  accusationCooldown: number;
  secretInfo?: string;
  isKiller?: boolean;
}

export interface PublicGameView {
  id: string;
  state: GameState;
  players: PublicPlayerView[];
  clues: Clue[];
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
  explanation: string;
}
