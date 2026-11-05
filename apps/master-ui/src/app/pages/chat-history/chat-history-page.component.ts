import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { auditTime, catchError, filter, map, merge, of, Subject, switchMap } from 'rxjs';
import { ChatViewComponent } from '../../components/chat-view/chat-view.component';
import { ChatHistoryMessage, GameApiService } from '../../services/game-api.service';
import { WebSocketService } from '../../services/websocket.service';

interface TrackingSnapshot {
  state: string;
  roundNumber: number;
  game: { maxRounds: number; chatHistory: ChatHistoryMessage[] };
  players: { id: string; nickname: string; type: string; askedThisRound: boolean; accusedThisRound: boolean; isEliminated?: boolean }[];
  clues: { id: string; text: string; roundNumber: number }[];
}

@Component({
  selector: 'app-chat-history-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ChatViewComponent],
  template: `
    <main class="history-page">
      <header>
        <h1>Seguiment de partida</h1>
        <a routerLink="/control-center">Tornar al centre de control</a>
      </header>
      @if (gameId(); as id) {
        @if (snapshot(); as game) {
          <section class="panel round" aria-labelledby="round-title">
            <h2 id="round-title">Ronda {{ game.roundNumber }} de {{ game.game.maxRounds }}</h2>
            @if (game.state === 'PLAYING') {
              <details>
                <summary>{{ actedCount() }} de {{ activePlayers().length }} participants han actuat</summary>
                <ul>
                  @for (player of activePlayers(); track player.id) {
                    <li>{{ player.nickname }} · {{ player.accusedThisRound ? 'Ha fet una acusació' : player.askedThisRound ? 'Ha preguntat' : 'Pendent' }}</li>
                  }
                </ul>
              </details>
              <button type="button" (click)="forceRound(id)" [disabled]="advancing()">
                {{ advancing() ? 'Avançant…' : game.roundNumber >= game.game.maxRounds ? 'Finalitzar partida' : 'Forçar ronda' }}
              </button>
            }
            @if (actionError()) { <p role="alert">{{ actionError() }}</p> }
          </section>
        } @else if (snapshot() === null) {
          <p role="alert">No s’ha pogut carregar el seguiment de la partida.</p>
          <button type="button" (click)="refresh.next()">Tornar-ho a provar</button>
        }
        <nav class="view-switch" aria-label="Vista de seguiment">
          <button type="button" [attr.aria-pressed]="view() === 'chat'" (click)="view.set('chat')">Xat</button>
          <button type="button" [attr.aria-pressed]="view() === 'clues'" (click)="view.set('clues')">Pistes</button>
        </nav>
        <div class="columns" [class.show-clues]="view() === 'clues'">
          <div class="chat"><app-chat-view [gameId]="id" /></div>
          <section class="panel clues" aria-labelledby="clues-title" tabindex="0">
            <h2 id="clues-title">Pistes</h2>
            @for (group of clueGroups(); track group.round) {
              <h3>Ronda {{ group.round }}</h3>
              <ol>
                @for (clue of group.entries; track clue.id) {
                  <li>
                    <strong>{{ clue.published ? 'Publicada' : 'Pendent' }}</strong>
                    <p>{{ clue.text }}</p>
                  </li>
                }
              </ol>
            } @empty {
              <p>Encara no hi ha pistes preparades.</p>
            }
          </section>
        </div>
      } @else {
        <p>No hi ha cap partida activa.</p>
      }
    </main>
  `,
  styles: [`
    .history-page { max-width: 1250px; margin: auto; padding: clamp(1rem, 3vw, 2.5rem); }
    header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; }
    h2 { margin-top: 0; font-size: 1.15rem; }
    .panel { min-width: 0; background: var(--surface-card); border: 1px solid var(--surface-border); border-radius: 16px; padding: 1rem; }
    .round { margin-bottom: 1rem; }
    summary { cursor: pointer; margin-bottom: .75rem; }
    .columns { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 1rem; align-items: start; }
    .clues { max-height: 80vh; overflow: auto; overscroll-behavior: contain; overflow-wrap: anywhere; }
    .clues li + li { margin-top: .75rem; }
    .clues p { margin: .25rem 0; }
    button { border: 1px solid var(--surface-border); border-radius: .6rem; padding: .65rem 1rem; background: var(--surface-hover); color: var(--master-blue); cursor: pointer; }
    button[aria-pressed='true'] { background: var(--primary-color); color: var(--primary-color-text); }
    .view-switch { display: none; }
    @media (max-width: 760px) {
      .view-switch { display: flex; gap: .5rem; margin-bottom: 1rem; }
      .columns { display: block; }
      .columns:not(.show-clues) .clues, .show-clues .chat { display: none; }
    }
  `]
})
export class ChatHistoryPageComponent {
  private readonly api = inject(GameApiService);
  private readonly socket = inject(WebSocketService);
  protected readonly gameId = this.api.gameId;
  protected readonly view = signal<'chat' | 'clues'>('chat');
  protected readonly advancing = signal(false);
  protected readonly actionError = signal('');
  protected readonly refresh = new Subject<void>();
  protected readonly snapshot = toSignal(toObservable(this.gameId).pipe(
    switchMap(id => {
      if (!id) return of(null);
      this.socket.connect(id);
      return merge(
        of(null),
        this.refresh,
        this.socket.events$.pipe(
          filter(({ event }) => ['game_state_update', 'game_state_updated', 'resync_data'].includes(event)),
          auditTime(100)
        )
      ).pipe(switchMap(() => this.api.getDebug(id).pipe(
        map(response => response.success ? response.data as TrackingSnapshot : null),
        catchError(() => of(null))
      )));
    })
  ));
  protected readonly activePlayers = computed(() =>
    this.snapshot()?.players.filter(player => player.type === 'real' && !player.isEliminated) ?? []
  );
  protected readonly actedCount = computed(() =>
    this.activePlayers().filter(player => player.askedThisRound || player.accusedThisRound).length
  );

  protected readonly clueGroups = computed(() => {
    const snapshot = this.snapshot();
    if (!snapshot) return [];
    const rounds = [...new Set(snapshot.clues.map(clue => clue.roundNumber))].sort((a, b) => a - b);
    return rounds.map(round => {
      const published = snapshot.game.chatHistory.filter(message => message.type === 'clue' && message.roundNumber === round);
      const legacy = published.filter(message => !message.clueId);
      const entries = snapshot.clues.filter(clue => clue.roundNumber === round).map(clue => {
        const message = published.find(entry => entry.clueId === clue.id) ?? legacy.shift();
        return { id: clue.id, text: message?.message ?? clue.text, published: !!message, order: message?.sequenceId };
      });
      entries.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
      return { round, entries };
    });
  });

  protected forceRound(id: string): void {
    const game = this.snapshot();
    if (!game || game.state !== 'PLAYING' || this.advancing()) return;
    if (game.roundNumber >= game.game.maxRounds && !window.confirm('Vols finalitzar la partida?')) return;
    this.advancing.set(true);
    this.actionError.set('');
    this.api.forceNextRound(id).subscribe({
      next: response => {
        if (!response.success) this.actionError.set('No s’ha pogut avançar la ronda.');
        this.advancing.set(false);
        this.refresh.next();
      },
      error: () => {
        this.actionError.set('No s’ha pogut avançar la ronda.');
        this.advancing.set(false);
        this.refresh.next();
      }
    });
  }
}
