export type GameState = 'LOBBY' | 'READY' | 'PLAYING' | 'FINISHED';

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
  isNpc?: boolean;
  type?: 'player' | 'npc';
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

export interface GameStateInfo {
  state: GameState;
  playersCount: number;
  charactersCount: number;
  roundNumber: number;
}
