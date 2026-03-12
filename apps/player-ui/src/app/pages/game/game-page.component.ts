import { AsyncPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { ChatService } from '../../services/chat.service';
import { GameService } from '../../services/game.service';
import { SessionService } from '../../services/session.service';
import { WebSocketService } from '../../services/websocket.service';
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
    GameStatusIndicatorComponent
  ],
  templateUrl: './game-page.component.html',
  styleUrl: './game-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GamePageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly formBuilder = inject(FormBuilder);
  private readonly websocketService = inject(WebSocketService);
  private readonly chatService = inject(ChatService);
  private readonly gameService = inject(GameService);
  private readonly sessionService = inject(SessionService);
  private readonly subscriptions = new Subscription();

  protected readonly chatMessages$ = this.chatService.messages$;
  protected readonly connected$ = this.websocketService.connected$;
  protected readonly canAskQuestion$ = this.chatService.canAskQuestion$;

  protected gameId = '';
  protected playerId = '';

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
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.websocketService.disconnect();
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
}
