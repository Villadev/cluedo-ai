export type GameState = 'LOBBY' | 'GENERATING' | 'PLAYER_INFO' | 'PLAYING' | 'FINISHED';
export type WinnerType = 'INVESTIGATORS' | 'ASSASSIN';
export type Difficulty = 'easy' | 'medium' | 'hard' | 'extreme';

export interface GameResult {
  winner: WinnerType;
  killer: string;
  weapon: string;
  location: string;
  finalNarrative?: string;
}

export interface Coartada {
  location: string;
  timeStart: string;
  timeEnd: string;
  witness: string;
  credibility: 'alta' | 'mitjana' | 'baixa';
}

export interface PublicCharacterView {
  id: string;
  name: string;
  description: string;
  personality: string;
  possibleMotive: string;
  profession: string;
  secret: string;
  secretKnowledge: string;
  coartada: Coartada;
  rumor: string;
  relationships: string;
  tensions: string;
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
  isAssassin: boolean;
  isNpc?: boolean;
  type?: 'player' | 'npc';
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
}

export interface GameStateInfo {
  state: GameState;
  playersCount: number;
  charactersCount: number;
  roundNumber: number;
  maxRounds: number;
  difficulty: Difficulty;
  winnerType: WinnerType | null;
  result?: GameResult;
}

export interface GameSolution {
  assassinId?: string;
  assassin: string;
  weapon: string;
  location: string;
  victimName: string;
  finalNarrative: string;
  message?: string;
}
