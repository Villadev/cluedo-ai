import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ChatMessage } from '../models/chat.models';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly messagesSubject = new BehaviorSubject<ChatMessage[]>([]);
  readonly messages$ = this.messagesSubject.asObservable();

  addMessage(message: ChatMessage): void {
    this.messagesSubject.next([...this.messagesSubject.value, message]);
  }

  clear(): void {
    this.messagesSubject.next([]);
  }
}
