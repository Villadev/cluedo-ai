export interface Player {
  id: string;
  nickname: string;
  name?: string;
  description?: string;
}

export interface PublicPlayerState extends Player {
  askedThisRound: boolean;
  accusedThisRound: boolean;
  accusationCooldown: number;
  isEliminated: boolean;
}

export interface PublicGameState {
  id: string;
  players: PublicPlayerState[];
}
