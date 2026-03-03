export enum GameStatus {
  WAITING = 'WAITING',
  STARTED = 'STARTED',
  FINISHED = 'FINISHED'
}

export enum Role {
  MASTER = 'MASTER',
  PLAYER = 'PLAYER'
}

export interface Game {
  id: string;
  status: GameStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Card {
  id: string;
  type: string;
  value: string;
}

export interface Player {
  id: string;
  name: string;
  role: Role;
  cardId: string | null;
}

export interface GameStatePayload {
  game: Game;
  players: Player[];
}

export interface PlayerAssignedCardPayload {
  playerId: string;
  card: Card;
}
