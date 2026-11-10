import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { auditTime, catchError, filter, map, merge, of, Subject, switchMap } from 'rxjs';
import { ChatViewComponent } from '../../components/chat-view/chat-view.component';
import { ChatHistoryMessage, GameApiService, TrackedClue } from '../../services/game-api.service';
import { WebSocketService } from '../../services/websocket.service';

interface TrackingSnapshot {
  state: string;
  roundNumber: number;
  game: { maxRounds: number; chatHistory: ChatHistoryMessage[] };
  players: { id: string; nickname: string; type: string; askedThisRound: boolean; accusedThisRound: boolean; isEliminated?: boolean }[];
  clues: TrackedClue[];
}

@Component({
  selector: 'app-chat-history-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ChatViewComponent, DatePipe],
  templateUrl: './chat-history-page.component.html',
  styleUrl: './chat-history-page.component.scss'
})
export class ChatHistoryPageComponent {
  private readonly api = inject(GameApiService);
  private readonly socket = inject(WebSocketService);
  protected readonly gameId = this.api.gameId;
  protected readonly view = signal<'chat' | 'clues'>('chat');
  protected readonly advancing = signal(false);
  protected readonly revealing = signal<string | null>(null);
  protected readonly clueError = signal('');
  protected readonly announcement = signal('');
  private readonly expandedRounds = signal<Record<string, boolean>>({});
  protected readonly clueTitles: Record<TrackedClue['type'], string> = {
    witness: 'Testimoni o coartada', evidence: 'Prova del cas',
    contradiction: 'Contradicció', rumor: 'Rumor'
  };
  protected readonly clueImplications: Record<TrackedClue['type'], string> = {
    witness: 'Cal contrastar aquesta declaració amb altres testimonis o proves.',
    evidence: 'Compareu aquesta informació amb les coartades i la resta de proves.',
    contradiction: 'Permet contrastar versions dels fets que no coincideixen.',
    rumor: 'És una informació que cal verificar abans de treure conclusions.'
  };
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
          filter(({ event }) => ['game_state_update', 'game_state_updated', 'resync_data', 'chat_message'].includes(event)),
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
    const rounds = [...new Set([
      ...Array.from({ length: snapshot.game.maxRounds }, (_, index) => index + 1),
      ...snapshot.clues.map(clue => clue.roundNumber)
    ])].sort((a, b) => a - b);
    return rounds.map(round => {
      const published = snapshot.game.chatHistory.filter(message => message.type === 'clue');
      const legacy = published.filter(message => !message.clueId && message.roundNumber === round);
      const entries = snapshot.clues.filter(clue => clue.roundNumber === round).map(clue => {
        const message = published.find(entry => entry.clueId === clue.id) ?? legacy.shift();
        return { ...clue, text: message?.message ?? clue.text,
          published: clue.revealedAt !== undefined || !!message,
          revealedAt: clue.revealedAt ?? message?.timestamp,
          revealedRound: clue.revealedRound ?? message?.roundNumber };
      });
      return { round, entries, shown: entries.filter(clue => clue.published).length,
        pending: entries.filter(clue => !clue.published).length };
    });
  });
  protected readonly shownCount = computed(() => this.clueGroups().reduce((total, group) => total + group.shown, 0));
  protected readonly pendingCount = computed(() => this.clueGroups().reduce((total, group) => total + group.pending, 0));
  protected readonly nextClue = computed(() => this.clueGroups().flatMap(group => group.entries).find(clue => !clue.published));

  protected isRoundOpen(round: number): boolean {
    return this.expandedRounds()[`${this.gameId()}:${round}`] ?? round === this.snapshot()?.roundNumber;
  }

  protected toggleRound(round: number): void {
    const open = this.isRoundOpen(round);
    this.expandedRounds.update(rounds => ({ ...rounds, [`${this.gameId()}:${round}`]: !open }));
  }

  protected revealClue(id: string, clueId: string): void {
    if (this.snapshot()?.state !== 'PLAYING' || this.revealing() || this.advancing()) return;
    this.revealing.set(clueId);
    this.clueError.set('');
    this.announcement.set('');
    this.api.revealClue(id, clueId).subscribe({
      next: response => {
        if (!response.success) this.clueError.set(response.error || 'No s’ha pogut ensenyar la pista. Torna-ho a provar.');
        else this.announcement.set('Pista mostrada al xat de tots els participants.');
        this.revealing.set(null);
        this.refresh.next();
      },
      error: () => {
        this.clueError.set('No s’ha pogut confirmar la publicació. Revisem l’estat; pots tornar-ho a provar sense duplicar la pista.');
        this.revealing.set(null);
        this.refresh.next();
      }
    });
  }

  protected forceRound(id: string): void {
    const game = this.snapshot();
    if (!game || game.state !== 'PLAYING' || this.advancing() || this.revealing()) return;
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
