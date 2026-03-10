export type ChatMessageType = 'system' | 'clue' | 'player' | 'master';

export interface ChatMessage {
  id: string;
  type: ChatMessageType;
  content: string;
  createdAt: string;
  meta?: Record<string, string | number | boolean | null | undefined>;
}

export type SocketGameEventName =
  | 'game_state'
  | 'clue'
  | 'system_message'
  | 'round_start'
  | 'round_end'
  | 'game_state_updated'
  | 'connected'
  | 'error';

export interface SocketGameEvent<TPayload = unknown> {
  event: SocketGameEventName;
  payload: TPayload;
}
