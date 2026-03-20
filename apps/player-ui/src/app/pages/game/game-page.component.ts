import { AsyncPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal, ViewChild, ElementRef, AfterViewChecked, effect } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, tap } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ChatService } from '../../services/chat.service';
import { TtsService } from '../../services/tts.service';
import { GameService } from '../../services/game.service';
import { SessionService } from '../../services/session.service';
import { GameStatusIndicatorComponent } from '../../components/game-status-indicator/game-status-indicator.component';
import { WebSocketService } from '../../services/websocket.service';
import { GameState, PublicPlayerView } from '../../models/player.model';
import { GameStateService } from '../../services/game-state.service';
import { SocketGameEvent } from '../../models/chat.models';

@Component({
  selector: 'app-game-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    AsyncPipe,
    DatePipe,
    CardModule,
    GameStatusIndicatorComponent,
    InputTextareaModule,
    ButtonModule,
    ProgressSpinnerModule
  ],
  templateUrl: './game-page.component.html',
  styleUrl: './game-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GamePageComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('chatList') private chatListContainer!: ElementRef;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);
  private readonly websocketService = inject(WebSocketService);
  private readonly chatService = inject(ChatService);
  private readonly gameService = inject(GameService);
  private readonly sessionService = inject(SessionService);
  private readonly gameStateService = inject(GameStateService);
  protected readonly ttsService = inject(TtsService);
  private readonly subscriptions = new Subscription();

  protected readonly chatMessages$ = this.chatService.messages$.pipe(
    tap(() => this.scrollToBottomRequested = true)
  );
  protected readonly connected$ = this.websocketService.connected$;
  protected readonly reconnecting$ = this.websocketService.reconnecting$;
  protected readonly canAskQuestion$ = this.chatService.canAskQuestion$;

  protected readonly gameState = this.gameStateService.state;
  protected readonly askedThisRound = signal<boolean>(false);
  protected readonly currentRound = signal<number>(1);
  protected readonly maxRounds = signal<number>(5);
  protected readonly winnerType = signal<string | null>(null);
  protected gameId = '';
  protected playerId = '';

  private scrollToBottomRequested = false;

  protected readonly questionForm = this.formBuilder.nonNullable.group({
    question: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(1000)]]
  });

  constructor() {
    effect(() => {
      const newState = this.gameState();
      if (newState === 'PLAYER_INFO' || newState === 'PLAYING') {
        const hasSeenIntro = sessionStorage.getItem(`intro_seen_${this.gameId}`);
        if (!hasSeenIntro) {
          void this.router.navigate(['/game', this.gameId, 'introduction']);
        } else if (newState === 'PLAYER_INFO' && this.router.url.endsWith('/' + this.gameId)) {
          void this.router.navigate(['/game', this.gameId, 'participants']);
        }
      }
    });
  }

  ngOnInit(): void {
    const routeGameId = this.route.snapshot.paramMap.get('gameId') ?? '';
    const storedGameId = this.sessionService.getGameId();
    const storedPlayerId = this.sessionService.getPlayerId();

    this.gameId = routeGameId || storedGameId;
    this.playerId = storedPlayerId;

    if (this.gameId) {
      this.sessionService.setSession(this.gameId, this.playerId);
      this.gameService.setSession({
        gameId: this.gameId,
        playerId: this.playerId || undefined
      });

      this.chatService.clear();
      this.chatService.loadHistory(this.gameId);
      this.websocketService.connect(this.gameId, this.playerId || undefined);

      this.setupRealtimeSync();

      // We still need one initial fetch to get current round, maxRounds, etc.
      this.fetchInitialGameData();
    }
  }

  private setupRealtimeSync(): void {
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    this.subscriptions.add(
      this.websocketService.events$.subscribe((event: SocketGameEvent) => {
        if (event.event === 'game_state_update') {
          this.handleStateUpdate(event.payload);
        } else if (event.event === 'resync_data') {
          this.handleResyncData(event.payload);
        }
      })
    );
  }

  private handleVisibilityChange = (): void => {
    if (document.visibilityState === "visible") {
      console.log("App visible, requesting resync");
      this.websocketService.resync();
    }
  };

  private handleResyncData(payload: any): void {
    if (!payload) return;
    console.log("Applying resync data", payload);

    if (payload.gameState) {
      this.handleStateUpdate(payload.gameState);
    }
  }

  private handleStateUpdate(payload: any): void {
    if (!payload) return;

    if (payload.state) {
      this.gameStateService.setState(payload.state as GameState);
    }

    if (payload.roundNumber !== undefined) {
      const oldRound = this.currentRound();
      this.currentRound.set(payload.roundNumber);

      // If round has advanced, reset the "askedThisRound" status locally
      if (payload.roundNumber > oldRound) {
        this.askedThisRound.set(false);
      }
    }

    if (payload.maxRounds !== undefined) {
      this.maxRounds.set(payload.maxRounds);
    }

    if (payload.winnerType !== undefined) {
      this.winnerType.set(payload.winnerType);
    }

    // After state update, we might want to refresh player status from backend
    // to ensure askedThisRound is absolutely in sync
    this.refreshPlayerStatus();
  }

  private refreshPlayerStatus(): void {
    if (!this.gameId) return;
    this.gameService.getGame(this.gameId, this.playerId).subscribe(response => {
      if (response.success && response.data) {
        const game = response.data;
        const currentPlayer = game.players.find((p: PublicPlayerView) => p.id === this.playerId);
        if (currentPlayer) {
          this.askedThisRound.set(currentPlayer.askedThisRound || currentPlayer.accusedThisRound);
        }
      }
    });
  }

  private fetchInitialGameData(): void {
    this.subscriptions.add(
      this.gameService.getGame(this.gameId, this.playerId).subscribe(response => {
        if (response.success && response.data) {
          const game = response.data;
          this.gameStateService.setState(game.state);
          this.currentRound.set(game.roundNumber);
          this.maxRounds.set(game.maxRounds);
          this.winnerType.set(game.winnerType);

          const currentPlayer = game.players.find((p: PublicPlayerView) => p.id === this.playerId);
          if (currentPlayer) {
            this.askedThisRound.set(currentPlayer.askedThisRound || currentPlayer.accusedThisRound);
          }
        }
      })
    );
  }

  ngAfterViewChecked(): void {
    if (this.scrollToBottomRequested) {
      this.scrollToBottom();
      this.scrollToBottomRequested = false;
    }
  }

  ngOnDestroy(): void {
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    this.subscriptions.unsubscribe();
    this.websocketService.disconnect();
    this.ttsService.stop();
  }

  protected onSendQuestion(): void {
    if (this.questionForm.invalid || this.askedThisRound()) {
      return;
    }

    const question = this.questionForm.controls.question.value.trim();
    if (!question) {
      return;
    }

    this.chatService.sendQuestion(this.gameId, this.playerId, question);
    this.questionForm.reset();
    this.askedThisRound.set(true);
  }

  protected toggleSpeech(messageId: string, text: string): void {
    if (this.ttsService.playingId() === messageId) {
      this.ttsService.stop();
    } else {
      this.ttsService.speak(messageId, text);
    }
  }

  private scrollToBottom(): void {
    try {
      if (this.chatListContainer) {
        this.chatListContainer.nativeElement.scrollTop = this.chatListContainer.nativeElement.scrollHeight;
      }
    } catch (err) {
      console.error('Could not scroll to bottom', err);
    }
  }
}
