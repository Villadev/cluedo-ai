import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';

export interface SocketGameEvent {
  event: string;
  payload: any;
}

@Injectable({ providedIn: 'root' })
export class WebSocketService {
  private readonly baseUrl = 'http://localhost:3000';
  private socket: Socket | null = null;
  private currentGameId: string | null = null;
  private pendingEvents: { event: string; payload: any }[] = [];

  private readonly connectedSubject = new BehaviorSubject<boolean>(false);
  readonly connected$ = this.connectedSubject.asObservable();

  private readonly reconnectingSubject = new BehaviorSubject<boolean>(false);
  readonly reconnecting$ = this.reconnectingSubject.asObservable();

  private readonly eventsSubject = new Subject<SocketGameEvent>();
  readonly events$ = this.eventsSubject.asObservable();

  connect(gameId: string): void {
    if (this.socket && this.currentGameId === gameId) {
      console.log("WS_CONNECT: Already connected/connecting to", gameId);
      return;
    }

    this.disconnect();
    this.currentGameId = gameId;

    console.log("WS_CONNECTING", gameId);
    this.socket = io(this.baseUrl, {
      query: {
        gameId
      },
      reconnection: true,
      reconnectionDelay: 3000,
      reconnectionAttempts: Infinity
    });

    this.socket.on('connect', () => {
      console.log("WS_CONNECTED");
      this.connectedSubject.next(true);
      this.reconnectingSubject.next(false);
      this.flushPendingEvents();
      this.resync();
    });

    this.socket.on('disconnect', (reason) => {
      console.log("WS_DISCONNECTED", reason);
      this.connectedSubject.next(false);
    });

    this.socket.on('connect_error', (error) => {
      console.log("WS_ERROR", error);
      this.connectedSubject.next(false);
      this.reconnectingSubject.next(true);
    });

    this.socket.on('reconnect_attempt', () => {
      console.log("WS_RECONNECTING");
      this.reconnectingSubject.next(true);
    });

    const listenableEvents = [
      'connected',
      'game_state',
      'game_state_update',
      'game_state_updated',
      'chat_message',
      'player_joined',
      'clue',
      'system_event',
      'error',
      'resync_data', 'game_deleted'
    ];

    for (const eventName of listenableEvents) {
      this.socket.on(eventName, (payload: any) => {
        console.log("WS_MESSAGE_RECEIVED", { event: eventName, payload });
        this.eventsSubject.next({ event: eventName, payload });
      });
    }
  }

  emit(event: string, payload: any): void {
    if (this.socket?.connected) {
      console.log("WS_EMIT:", event, payload);
      this.socket.emit(event, payload);
    } else {
      console.warn("WS_EMIT: Not connected, queueing", event, payload);
      if (event === 'update_difficulty') {
        // Keep only the latest difficulty update in the queue
        this.pendingEvents = this.pendingEvents.filter(e => e.event !== 'update_difficulty');
      }
      this.pendingEvents.push({ event, payload });
    }
  }

  private flushPendingEvents(): void {
    if (!this.socket?.connected || this.pendingEvents.length === 0) return;

    console.log("WS_FLUSH_PENDING_EVENTS", this.pendingEvents.length);
    for (const item of this.pendingEvents) {
      console.log("WS_EMIT_PENDING:", item.event, item.payload);
      this.socket.emit(item.event, item.payload);
    }
    this.pendingEvents = [];
  }

  resync(): void {
    if (this.socket?.connected && this.currentGameId) {
      console.log("WS_EMIT: resync_request", { gameId: this.currentGameId });
      this.socket.emit('resync_request', { gameId: this.currentGameId });
    }
  }

  disconnect(): void {
    if (!this.socket) {
      this.currentGameId = null;
      this.pendingEvents = [];
      return;
    }

    this.socket.removeAllListeners();
    this.socket.disconnect();
    this.socket = null;
    this.connectedSubject.next(false);
    this.reconnectingSubject.next(false);
    this.currentGameId = null;
    this.pendingEvents = [];
  }
}
