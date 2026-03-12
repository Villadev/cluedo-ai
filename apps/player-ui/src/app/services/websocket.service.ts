import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { SocketGameEvent, SocketGameEventName } from '../models/chat.models';

@Injectable({ providedIn: 'root' })
export class WebSocketService {
  private readonly baseUrl = 'https://backend-veq8.onrender.com';
  private socket: Socket | null = null;

  private readonly connectedSubject = new BehaviorSubject<boolean>(false);
  readonly connected$ = this.connectedSubject.asObservable();

  private readonly eventsSubject = new Subject<SocketGameEvent>();
  readonly events$ = this.eventsSubject.asObservable();

  connect(gameId: string, playerId?: string): void {
    this.disconnect();

    this.socket = io(this.baseUrl, {
      transports: ['websocket'],
      query: {
        gameId,
        playerId: playerId ?? ''
      }
    });

    this.socket.on('connect', () => {
      this.connectedSubject.next(true);
    });

    this.socket.on('disconnect', () => {
      this.connectedSubject.next(false);
    });

    const listenableEvents: SocketGameEventName[] = [
      'connected',
      'game_state',
      'clue',
      'system_event',
      'chat_message',
      'round_state',
      'error',
      'game_state_updated',
      'system_message',
      'round_start',
      'round_end'
    ];

    for (const eventName of listenableEvents) {
      this.socket.on(eventName, (payload: any) => {
        this.eventsSubject.next({ event: eventName, payload });
      });
    }
  }

  sendQuestion(gameId: string, playerId: string, message: string): void {
    this.socket?.emit('question', { gameId, playerId, message });
  }

  disconnect(): void {
    if (!this.socket) {
      return;
    }

    this.socket.removeAllListeners();
    this.socket.disconnect();
    this.socket = null;
    this.connectedSubject.next(false);
  }
}
