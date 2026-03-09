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

export interface Character {
  id: string;
  name: string;
  description: string;
  personality: string;
  secrets: string;
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

export interface PublicCharacterView {
  id: string;
  name: string;
  description: string;
  personality: string;
}

export interface PublicClueView {
  id: string;
  playerId: string;
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
  explanation: string;
}
