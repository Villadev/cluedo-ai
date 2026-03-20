import { Injectable, signal } from '@angular/core';
import { GameState, Difficulty } from '../models/player.model';

@Injectable({ providedIn: 'root' })
export class GameStateService {
  private readonly _state = signal<GameState | 'NONE'>('NONE');
  readonly state = this._state.asReadonly();

  private readonly _difficulty = signal<Difficulty>('hard');
  readonly difficulty = this._difficulty.asReadonly();

  setState(newState: GameState | 'NONE'): void {
    this._state.set(newState);
  }

  setDifficulty(newDifficulty: Difficulty): void {
    this._difficulty.set(newDifficulty);
  }

  getCurrentState(): GameState | 'NONE' {
    return this._state();
  }
}
