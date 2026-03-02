export type GameStatus = 'WAITING' | 'STARTED' | 'ENDED';
export type Role = 'PLAYER' | 'MASTER';

export interface Player {
  id: string;
  name: string;
  role: Role;
}

export interface Card {
  id: string;
  name: string;
}

export interface Game {
  id: string;
  status: GameStatus;
  players: Player[];
}

export interface StoredPlayer extends Player {
  cardId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoredGame extends Game {
  createdAt: string;
  updatedAt: string;
}

export const db = {
  games: [] as StoredGame[],
  players: [] as StoredPlayer[],
  cards: [
    { id: 'card-1', name: 'Miss Scarlet' },
    { id: 'card-2', name: 'Colonel Mustard' },
    { id: 'card-3', name: 'Mrs. White' },
    { id: 'card-4', name: 'Mr. Green' },
    { id: 'card-5', name: 'Mrs. Peacock' },
    { id: 'card-6', name: 'Professor Plum' },
    { id: 'card-7', name: 'Candlestick' },
    { id: 'card-8', name: 'Dagger' },
    { id: 'card-9', name: 'Lead Pipe' },
    { id: 'card-10', name: 'Revolver' },
    { id: 'card-11', name: 'Rope' },
    { id: 'card-12', name: 'Wrench' },
    { id: 'card-13', name: 'Kitchen' },
    { id: 'card-14', name: 'Ballroom' },
    { id: 'card-15', name: 'Conservatory' },
    { id: 'card-16', name: 'Dining Room' },
    { id: 'card-17', name: 'Lounge' },
    { id: 'card-18', name: 'Hall' },
    { id: 'card-19', name: 'Study' },
    { id: 'card-20', name: 'Library' },
    { id: 'card-21', name: 'Billiard Room' }
  ] as Card[]
};

export const generateId = (): string => crypto.randomUUID();

export const nowIso = (): string => new Date().toISOString();
