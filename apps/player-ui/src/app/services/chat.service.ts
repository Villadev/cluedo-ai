import { inject, Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subject, Subscription } from 'rxjs';
import { ChatMessage, ChatMessageType, SocketGameEvent } from '../models/chat.models';
import { WebSocketService } from './websocket.service';
import { GameService, ChatHistoryMessage } from './game.service';

@Injectable({ providedIn: 'root' })
export class ChatService implements OnDestroy {
  private readonly websocketService = inject(WebSocketService);
  private readonly gameService = inject(GameService);
  private readonly subscriptions = new Subscription();

  private readonly messagesSubject = new BehaviorSubject<ChatMessage[]>([]);
  readonly messages$ = this.messagesSubject.asObservable();

  private readonly canAskQuestionSubject = new BehaviorSubject<boolean>(true);
  readonly canAskQuestion$ = this.canAskQuestionSubject.asObservable();

  private readonly errorSubject = new Subject<string>();
  readonly error$ = this.errorSubject.asObservable();

  public currentGameId: string | null = null;

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
    // Basic deduplication for live messages if they have sequenceId
    if (message.sequenceId !== undefined) {
      const exists = this.messagesSubject.value.some(m => m.sequenceId === message.sequenceId);
      if (exists) {
        console.log(`[CHAT_SERVICE] Duplicate message ignored: sequenceId=${message.sequenceId}`);
        return;
      }
    }
    console.log(`[CHAT_SERVICE] Adding message: type=${message.type}, sequenceId=${message.sequenceId}`);
    const updated = [...this.messagesSubject.value, message]; this.messagesSubject.next(updated.sort((a, b) => (a.sequenceId || 0) - (b.sequenceId || 0) || a.timestamp.getTime() - b.timestamp.getTime()));
  }

  sendQuestion(gameId: string, playerId: string, message: string): void {
    this.websocketService.sendQuestion(gameId, playerId, message);
  }

  clear(): void {
    this.messagesSubject.next([]);
    this.canAskQuestionSubject.next(true);
    this.currentGameId = null;
  }

  loadHistory(gameId: string): void {
    this.currentGameId = gameId;
    this.gameService.getChatHistory(gameId).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          this.applyResyncedHistory(response.data);
        }
      },
      error: (err) => {
        console.error(`[DEBUG] Error loading chat history for game ${gameId}:`, err);
      }
    });
  }

  private handleSocketEvent(event: SocketGameEvent): void {
    switch (event.event) {
      case 'chat_message':
        this.handleChatMessage(event.payload);
        break;
      case 'round_state':
        if (event.payload && typeof event.payload === 'object' && 'canAskQuestion' in event.payload) {
          this.canAskQuestionSubject.next(!!event.payload.canAskQuestion);
        }
        break;
      case 'round_start':
        this.canAskQuestionSubject.next(true);
        break;
      case 'resync_data':
        if (event.payload?.chatHistory) {
          this.applyResyncedHistory(event.payload.chatHistory);
        }
        break;
      case 'error':
        this.handleError(event.payload);
        break;
    }
  }

  private handleError(payload: any): void {
    let message = 'S’ha produït un error.';
    if (typeof payload === 'string') {
      message = payload;
    } else if (payload?.message) {
      message = payload.message;
    }

    // Traducció de missatges comuns si cal
    if (message.includes("not your turn")) {
      message = "No és el teu torn.";
    }

    // Log error for UI only
    console.warn(`[CHAT_ERROR] ${message}`);
    this.errorSubject.next(message);
  }

  private applyResyncedHistory(history: ChatHistoryMessage[]): void {
    const typeMap: Record<string, ChatMessageType> = {
      'player': 'question',
      'narrator': 'response', 'response': 'response',
      'system': 'system',
      'clue': 'clue'
    };

    const historyMessages: ChatMessage[] = history.map((msg) => ({
      id: crypto.randomUUID(),
      type: typeMap[msg.type] || 'system',
      sender: msg.playerName,
      message: msg.message,
      timestamp: new Date(msg.timestamp),
      round: msg.roundNumber,
      sequenceId: msg.sequenceId
    }));

    // For player-ui, we replace the state entirely on resync/load to match master-ui behavior
    this.messagesSubject.next(historyMessages.sort((a, b) => (a.sequenceId || 0) - (b.sequenceId || 0) || a.timestamp.getTime() - b.timestamp.getTime()));
  }

  private handleChatMessage(payload: any): void {
    // Ensure payload is an object
    let data = payload;
    if (typeof payload === 'string') {
      try {
        data = JSON.parse(payload);
      } catch (e) {
        console.error('Failed to parse chat message payload', e);
        return;
      }
    }

    const typeMap: Record<string, ChatMessageType> = {
      'player': 'question',
      'question': 'question',
      'response': 'response',
      'clue': 'clue',
      'system': 'system',
      'narrator': 'response',
      'chat': 'question' // If type is 'chat', it's usually a player question
    };

    const message: ChatMessage = {
      id: crypto.randomUUID(),
      type: typeMap[data.type] || typeMap[data.messageType] || 'response',
      sender: data.playerName || data.sender,
      message: data.message,
      timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
      round: data.roundNumber,
      sequenceId: data.sequenceId
    };
    this.addMessage(message);
  }


}
