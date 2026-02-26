import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GameStatus, Role, type Card, type GameStatePayload, type Player } from '@cluedo/types';
import { io, type Socket } from 'socket.io-client';

type ApiPlayerResponse = Player;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly apiBase = injectApiBase();
  private socket: Socket | null = null;

  protected playerName = '';
  protected gameState: GameStatus = GameStatus.WAITING;
  protected assignedCard: Card | null = null;
  protected players: Player[] = [];
  protected currentPlayer: Player | null = null;
  protected errorMessage = '';

  protected readonly gameStatus = GameStatus;

  public ngOnInit(): void {
    this.connectSocket();
    void this.fetchGameState();
  }

  public ngOnDestroy(): void {
    this.socket?.disconnect();
  }

  protected async joinGame(): Promise<void> {
    this.errorMessage = '';

    const trimmedName = this.playerName.trim();
    if (trimmedName.length < 2) {
      this.errorMessage = 'Name must contain at least 2 characters.';
      return;
    }

    const response = await fetch(`${this.apiBase}/api/players/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmedName, role: Role.PLAYER })
    });

    if (!response.ok) {
      const body = (await response.json()) as { message?: string };
      this.errorMessage = body.message ?? 'Could not join game';
      return;
    }

    const player = (await response.json()) as ApiPlayerResponse;
    this.currentPlayer = player;
    this.playerName = player.name;
    await this.fetchGameState();
  }

  private connectSocket(): void {
    this.socket = io(this.apiBase, {
      transports: ['websocket']
    });

    this.socket.on('game_state_updated', (payload: GameStatePayload) => {
      this.applyState(payload);
    });

    this.socket.on('game_started', (payload: GameStatePayload) => {
      this.applyState(payload);
    });

    this.socket.on('player_assigned_card', (payload: { playerId: string; card: Card }) => {
      if (this.currentPlayer && payload.playerId === this.currentPlayer.id) {
        this.assignedCard = payload.card;
      }
    });
  }

  private async fetchGameState(): Promise<void> {
    const response = await fetch(`${this.apiBase}/api/game/state`);
    if (!response.ok) {
      this.errorMessage = 'Failed to load game state.';
      return;
    }

    const payload = (await response.json()) as GameStatePayload;
    this.applyState(payload);
  }

  private applyState(payload: GameStatePayload): void {
    this.gameState = payload.game.status;
    this.players = payload.players;

    if (this.currentPlayer) {
      const updated = payload.players.find((player) => player.id === this.currentPlayer?.id) ?? null;
      this.currentPlayer = updated;
    }
  }
}

const injectApiBase = (): string => {
  const globalConfig = window as Window & {
    __API_BASE__?: string;
  };
  return globalConfig.__API_BASE__ ?? 'http://localhost:3000';
};
