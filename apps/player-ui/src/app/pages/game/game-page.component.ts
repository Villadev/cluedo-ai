import { AsyncPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, timer, switchMap, filter, tap } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ChatService } from '../../services/chat.service';
import { GameService } from '../../services/game.service';
import { SessionService } from '../../services/session.service';
import { WebSocketService } from '../../services/websocket.service';
import { GameState } from '../../models/player.model';
import { GameStatusIndicatorComponent } from '../../components/game-status-indicator/game-status-indicator.component';

@Component({
  selector: 'app-game-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    AsyncPipe,
    DatePipe,
    CardModule,
    InputTextareaModule,
    ButtonModule,
    ProgressSpinnerModule,
    GameStatusIndicatorComponent
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
  private readonly subscriptions = new Subscription();

  protected readonly chatMessages$ = this.chatService.messages$.pipe(
    tap(() => this.scrollToBottomRequested = true)
  );
  protected readonly connected$ = this.websocketService.connected$;
  protected readonly reconnecting$ = this.websocketService.reconnecting$;
  protected readonly canAskQuestion$ = this.chatService.canAskQuestion$;

  protected readonly gameState = signal<GameState | 'NONE'>('NONE');
  protected gameId = '';
  protected playerId = '';

  private scrollToBottomRequested = false;

  protected readonly questionForm = this.formBuilder.nonNullable.group({
    question: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(1000)]]
  });

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
      this.websocketService.connect(this.gameId, this.playerId || undefined);

      this.startPolling();
    }
  }

  ngAfterViewChecked(): void {
    if (this.scrollToBottomRequested) {
      this.scrollToBottom();
      this.scrollToBottomRequested = false;
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.websocketService.disconnect();
  }

  private startPolling(): void {
    this.subscriptions.add(
      timer(0, 5000)
        .pipe(
          switchMap(() => this.gameService.getGame(this.gameId, this.playerId)),
          filter(response => response.success && !!response.data)
        )
        .subscribe(response => {
          const newState = response.data!.state;
          const oldState = this.gameState();
          this.gameState.set(newState);

          if (newState === 'PLAYING' && oldState !== 'PLAYING') {
            const hasSeenIntro = sessionStorage.getItem(`intro_seen_${this.gameId}`);
            if (!hasSeenIntro) {
              void this.router.navigate(['/game', this.gameId, 'introduction']);
            }
          }
        })
    );
  }

  protected onSendQuestion(): void {
    if (this.questionForm.invalid) {
      return;
    }

    const question = this.questionForm.controls.question.value.trim();
    if (!question) {
      return;
    }

    this.chatService.sendQuestion(this.gameId, this.playerId, question);
    this.questionForm.reset();
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
