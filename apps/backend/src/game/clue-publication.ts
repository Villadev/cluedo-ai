import type { ChatMessage, Clue, Game } from '../types/game.types.js';

/** Older games published clues without IDs, in their scheduled order. */
export function findClueMessage(game: Pick<Game, 'clues' | 'chatHistory'>, clue: Clue): ChatMessage | undefined {
  const identified = game.chatHistory.find(message => message.type === 'clue' && message.clueId === clue.id);
  if (identified) return identified;
  const legacy = game.chatHistory.filter(message => message.type === 'clue' && !message.clueId && message.roundNumber === clue.roundNumber);
  const unmatched = game.clues.filter(entry => entry.roundNumber === clue.roundNumber &&
    !game.chatHistory.some(message => message.type === 'clue' && message.clueId === entry.id));
  return legacy[unmatched.findIndex(entry => entry.id === clue.id)];
}
