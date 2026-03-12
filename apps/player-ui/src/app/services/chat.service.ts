import { inject, Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import { ChatMessage, ChatMessageType, SocketGameEvent } from '../models/chat.models';
import { WebSocketService } from './websocket.service';

@Injectable({ providedIn: 'root' })
export class ChatService implements OnDestroy {
  private readonly websocketService = inject(WebSocketService);
  private readonly subscriptions = new Subscription();

  private readonly messagesSubject = new BehaviorSubject<ChatMessage[]>([]);
  readonly messages$ = this.messagesSubject.asObservable();

  private readonly canAskQuestionSubject = new BehaviorSubject<boolean>(true);
  readonly canAskQuestion$ = this.canAskQuestionSubject.asObservable();

  constructor() {
    this.subscriptions.add(
      this.websocketService.events$.subscribe((event: SocketGameEvent) => {
        this.handleSocketEvent(event);
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  addMessage(message: ChatMessage): void {
    this.messagesSubject.next([...this.messagesSubject.value, message]);
  }

  sendQuestion(gameId: string, playerId: string, message: string): void {
    this.websocketService.sendQuestion(gameId, playerId, message);
  }

  clear(): void {
    this.messagesSubject.next([]);
    this.canAskQuestionSubject.next(true);
  }

  private handleSocketEvent(event: SocketGameEvent): void {
    switch (event.event) {
      case 'chat_message':
        this.handleChatMessage(event.payload);
        break;
      case 'clue':
        this.addSystemMessage('clue', event.payload);
        break;
      case 'system_event':
      case 'system_message':
        this.addSystemMessage('system', event.payload);
        break;
      case 'round_state':
        if (event.payload && typeof event.payload === 'object' && 'canAskQuestion' in event.payload) {
          this.canAskQuestionSubject.next(!!event.payload.canAskQuestion);
        }
        break;
      case 'round_start':
        this.canAskQuestionSubject.next(true);
        this.addSystemMessage('system', 'Comença una nova ronda d\'investigació. Pots fer una pregunta.');
        break;
      case 'round_end':
        this.addSystemMessage('system', 'La ronda ha finalitzat. Revisa les pistes.');
        break;
    }
  }

  private handleChatMessage(payload: any): void {
    const typeMap: Record<string, ChatMessageType> = {
      'question': 'question',
      'response': 'response',
      'clue': 'clue',
      'system': 'system'
    };

    const message: ChatMessage = {
      id: crypto.randomUUID(),
      type: typeMap[payload.messageType] || 'response',
      sender: payload.sender,
      message: payload.message,
      timestamp: new Date()
    };
    this.addMessage(message);
  }

  private addSystemMessage(type: ChatMessageType, payload: any): void {
    let content = '';
    if (typeof payload === 'string') {
      content = payload;
    } else if (payload && typeof payload === 'object' && 'message' in payload) {
      content = payload.message;
    } else if (payload && typeof payload === 'object' && 'text' in payload) {
      content = payload.text;
    }

    if (!content) return;

    this.addMessage({
      id: crypto.randomUUID(),
      type: type,
      message: content,
      timestamp: new Date()
    });
  }
}
