import { Injectable, signal } from '@angular/core';
import { GameState } from './game-api.service';

@Injectable({ providedIn: 'root' })
export class GameStateService {
  private readonly _state = signal<GameState | 'NONE'>('NONE');
  readonly state = this._state.asReadonly();

  setState(newState: GameState | 'NONE'): void {
    this._state.set(newState);
  }

  getCurrentState(): GameState | 'NONE' {
    return this._state();
  }
}
