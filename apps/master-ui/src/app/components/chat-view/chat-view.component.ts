import { Component, Input, OnInit, OnDestroy, ElementRef, ViewChild, AfterViewChecked, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Subscription } from 'rxjs';
import { WebSocketService, SocketGameEvent } from '../../services/websocket.service';
import { GameApiService, ApiResponse, ChatHistoryMessage } from '../../services/game-api.service';

// PrimeNG
import { CardModule } from 'primeng/card';
import { ScrollPanelModule } from 'primeng/scrollpanel';

export type ChatMessageType = 'question' | 'response' | 'clue' | 'system' | 'player' | 'narrator';

export interface ChatMessage {
  id: string;
  type: ChatMessageType;
  sender?: string;
  message: string;
  timestamp: Date;
  round?: number;
  sequenceId?: number;
}

@Component({
  selector: 'app-chat-view',
  standalone: true,
  imports: [CommonModule, DatePipe, CardModule, ScrollPanelModule],
  templateUrl: './chat-view.component.html',
  styleUrls: ['./chat-view.component.scss']
})
export class ChatViewComponent implements OnInit, OnDestroy, AfterViewChecked {
  @Input() gameId!: string;
  @ViewChild('chatList') private chatListContainer!: ElementRef;

  private readonly websocketService = inject(WebSocketService);
  private readonly gameApiService = inject(GameApiService);
  private readonly subscriptions = new Subscription();

  protected readonly messages = signal<ChatMessage[]>([]);
  private scrollToBottomRequested = false;

  ngOnInit(): void {
    if (this.gameId) {
      this.loadHistory();
      this.subscriptions.add(
        this.websocketService.events$.subscribe((event: SocketGameEvent) => {
          if (event.event === 'chat_message') {
            this.handleChatMessage(event.payload);
          } else if (event.event === 'resync_data') {
            this.handleResyncData(event.payload);
          }
        })
      );
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  ngAfterViewChecked(): void {
    if (this.scrollToBottomRequested) {
      this.scrollToBottom();
      this.scrollToBottomRequested = false;
    }
  }

  private loadHistory(): void {
    this.gameApiService.getChatHistory(this.gameId).subscribe((response: ApiResponse<ChatHistoryMessage[]>) => {
      if (response.success && response.data) {
        this.applyHistory(response.data);
      }
    });
  }

  private handleResyncData(payload: any): void {
    if (payload?.chatHistory) {
      this.applyHistory(payload.chatHistory);
    }
  }

  private applyHistory(history: ChatHistoryMessage[]): void {
    const historyMessages: ChatMessage[] = history.map((msg: ChatHistoryMessage) => ({
      id: Math.random().toString(36).substring(2, 11),
      type: msg.type as ChatMessageType,
      sender: msg.playerName,
      message: msg.message,
      timestamp: new Date(msg.timestamp),
      round: msg.roundNumber,
      sequenceId: msg.sequenceId
    }));
    this.messages.set(historyMessages);
    this.scrollToBottomRequested = true;
  }

  private handleChatMessage(payload: any): void {
    const message: ChatMessage = {
      id: Math.random().toString(36).substring(2, 11),
      type: (payload.type || payload.messageType) as ChatMessageType,
      sender: payload.playerName || payload.sender,
      message: payload.message,
      timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date(),
      round: payload.roundNumber,
      sequenceId: payload.sequenceId
    };
    this.messages.update(msgs => [...msgs, message]);
    this.scrollToBottomRequested = true;
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
