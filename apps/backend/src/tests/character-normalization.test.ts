import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AIService } from '../services/AIService.js';

test('character normalization preserves planned identity, motive, profession and alibi', () => {
  const ai = new AIService();
  const coartada = { location: 'Bar', timeStart: '20:00', timeEnd: '20:30', witness: 'Maria', credibility: 'alta' as const };
  const [character] = ai.normalizeCharacters([{ name: 'Joan', profession: 'Metge', possibleMotive: 'Deute amb la víctima', description: 'Observador.', personality: 'Reservat.', secret: 'Amaga un deute.', secretKnowledge: 'Maria va veure la víctima.', rumor: 'Té deutes.', coartada }], {
    assassin: 'Joan', relationsMatrix: { relations: [{ a: 'Joan', b: 'Maria', type: 'debt', strength: 'high', note: 'Comparteixen un deute.' }] }
  });
  assert.equal(character!.profession, 'Metge');
  assert.equal(character!.possibleMotive, 'Deute amb la víctima');
  assert.deepEqual(character!.coartada, coartada);
  assert.equal(character!.isAssassin, true);
  assert.ok(character!.relationships.includes('deute (alta) amb Maria'));
});
