import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { z } from 'zod';
import { openaiClient } from '../config/openai.js';
import { env } from '../config/env.js';
import { requestCompletion } from '../ai/openai-gateway.js';
import { AIService } from '../services/AIService.js';
import { CaseOrchestratorService } from '../services/case-orchestrator.service.js';
import { createCaseSeed } from '../game/case-seed.js';
import { exactNames, validatePlan } from '../game/case-validation.js';
import { telemetryService } from '../services/telemetry.service.js';
import type { FullCase } from '../types/game.types.js';

import { gameFor, memoryStore } from './fixtures/generation-game.js';
const jsonLine = (text: string, prefix: string) => JSON.parse(text.split(prefix)[1]!.split('\n')[0]!);
interface Call { model: string; messages: { content: string }[]; max_completion_tokens?: number; max_tokens?: number; temperature?: number; frequency_penalty?: number; reasoning_effort?: string; response_format?: { type: string; json_schema?: { strict: boolean } } }
function fixture(names: string[], options: { failRound?: number; reviewFailures?: number; omitProfileOnce?: boolean } = {}) {
  const calls: Call[] = [];
  const kinds: string[] = [];
  let reviews = 0, omitted = false;
  const transport = mock.method(openaiClient.chat.completions, 'create', async (call: Call) => {
    calls.push(structuredClone(call));
    const prompt = call.messages[1]!.content;
    let kind: string, result: unknown;
    if (prompt.startsWith('Proposa un nom')) {
      kind = 'victim'; result = { name: 'Aina Rovira' };
    } else if (prompt.startsWith('Crea exactament')) {
      kind = 'basic'; result = { characters: names.map(name => ({ name, profession: `Ofici de ${name}`, possibleMotive: `Un deute de ${name} amb la víctima.` })) };
    } else if (prompt.startsWith('Crea una matriu')) {
      kind = 'relations'; result = { relations: names.map((a, i) => ({ a, b: names[(i + 1) % names.length], type: 'debt', strength: 'medium', note: 'Comparteixen un negoci amb deutes.' })) };
    } else if (prompt.startsWith('Planifica TOTS')) {
      kind = 'plan'; result = { characters: names.map((name, i) => ({ name, secret: `${name} amaga un deute.`, secretKnowledge: `${names[(i + 1) % names.length]} té un deute pendent.`, rumor: `Se sospita que ${name} volia cobrar.`, coartada: { location: 'A casa', timeStart: '20:00', timeEnd: '22:00', witness: 'Ningú', credibility: 'baixa' } })) };
    } else if (prompt.startsWith('Redacta en català')) {
      kind = 'profile';
      const selected = jsonLine(prompt, 'FITXES A REDACTAR: ') as { name: string }[];
      const chars = selected.map(c => ({ name: c.name, description: `Una persona del poble: ${c.name}.`, personality: 'Observadora i reservada.' }));
      if (options.omitProfileOnce && !omitted) { chars.pop(); omitted = true; }
      result = { characters: chars };
    } else if (prompt.startsWith('Genera la introducció')) {
      kind = 'narratives'; result = { introductionNarrative: 'Una mort inesperada ha trasbalsat el poble. Tothom amaga alguna cosa i caldrà contrastar cada declaració amb molta atenció.', solutionNarrative: 'La investigació reconstrueix els moviments i els deutes. La solució del cas es basa en les contradiccions verificades.' };
    } else if (prompt.startsWith('Redacta les pistes')) {
      const round = Number(prompt.match(/ronda (\d+)/)![1]); kind = `round${round}`;
      if (options.failRound === round) { kinds.push(kind); throw Object.assign(new Error('Mock unavailable'), { status: 401 }); }
      const facts = jsonLine(prompt, 'FETS AUTORITZATS D’AQUESTA RONDA: ') as { id: string; text: string }[];
      result = { clues: facts.map(f => ({ factId: f.id, text: f.text })) };
    } else if (prompt.startsWith('Audita aquest')) {
      kind = 'review'; result = { issues: reviews++ < (options.reviewFailures || 0) ? [{ area: 'clues', reason: 'Cal aclarir la connexió de les pistes amb la solució.' }] : [] };
    } else throw new Error(`Unexpected request: ${prompt.slice(0, 60)}`);
    kinds.push(kind);
    return { choices: [{ message: { content: JSON.stringify(result) }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 } };
  });
  return { calls, kinds, restore: () => transport.mock.restore() };
}

for (const count of [3, 8, 12, 15]) test(`full generation assigns ${count} complete characters with strict Luna contracts`, async () => {
  telemetryService.clear();
  const game = gameFor(count), store = memoryStore(game), ai = new AIService();
  const f = fixture(game.players.map(p => p.nickname));
  try {
    await new CaseOrchestratorService(ai, store).generateCase(game.id, 'hard', 3);
    const final = store.getById(game.id)!;
    assert.equal(final.state, 'PLAYER_INFO');
    assert.equal(final.characters.length, count);
    assert.equal(final.characters.filter(c => c.isAssassin).length, 1);
    assert.ok(final.players.every(p => p.characterId));
    assert.ok(final.characters.every(c => c.profession.startsWith('Ofici') && c.possibleMotive.includes('deute') && c.secret && c.secretKnowledge));
    assert.equal(final.clues.length, 9);
    assert.equal(final.generationCheckpoint, undefined);
    assert.ok(f.calls.every(c => c.model === 'gpt-6-luna' && c.max_completion_tokens && !('max_tokens' in c) && !('temperature' in c) && !('frequency_penalty' in c)));
    assert.ok(f.calls.every(c => c.response_format?.type === 'json_schema' && c.response_format.json_schema?.strict));
    const plan = f.calls.find(c => c.messages[1]!.content.startsWith('Planifica'))!;
    assert.ok(plan.max_completion_tokens! >= count * 650 + 2000);
    const cluePrompt = f.calls.find(c => c.messages[1]!.content.includes('ronda 2 de'))!.messages[1]!.content;
    assert.ok(cluePrompt.includes('secretKnowledge') && cluePrompt.includes('coartada') && cluePrompt.includes('round1'));
    assert.equal(telemetryService.getForGame(game.id).summary.totalAttempts, f.calls.length);
  } finally { f.restore(); }
});

test('missing profile is rejected and retried, never replaced with a generic character', async () => {
  const game = gameFor(3), store = memoryStore(game), f = fixture(game.players.map(p => p.nickname), { omitProfileOnce: true });
  try {
    await new CaseOrchestratorService(new AIService(), store).generateCase(game.id, 'hard', 3);
    assert.equal(store.getById(game.id)!.state, 'PLAYER_INFO');
    assert.equal(f.kinds.filter(k => k === 'profile').length, 2);
    assert.ok(f.calls.some(c => c.messages[1]!.content.includes('La resposta anterior no és vàlida')));
  } finally { f.restore(); }
});

test('failed round resumes from persistent checkpoints on a new orchestrator', async () => {
  const game = gameFor(15), store = memoryStore(game);
  let f = fixture(game.players.map(p => p.nickname), { failRound: 2 });
  await new CaseOrchestratorService(new AIService(), store).generateCase(game.id, 'hard', 3);
  f.restore();
  const failed = store.getById(game.id)!;
  assert.equal(failed.state, 'LOBBY');
  assert.ok(failed.generationCheckpoint?.steps.clues_round_1);
  const seed = structuredClone(failed.solution);
  assert.equal(seed?.victimName, 'Aina Rovira');
  failed.state = 'GENERATING'; store.save(failed);
  f = fixture(game.players.map(p => p.nickname));
  try {
    await new CaseOrchestratorService(new AIService(), store).generateCase(game.id, 'hard', 3);
    assert.deepEqual(f.kinds, ['round2', 'round3', 'review']);
    assert.equal(store.getById(game.id)!.solution!.assassin, seed!.assassin);
    assert.equal(store.getById(game.id)!.solution!.victimName, seed!.victimName);
  } finally { f.restore(); }
});

test('semantic audit regenerates only clues once and forwards repair feedback', async () => {
  const game = gameFor(8), store = memoryStore(game), f = fixture(game.players.map(p => p.nickname), { reviewFailures: 1 });
  try {
    await new CaseOrchestratorService(new AIService(), store).generateCase(game.id, 'hard', 3);
    assert.equal(store.getById(game.id)!.state, 'PLAYER_INFO');
    assert.equal(f.kinds.filter(k => k === 'plan').length, 1);
    assert.equal(f.kinds.filter(k => k === 'round1').length, 2);
    assert.ok(f.calls.some(c => c.messages[1]!.content.includes('generationFeedback')));
  } finally { f.restore(); }
});

test('repeated audit failure never publishes an incoherent case', async () => {
  const game = gameFor(3), store = memoryStore(game), f = fixture(game.players.map(p => p.nickname), { reviewFailures: 5 });
  try {
    await new CaseOrchestratorService(new AIService(), store).generateCase(game.id, 'hard', 3);
    const final = store.getById(game.id)!;
    assert.equal(final.state, 'LOBBY'); assert.equal(final.generationPhase, 'FAILED');
    assert.equal(f.kinds.filter(k => k === 'review').length, 2);
    assert.equal(final.generationCheckpoint?.steps.case_review, undefined);
  } finally { f.restore(); }
});

test('changing roster invalidates saved generation and prevents stale assignments', async () => {
  const game = gameFor(3), store = memoryStore(game);
  let f = fixture(game.players.map(p => p.nickname), { failRound: 2 });
  await new CaseOrchestratorService(new AIService(), store).generateCase(game.id, 'hard', 3); f.restore();
  const changed = store.getById(game.id)!; changed.players[0]!.nickname = 'Nou participant'; changed.state = 'GENERATING'; store.save(changed);
  f = fixture(changed.players.map(p => p.nickname));
  try {
    await new CaseOrchestratorService(new AIService(), store).generateCase(game.id, 'hard', 3);
    assert.ok(f.kinds.includes('basic'));
    assert.ok(store.getById(game.id)!.characters.some(c => c.name === 'Nou participant'));
  } finally { f.restore(); }
});

test('seed belongs to the backend and validates unique participant names', () => {
  const names = ['Joan', 'Maria', 'Pere'];
  for (let i = 0; i < 30; i++) {
    const seed = createCaseSeed(names);
    assert.ok(names.includes(seed.assassin!));
  }
  assert.throws(() => createCaseSeed(['Joan', 'joan', 'Maria']));
  assert.equal(exactNames(['Joan', 'Joan'], ['Joan', 'Maria']), false);
});

test('victim name is generated in Catalan from the case location', async () => {
  const f = fixture([]);
  try {
    const name = await new AIService().generateVictimName('victim', 'Masia de Can Coll', ['Elvira Font']);
    assert.equal(name, 'Aina Rovira');
    assert.match(f.calls[0]!.messages[1]!.content, /en català.*Masia de Can Coll/);
    assert.match(f.calls[0]!.messages[1]!.content, /Elvira Font/);
  } finally { f.restore(); }
});

test('new case seeds vary every core fact across three recent cases', () => {
  const names = ['Joan', 'Maria', 'Pere'];
  const recent = [createCaseSeed(names)];
  for (let i = 0; i < 3; i++) {
    const seed = createCaseSeed(names, recent);
    for (const previous of recent) {
      assert.notEqual(seed.location, previous.location);
      assert.notEqual(seed.weapon, previous.weapon);
      assert.notEqual(seed.crimeWindow.start, previous.crimeWindow.start);
    }
    assert.notEqual(seed.assassin, recent[0]!.assassin);
    recent.unshift(seed);
  }
});

test('plan rejects incompatible witnesses, impossible times and a confirmed killer alibi', () => {
  const seed: Partial<FullCase> = { assassin: 'Joan', location: 'Font', crimeWindow: { start: '21:00', end: '21:30' } };
  const characters = ['Joan', 'Maria', 'Pere'].map((name, i, names) => ({ name, secret: 'Deute', secretKnowledge: `${names[(i + 1) % 3]} té un deute`, rumor: 'Sospita', coartada: { location: 'Bar', timeStart: '20:00', timeEnd: '22:00', witness: 'Ningú', credibility: 'baixa' as const } }));
  assert.deepEqual(validatePlan(characters, seed, characters.map(c => c.name)), []);
  characters[0]!.coartada.witness = 'Inventat';
  assert.ok(validatePlan(characters, seed, characters.map(c => c.name)).length);
  characters[0]!.coartada.timeStart = '25:00';
  assert.ok(validatePlan(characters, seed, characters.map(c => c.name)).some(i => i.includes('Horari')));
  const impossible = [{ ...characters[0]!, coartada: { ...characters[0]!.coartada, timeStart: '20:00', witness: 'Maria', credibility: 'alta' as const } }, ...characters.slice(1)];
  assert.ok(validatePlan(impossible, seed, characters.map(c => c.name)).some(i => i.includes('culpable')));
});

test('legacy model transport retains sampling parameters without reasoning fields', async () => {
  const previous = env.OPENAI_MODEL; env.OPENAI_MODEL = 'gpt-4o-mini';
  let captured: Call | undefined;
  const transport = mock.method(openaiClient.chat.completions, 'create', async (call: Call) => { captured = call; return {}; });
  try {
    await requestCompletion('s', 'u', 100, undefined, z.object({ text: z.string() }));
    assert.equal(captured?.max_tokens, 100); assert.equal(captured?.max_completion_tokens, undefined);
    assert.equal(captured?.reasoning_effort, undefined); assert.equal(captured?.temperature, env.OPENAI_TEMPERATURE);
  } finally { env.OPENAI_MODEL = previous; transport.mock.restore(); }
});

test('reset cancels stale work and allows an immediate new generation', async () => {
  const game = gameFor(3), store = memoryStore(game), ai = new AIService();
  const orchestrator = new CaseOrchestratorService(ai, store);
  let release!: (value: []) => void;
  let started!: () => void;
  const entered = new Promise<void>(resolve => { started = resolve; });
  const victim = mock.method(ai, 'generateVictimName', async () => 'Aina Rovira');
  const basic = mock.method(ai, 'generateBasicCharacters', async () => { started(); return new Promise<[]>(resolve => { release = resolve; }); });
  const old = orchestrator.generateCase(game.id, 'hard', 3);
  await entered;
  orchestrator.cancel(game.id);
  const reset = gameFor(3); store.save(reset);
  basic.mock.restore();
  victim.mock.restore();
  const f = fixture(game.players.map(p => p.nickname));
  try {
    const fresh = orchestrator.generateCase(game.id, 'hard', 3);
    release([]);
    await old;
    assert.equal(orchestrator.isGenerating(game.id), true);
    await fresh;
    assert.equal(store.getById(game.id)!.state, 'PLAYER_INFO');
    assert.equal(orchestrator.isGenerating(game.id), false);
  } finally { f.restore(); }
});

test('truncated response retries with a bounded larger budget and accounts for both calls', async () => {
  telemetryService.clear();
  const budgets: number[] = [];
  const transport = mock.method(openaiClient.chat.completions, 'create', async (call: Call) => {
    budgets.push(call.max_completion_tokens!);
    return { choices: [{ finish_reason: budgets.length === 1 ? 'length' : 'stop', message: { content: JSON.stringify({ characters: ['Joan', 'Maria', 'Pere'].map(name => ({ name, profession: 'Metge', possibleMotive: 'Deute' })) }) } }], usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } };
  });
  try {
    const result = await new AIService().generateBasicCharacters('truncated', { assassin: 'Joan' }, 3, ['Joan', 'Maria', 'Pere'], 'hard');
    assert.equal(result.length, 3);
    assert.deepEqual(budgets, [6000, 12000]);
    assert.equal(telemetryService.getForGame('truncated').summary.totalTokens, 60);
  } finally { transport.mock.restore(); }
});

test('abort during retry backoff stops requests immediately', async () => {
  const controller = new AbortController();
  let calls = 0;
  const transport = mock.method(openaiClient.chat.completions, 'create', async () => {
    calls++; setTimeout(() => controller.abort(), 10);
    throw Object.assign(new Error('Rate limit'), { status: 429 });
  });
  try {
    await assert.rejects(new AIService().generateBasicCharacters('abort', {}, 3, ['Joan', 'Maria', 'Pere'], 'hard', controller.signal));
    assert.equal(calls, 1);
  } finally { transport.mock.restore(); }
});

test('Swagger retains the start endpoint and documents resuming generation', async () => {
  const { swaggerSpec } = await import('../config/swagger.js');
  assert.ok(swaggerSpec.paths['/game/{id}/start'].post.description.includes('Reprèn'));
});

test('backend schedules every evidence fact and keeps the culprit trace until the final round', async () => {
  const { buildCaseFacts } = await import('../game/case-facts.js');
  const ai = new AIService();
  const characters = ai.normalizeCharacters(['Joan', 'Maria', 'Pere'].map(name => ({ name, possibleMotive: 'Deute' })), { assassin: 'Joan' });
  for (const rounds of [1, 3, 5]) {
    const facts = buildCaseFacts({ ...createCaseSeed(['Joan', 'Maria', 'Pere']), characters } as FullCase, rounds);
    assert.equal(new Set(facts.map(f => f.id)).size, facts.length);
    assert.equal(facts.find(f => f.id === 'trace')!.revealRound, rounds);
    assert.ok(Array.from({ length: rounds }, (_, i) => facts.filter(f => f.revealRound === i + 1).length).every(n => n >= 2));
  }
});
