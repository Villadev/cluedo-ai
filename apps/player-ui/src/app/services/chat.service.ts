import { inject, Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
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
      if (exists) return;
    }
    this.messagesSubject.next([...this.messagesSubject.value, message]);
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
          const historyMessages: ChatMessage[] = [];
          const seenSequenceIds = new Set<number>();

          response.data.forEach((msg: ChatHistoryMessage) => {
            if (msg.sequenceId !== undefined && seenSequenceIds.has(msg.sequenceId)) {
              return;
            }
            if (msg.sequenceId !== undefined) {
              seenSequenceIds.add(msg.sequenceId);
            }

            const typeMap: Record<string, ChatMessageType> = {
              'player': 'question',
              'narrator': 'response',
              'system': 'system',
              'clue': 'clue'
            };

            historyMessages.push({
              id: crypto.randomUUID(),
              type: typeMap[msg.type] || 'system',
              sender: msg.playerName,
              message: msg.message,
              timestamp: new Date(msg.timestamp),
              round: msg.roundNumber,
              sequenceId: msg.sequenceId
            });
          });

          // Merge with current messages, prioritizing history but avoiding duplicates
          const currentMessages = this.messagesSubject.value;
          const merged = [...historyMessages];

          currentMessages.forEach(curr => {
            if (curr.sequenceId === undefined || !seenSequenceIds.has(curr.sequenceId)) {
              merged.push(curr);
            }
          });

          // Sort by timestamp or sequenceId if possible, but for now just replace if history is fresh
          this.messagesSubject.next(merged.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()));
        }
      },
      error: (err) => {
        console.error(`[DEBUG] Error loading chat history for game ${gameId}:`, err);
        // We don't clear the messages on error to keep what we have (e.g. from websocket)
      }
    });
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
      case 'resync_data':
        if (event.payload?.chatHistory) {
          this.applyResyncedHistory(event.payload.chatHistory);
        }
        break;
    }
  }

  private applyResyncedHistory(history: ChatHistoryMessage[]): void {
    const typeMap: Record<string, ChatMessageType> = {
      'player': 'question',
      'narrator': 'response',
      'system': 'system',
      'clue': 'clue'
    };

    const messages: ChatMessage[] = [];
    const seenSequenceIds = new Set<number>();

    history.forEach((msg) => {
      if (msg.sequenceId !== undefined && seenSequenceIds.has(msg.sequenceId)) {
        return;
      }
      if (msg.sequenceId !== undefined) {
        seenSequenceIds.add(msg.sequenceId);
      }

      messages.push({
        id: crypto.randomUUID(),
        type: typeMap[msg.type] || 'system',
        sender: msg.playerName,
        message: msg.message,
        timestamp: new Date(msg.timestamp),
        round: msg.roundNumber,
        sequenceId: msg.sequenceId
      });
    });

    this.messagesSubject.next(messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()));
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
      timestamp: new Date(),
      round: payload?.roundNumber,
      sequenceId: payload?.sequenceId
    });
  }
}
