import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePlan, validateRelations } from '../game/case-validation.js';

const names = ['Oriol', 'Andrea', 'Sospitós 1', 'Sospitós 2'];
const seed = { assassin: 'Oriol', location: 'Can Coll', crimeWindow: { start: '21:00', end: '21:30' } };
const character = (name: string, location: string, start = '20:50', end = '21:40') => ({
  name, secret: 'Un secret', secretKnowledge: 'Andrea coneix el secret', rumor: 'Una sospita',
  coartada: { location, timeStart: start, timeEnd: end, witness: 'Ningú', credibility: 'baixa' as const }
});
test('2 humans + 2 NPCs: detecta la coartada incompatible del culpable', () => {
  const characters = [character('Oriol', 'Bar La Plaça'), character('Andrea', 'Can Coll'), character('Sospitós 1', 'Can Coll'), character('Sospitós 2', 'Can Coll')];
  assert.ok(validatePlan(characters, seed, names).some(i => i.includes('se solapa')));
});
test('2 humans + 2 NPCs: accepta una cronologia compatible', () => {
  const characters = [character('Oriol', 'Bar La Plaça', '20:00', '20:50'), character('Andrea', 'Can Coll'), character('Sospitós 1', 'Can Coll'), character('Sospitós 2', 'Can Coll')];
  assert.deepEqual(validatePlan(characters, seed, names), []);
});
test('rebutja secrets que neguen explícitament el vincle', () => {
  const matrix = { relations: [
    { a: 'Oriol', b: 'Andrea', type: 'secret' as const, strength: 'low' as const, note: 'No hi ha cap relació verificada.' },
    { a: 'Sospitós 1', b: 'Sospitós 2', type: 'ally' as const, strength: 'medium' as const, note: 'Treballen junts.' }
  ] };
  assert.ok(validateRelations(matrix, names, 'Elvira Font').some(i => i.includes('sense vincle')));
});
