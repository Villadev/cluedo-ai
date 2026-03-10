import { AsyncPipe, DatePipe, NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { ChatMessage, SocketGameEvent } from '../../models/chat.models';
import { ChatService } from '../../services/chat.service';
import { GameService } from '../../services/game.service';
import { SessionService } from '../../services/session.service';
import { WebSocketService } from '../../services/websocket.service';

@Component({
  selector: 'app-game-page',
  imports: [ReactiveFormsModule, AsyncPipe, NgClass, DatePipe, CardModule, InputTextModule, ButtonModule],
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

  protected gameId = '';
  protected playerId = '';
  protected roundStatus = 'En espera';
  protected askedThisRound = false;

  protected readonly questionForm = this.formBuilder.nonNullable.group({
    question: ['', [Validators.required, Validators.maxLength(400)]]
  });

  ngOnInit(): void {
    const routeGameId = this.route.snapshot.paramMap.get('gameId') ?? '';
    const queryPlayerId = this.route.snapshot.queryParamMap.get('playerId') ?? '';

    const storedGameId = this.sessionService.getGameId();
    const storedPlayerId = this.sessionService.getPlayerId();

    this.gameId = routeGameId || storedGameId;
    this.playerId = queryPlayerId || storedPlayerId;

    this.sessionService.setSession(this.gameId, this.playerId);
    this.gameService.setSession({
      gameId: this.gameId,
      playerId: this.playerId || undefined
    });

    this.chatService.clear();
    this.gameService.resetRoundQuestion();
    this.websocketService.connect(this.gameId, this.playerId || undefined);

    this.subscriptions.add(
      this.websocketService.events$.subscribe((event: SocketGameEvent) => {
        this.handleSocketEvent(event);
      })
    );

    this.subscriptions.add(
      this.gameService.askedThisRound$.subscribe((value: boolean) => {
        this.askedThisRound = value;
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.websocketService.disconnect();
  }

  protected onSendQuestion(): void {
    if (this.askedThisRound || this.questionForm.invalid) {
      return;
    }

    const question = this.questionForm.controls.question.value.trim();
    if (!question) {
      return;
    }

    this.websocketService.sendQuestion(question);
    this.chatService.addMessage(this.createMessage('player', question));
    this.gameService.setAskedThisRound(true);
    this.questionForm.reset();
  }

  private handleSocketEvent(event: SocketGameEvent): void {
    switch (event.event) {
      case 'connected':
        this.chatService.addMessage(this.createMessage('system', 'Connexió WebSocket establerta correctament.'));
        break;
      case 'game_state':
      case 'game_state_updated':
        this.chatService.addMessage(this.createMessage('master', `Actualització d'estat: ${JSON.stringify(event.payload)}`));
        break;
      case 'clue':
        this.chatService.addMessage(this.createMessage('clue', this.extractText(event.payload, 'Nova pista rebuda.')));
        break;
      case 'system_message':
        this.chatService.addMessage(this.createMessage('system', this.extractText(event.payload, 'Missatge del sistema.')));
        break;
      case 'round_start':
        this.roundStatus = 'Ronda en curs';
        this.gameService.resetRoundQuestion();
        this.chatService.addMessage(this.createMessage('system', 'Comença una nova ronda.'));
        break;
      case 'round_end':
        this.roundStatus = 'Ronda finalitzada';
        this.chatService.addMessage(this.createMessage('system', 'La ronda ha finalitzat.'));
        break;
      case 'error':
        this.chatService.addMessage(this.createMessage('system', "S'ha rebut un error del servidor."));
        break;
      default:
        break;
    }
  }

  private extractText(payload: unknown, fallback: string): string {
    if (typeof payload === 'string') {
      return payload;
    }

    if (payload && typeof payload === 'object' && 'message' in payload) {
      const messageValue = (payload as { message?: unknown }).message;
      if (typeof messageValue === 'string') {
        return messageValue;
      }
    }

    return fallback;
  }

  private createMessage(type: ChatMessage['type'], content: string): ChatMessage {
    return {
      id: crypto.randomUUID(),
      type,
      content,
      createdAt: new Date().toISOString()
    };
  }
}
