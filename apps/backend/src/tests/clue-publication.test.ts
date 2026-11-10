import assert from 'node:assert/strict';
import test from 'node:test';
import { GameEngine } from '../engine/game-engine.js';
import { AIService } from '../services/AIService.js';
import { HttpError } from '../utils/http-error.js';
import { gameFor, memoryStore } from './fixtures/generation-game.js';
import type { Clue, GameState } from '../types/game.types.js';

const clue = (id: string, roundNumber: number): Clue => ({
  id, roundNumber, type: 'evidence', text: `Prova ${id}`, isTrue: true, createdAt: new Date().toISOString()
});
function setup(state: GameState = 'PLAYING') {
  const game = gameFor(3);
  game.state = state;
  game.clues = [clue('initial', 1), clue('future', 2), clue('other', 2)];
  const store = memoryStore(game);
  const engine = new GameEngine(store, new AIService());
  const events: string[] = [];
  engine.setSystemEventListener((_id, message, type) => { if (type === 'clue') events.push(message); });
  return { engine, store, events, game };
}

test('revelació anticipada: desa el moment real, publica i fa visible la pista futura', () => {
  const { engine, store, events, game } = setup();
  assert.equal(engine.getPublicState(game.id).clues.length, 0);
  const revealed = engine.revealClue(game.id, 'future');
  assert.equal(revealed.roundNumber, 2);
  assert.equal(revealed.revealedRound, 1);
  assert.equal(revealed.revealMethod, 'manual');
  assert.ok(revealed.revealedAt);
  const saved = store.getById(game.id)!;
  assert.equal(saved.chatHistory[0]?.clueId, 'future');
  assert.equal(saved.chatHistory[0]?.roundNumber, 1);
  assert.equal(saved.timeline.filter(event => event.type === 'CLUE').length, 1);
  assert.deepEqual(events, ['Prova future']);
  assert.deepEqual(engine.getPublicState(game.id).clues.map(entry => entry.id), ['future']);
});

test('peticions repetides i ronda automàtica no dupliquen una pista mostrada', () => {
  const { engine, store, events, game } = setup();
  engine.revealClue(game.id, 'future');
  engine.revealClue(game.id, 'future');
  engine.forceNextRound(game.id);
  const saved = store.getById(game.id)!;
  assert.equal(saved.chatHistory.filter(message => message.clueId === 'future').length, 1);
  assert.equal(saved.chatHistory.filter(message => message.clueId === 'other').length, 1);
  assert.equal(saved.clues.find(entry => entry.id === 'other')?.revealMethod, 'automatic');
  assert.equal(saved.clues.find(entry => entry.id === 'other')?.revealedRound, 2);
  assert.deepEqual(events, ['Prova future', 'Prova other']);
});

test('rebutja pistes inexistents i publicació fora d’una partida en curs', () => {
  const { engine, game } = setup();
  assert.throws(() => engine.revealClue(game.id, 'missing'), (error: unknown) => error instanceof HttpError && error.statusCode === 404);
  for (const state of ['LOBBY', 'GENERATING', 'PLAYER_INFO', 'FINISHED'] as const) {
    const context = setup(state);
    assert.throws(() => context.engine.revealClue(context.game.id, 'future'), (error: unknown) => error instanceof HttpError && error.statusCode === 409);
    assert.equal(context.events.length, 0);
    assert.equal(context.store.getById(context.game.id)!.chatHistory.length, 0);
  }
});

test('partides antigues sense clueId: reconeix la publicació i no la repeteix', () => {
  const { engine, store, game, events } = setup();
  const saved = store.getById(game.id)!;
  saved.chatHistory.push({ type: 'clue', roundNumber: 1, message: 'Text narrat anterior', timestamp: 1234 });
  store.save(saved);
  engine.revealClue(game.id, 'initial');
  assert.equal(store.getById(game.id)!.chatHistory.length, 1);
  assert.equal(events.length, 0);
  const tracked = engine.getDebugData(game.id).clues[0]!;
  assert.equal(tracked.revealedAt, 1234);
  assert.equal(tracked.revealedRound, 1);
  assert.deepEqual(engine.getPublicState(game.id).clues.map(entry => entry.id), ['initial']);
});

test('historial amb IDs i sense IDs: assigna les pistes antigues sense confondre-les', () => {
  const { engine, store, game } = setup();
  const saved = store.getById(game.id)!;
  saved.roundNumber = 2;
  saved.chatHistory.push(
    { type: 'clue', clueId: 'future', roundNumber: 1, message: 'Anticipada', timestamp: 100 },
    { type: 'clue', roundNumber: 2, message: 'Prova other', timestamp: 200 }
  );
  store.save(saved);
  const clues = engine.getDebugData(game.id).clues;
  assert.equal(clues.find(entry => entry.id === 'future')?.revealedRound, 1);
  assert.equal(clues.find(entry => entry.id === 'other')?.revealedAt, 200);
  engine.revealClue(game.id, 'other');
  assert.equal(store.getById(game.id)!.chatHistory.length, 2);
});

test('inici real: desa totes les pistes de la ronda 1 abans de difondre-les i sobreviuen a una recàrrega', async () => {
  const { engine, store, game } = setup('PLAYER_INFO');
  const initial = store.getById(game.id)!;
  initial.clues.push(clue('initial-other', 1));
  store.save(initial);
  const broadcastIds: string[] = [];
  engine.setSystemEventListener((_id, text, type, round, sequenceId, timestamp) => {
    if (type !== 'clue') return;
    // Each listener models a client requesting fresh state immediately on receipt.
    const saved = store.getById(game.id)!;
    const published = saved.chatHistory.find(message => message.sequenceId === sequenceId);
    assert.equal(saved.state, 'PLAYING');
    assert.equal(round, 1);
    assert.equal(published?.message, text);
    assert.equal(published?.timestamp, timestamp);
    assert.ok(published?.clueId);
    broadcastIds.push(published.clueId);
    for (const entry of saved.clues.filter(candidate => candidate.roundNumber === 1)) {
      assert.equal(entry.revealMethod, 'automatic');
      assert.equal(entry.revealedRound, 1);
      assert.ok(entry.revealedAt);
      assert.equal(saved.chatHistory.filter(message => message.clueId === entry.id).length, 1);
    }
    assert.deepEqual(engine.getPublicState(game.id).clues.map(entry => entry.id), ['initial', 'initial-other']);
  });

  await engine.playGame(game.id);
  assert.deepEqual(broadcastIds, ['initial', 'initial-other']);
  const restarted = new GameEngine(store, new AIService());
  const reloadedEvents: string[] = [];
  restarted.setSystemEventListener((_id, text) => { reloadedEvents.push(text); });
  const tracked = restarted.getDebugData(game.id).clues.filter(entry => entry.roundNumber === 1);
  assert.equal(tracked.length, 2);
  assert.ok(tracked.every(entry => entry.revealedAt !== undefined && entry.revealMethod === 'automatic'));
  assert.deepEqual(restarted.getPublicState(game.id).clues.map(entry => entry.id), ['initial', 'initial-other']);
  restarted.revealClue(game.id, 'initial');
  restarted.revealClue(game.id, 'initial-other');
  assert.deepEqual(reloadedEvents, []);
  assert.equal(store.getById(game.id)!.chatHistory.filter(message => message.type === 'clue').length, 2);
  assert.equal(store.getById(game.id)!.timeline.filter(event => event.type === 'CLUE').length, 2);
});

test('una fallada de persistència no difon una pista que encara no està desada', () => {
  const { engine, store, game, events } = setup();
  store.save = () => { throw new Error('Error de persistència de prova'); };
  assert.throws(() => engine.revealClue(game.id, 'future'), /Error de persistència de prova/);
  assert.deepEqual(events, []);
  const saved = store.getById(game.id)!;
  assert.equal(saved.chatHistory.length, 0);
  assert.equal(saved.clues.find(entry => entry.id === 'future')?.revealedAt, undefined);
});
