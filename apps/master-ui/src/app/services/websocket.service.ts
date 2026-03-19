import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';

export interface SocketGameEvent {
  event: string;
  payload: any;
}

@Injectable({ providedIn: 'root' })
export class WebSocketService {
  private readonly baseUrl = 'https://backend-veq8.onrender.com';
  private socket: Socket | null = null;

  private readonly connectedSubject = new BehaviorSubject<boolean>(false);
  readonly connected$ = this.connectedSubject.asObservable();

  private readonly reconnectingSubject = new BehaviorSubject<boolean>(false);
  readonly reconnecting$ = this.reconnectingSubject.asObservable();

  private readonly eventsSubject = new Subject<SocketGameEvent>();
  readonly events$ = this.eventsSubject.asObservable();

  connect(gameId: string): void {
    this.disconnect();

    console.log("WS_CONNECTING");
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
      'error'
    ];

    for (const eventName of listenableEvents) {
      this.socket.on(eventName, (payload: any) => {
        console.log("WS_MESSAGE_RECEIVED", { event: eventName, payload });
        this.eventsSubject.next({ event: eventName, payload });
      });
    }
  }

  disconnect(): void {
    if (!this.socket) {
      return;
    }

    this.socket.removeAllListeners();
    this.socket.disconnect();
    this.socket = null;
    this.connectedSubject.next(false);
    this.reconnectingSubject.next(false);
  }
}
