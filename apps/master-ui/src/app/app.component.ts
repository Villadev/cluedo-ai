import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { GameStatus, type GameStatePayload, type Player } from '@cluedo/types';
import { io, type Socket } from 'socket.io-client';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly apiBase = injectApiBase();
  private socket: Socket | null = null;

  protected gameState: GameStatus = GameStatus.WAITING;
  protected players: Player[] = [];
  protected errorMessage = '';

  protected readonly gameStatus = GameStatus;

  public ngOnInit(): void {
    this.connectSocket();
    void this.fetchState();
  }

  public ngOnDestroy(): void {
    this.socket?.disconnect();
  }

  protected get canStart(): boolean {
    return this.gameState === GameStatus.WAITING && this.players.length >= 3;
  }

  protected async startGame(): Promise<void> {
    this.errorMessage = '';

    const response = await fetch(`${this.apiBase}/api/game/start`, {
      method: 'POST'
    });

    if (!response.ok) {
      const body = (await response.json()) as { message?: string };
      this.errorMessage = body.message ?? 'Failed to start game';
      return;
    }

    const payload = (await response.json()) as GameStatePayload;
    this.applyState(payload);
  }

  protected async refresh(): Promise<void> {
    await this.fetchState();
  }

  private connectSocket(): void {
    this.socket = io(this.apiBase, {
      transports: ['websocket']
    });

    this.socket.on('player_joined', (player: Player) => {
      const exists = this.players.some((current) => current.id === player.id);
      if (!exists) {
        this.players = [...this.players, player];
      }
    });

    this.socket.on('game_state_updated', (payload: GameStatePayload) => {
      this.applyState(payload);
    });

    this.socket.on('game_started', (payload: GameStatePayload) => {
      this.applyState(payload);
    });
  }

  private async fetchState(): Promise<void> {
    const response = await fetch(`${this.apiBase}/api/game/state`);
    if (!response.ok) {
      this.errorMessage = 'Failed to fetch game state';
      return;
    }

    const payload = (await response.json()) as GameStatePayload;
    this.applyState(payload);
  }

  private applyState(payload: GameStatePayload): void {
    this.gameState = payload.game.status;
    this.players = payload.players;
  }
}

const injectApiBase = (): string => {
  const globalConfig = window as Window & {
    __API_BASE__?: string;
  };
  return globalConfig.__API_BASE__ ?? 'http://localhost:3000';
};
