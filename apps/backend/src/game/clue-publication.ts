import { HttpError } from '../utils/http-error.js';
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

export type ClueRevealMethod = NonNullable<Clue['revealMethod']>;

export function isCluePublished(game: Pick<Game, 'clues' | 'chatHistory'>, clue: Clue): boolean {
  return clue.revealedAt !== undefined || !!findClueMessage(game, clue);
}

export function getClueForManualReveal(game: Game, clueId: string): Clue {
  assertClueRevealAllowed(game);
  const clue = game.clues.find(entry => entry.id === clueId);
  if (!clue) throw new HttpError(404, 'No s’ha trobat aquesta pista a la partida.');
  return clue;
}

export function getCluesForAutomaticReveal(game: Game, roundNumber: number): Clue[] {
  return game.clues.filter(clue => clue.roundNumber === roundNumber);
}

function assertClueRevealAllowed(game: Game): void {
  if (game.state !== 'PLAYING') {
    throw new HttpError(409, 'Només es poden ensenyar pistes mentre la partida està en curs.');
  }
}

/** Apply the publication policy in memory; the caller must persist before broadcasting. */
export function applyCluePublication(game: Game, clue: Clue, method: ClueRevealMethod): ChatMessage | undefined {
  assertClueRevealAllowed(game);
  if (isCluePublished(game, clue)) return undefined;

  const timestamp = Date.now();
  const message: ChatMessage = {
    type: 'clue', clueId: clue.id,
    message: clue.text || 'Pista no disponible temporalment',
    playerName: 'Narrador 🕵️‍♂️', roundNumber: game.roundNumber,
    sequenceId: game.nextSequenceId++, timestamp
  };
  clue.revealedAt = timestamp;
  clue.revealedRound = game.roundNumber;
  clue.revealMethod = method;
  game.chatHistory.push(message);
  game.timeline.push({
    type: 'CLUE', roundNumber: game.roundNumber, text: message.message, isTrue: clue.isTrue,
    sequenceId: message.sequenceId, timestamp: new Date(timestamp).toISOString(),
    description: `Pista revelada ${method === 'manual' ? 'pel màster' : 'automàticament'} (prevista per a la ronda ${clue.roundNumber}): ${message.message}`
  });
  game.updatedAt = new Date(timestamp).toISOString();
  return message;
}
