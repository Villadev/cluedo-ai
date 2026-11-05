import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCanonicalTimeline, validatePlan, validateRelations } from '../game/case-validation.js';

const names = ['Oriol', 'Andrea', 'Sospitós 1', 'Sospitós 2'];
const seed = { assassin: 'Oriol', location: 'Can Coll', crimeWindow: { start: '21:00', end: '21:30' } };
const character = (name: string, location: string, start = '20:50', end = '21:40') => ({
  name, profession: 'Investigador', description: 'Personatge de prova', personality: 'Reservat', possibleMotive: 'Disputa antiga', relationships: 'Coneix els altres', tensions: 'Desconfiança', secret: 'Un secret', secretKnowledge: name === 'Andrea' ? 'Oriol coneix el secret' : 'Andrea coneix el secret', rumor: 'Una sospita',
  coartada: { location, timeStart: start, timeEnd: end, witness: 'Ningú', credibility: 'baixa' as const }
});
test('2 humans + 2 NPCs: una coartada falsa no invalida el pla', () => {
  const characters = [character('Oriol', 'Bar La Plaça'), character('Andrea', 'Can Coll'), character('Sospitós 1', 'Can Coll'), character('Sospitós 2', 'Can Coll')];
  assert.deepEqual(validatePlan(characters, seed, names), []);
  const timeline = buildCanonicalTimeline({ ...seed, characters });
  assert.equal(timeline.presences[0]?.location, 'Can Coll');
  assert.equal(timeline.statements.find(s => s.characterName === 'Oriol')?.conflictsWithTruth, true);
  assert.equal(timeline.statements.find(s => s.characterName === 'Oriol')?.verified, false);
});
test('2 humans + 2 NPCs: accepta una cronologia compatible', () => {
  const characters = [character('Oriol', 'Bar La Plaça', '20:00', '20:50'), character('Andrea', 'Can Coll'), character('Sospitós 1', 'Can Coll'), character('Sospitós 2', 'Can Coll')];
  assert.deepEqual(validatePlan(characters, seed, names), []);
  assert.equal(buildCanonicalTimeline({ ...seed, characters }).statements[0]?.conflictsWithTruth, false);
});
test('rebutja secrets que neguen explícitament el vincle', () => {
  const matrix = { relations: [
    { a: 'Oriol', b: 'Andrea', type: 'secret' as const, strength: 'low' as const, note: 'No hi ha cap relació verificada.' },
    { a: 'Sospitós 1', b: 'Sospitós 2', type: 'ally' as const, strength: 'medium' as const, note: 'Treballen junts.' }
  ] };
  assert.ok(validateRelations(matrix, names, 'Elvira Font').some(i => i.includes('sense vincle')));
});

test('no exigeix inventar vincles per a cada sospitós', () => {
  assert.deepEqual(validateRelations({ relations: [] }, names, 'Elvira Font'), []);
  assert.deepEqual(validateRelations({ relations: [
    { a: 'Oriol', b: 'Andrea', type: 'ally', strength: 'low', note: 'Treballen junts.' }
  ] }, names, 'Elvira Font'), []);
});

test('accepta testimonis declarats que contradiuen la seva pròpia coartada', () => {
  const characters = [
    { ...character('Oriol', 'Bar La Plaça'), coartada: { ...character('Oriol', 'Bar La Plaça').coartada, witness: 'Andrea' } },
    character('Andrea', 'Can Coll'),
    character('Sospitós 1', 'Can Coll'),
    character('Sospitós 2', 'Can Coll')
  ];
  assert.deepEqual(validatePlan(characters, seed, names), []);
});

test('rebutja testimonis que no són participants', () => {
  const characters = [
    { ...character('Oriol', 'Bar La Plaça'), coartada: { ...character('Oriol', 'Bar La Plaça').coartada, witness: 'Persona inventada' } },
    character('Andrea', 'Can Coll'),
    character('Sospitós 1', 'Can Coll'),
    character('Sospitós 2', 'Can Coll')
  ];
  assert.ok(validatePlan(characters, seed, names).some(i => i.includes('Testimoni desconegut')));
});
