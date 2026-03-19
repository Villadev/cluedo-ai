export type ChatMessageType = 'question' | 'response' | 'clue' | 'system';

export interface ChatMessage {
  id: string;
  type: ChatMessageType;
  sender?: string;
  message: string;
  timestamp: Date;
  round?: number;
  sequenceId?: number;
}

export type SocketGameEventName =
  | 'chat_message'
  | 'round_state'
  | 'game_state'
  | 'game_state_update'
  | 'clue'
  | 'system_event'
  | 'connected'
  | 'error'
  | 'game_state_updated'
  | 'system_message'
  | 'round_start'
  | 'round_end'
  | 'resync_data';

export interface SocketGameEvent<TPayload = any> {
  event: SocketGameEventName;
  payload: TPayload;
}
