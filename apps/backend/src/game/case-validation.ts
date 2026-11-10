import type { AIServiceCharacter, FullCase, RelationshipMatrix } from '../types/game.types.js';
import { describeAlibi } from './alibi-text.js';
export const normalizeName = (name: string) => name.trim().toLocaleLowerCase('ca');
export function exactNames(actual: string[], expected: string[]): boolean {
  const names = actual.map(normalizeName);
  return names.length === expected.length && new Set(names).size === names.length &&
    expected.every(n => names.includes(normalizeName(n)));
}
export function minutes(time: string): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return NaN;
  const [h, m] = time.split(':').map(Number);
  return h! * 60 + m!;
}
export function validateRelations(matrix: RelationshipMatrix, names: string[], victim: string): string[] {
  const allowed = new Set([...names, victim].map(normalizeName));
  const issues: string[] = [];
  const pairs = new Set<string>();
  for (const r of matrix.relations) {
    if (/\b(no (?:hi ha|consta|existeix|tenen|té)|cap (?:vincle|relació)|sense (?:vincle|relació)|no s.ha (?:confirmat|verificat))\b/i.test(r.note)) {
      issues.push(`Relació ${r.a}–${r.b} sense vincle afirmat: no es pot tipificar com ${r.type}.`);
    }
    const a = normalizeName(r.a), b = normalizeName(r.b);
    const key = [a, b].sort().join('|');
    if (!allowed.has(a) || !allowed.has(b) || a === b || pairs.has(key)) issues.push('Relació desconeguda, repetida o amb un mateix.');
    pairs.add(key);
  }
  return issues;
}
export function validatePlan(characters: Partial<AIServiceCharacter>[], seed: Partial<FullCase>, names: string[]): string[] {
  const issues: string[] = [];
  if (!exactNames(characters.map(c => c.name || ''), names)) issues.push('Cal exactament una fitxa per participant.');
  for (const c of characters) {
    const a = c.coartada;
    if (!a || !Number.isFinite(minutes(a.timeStart)) || !Number.isFinite(minutes(a.timeEnd)) || minutes(a.timeStart) >= minutes(a.timeEnd)) {
      issues.push(`Horari invàlid: ${c.name}.`); continue;
    }
    if (!c.secret?.trim() || !c.secretKnowledge?.trim() || !c.rumor?.trim()) issues.push(`Falten secrets o rumors: ${c.name}.`);
    const others = names.filter(n => normalizeName(n) !== normalizeName(c.name || ''));
    if (!others.some(n => c.secretKnowledge?.includes(n))) issues.push(`El coneixement privat de ${c.name} ha de mencionar un altre participant.`);
    if (normalizeName(a.witness) !== normalizeName('Ningú')) {
      const witness = characters.find(w => normalizeName(w.name || '') === normalizeName(a.witness));
      if (!witness || witness === c) {
        issues.push(`Testimoni desconegut o propi: ${c.name}.`);
      }
      // A named witness is a claim, not independently verified presence.
      // Do not reject intentionally false or disputed alibis on co-location alone.
    }

  }
  return issues;
}

/**
 * The crime location is an objective fact. Character alibis are statements,
 * never independent evidence of presence or absence.
 */
export function buildCanonicalTimeline(caseData: Pick<FullCase, 'assassin' | 'location' | 'crimeWindow' | 'characters'>): NonNullable<FullCase['canonicalTimeline']> {
  const presences: NonNullable<FullCase['canonicalTimeline']>['presences'] = [{
    characterName: caseData.assassin, location: caseData.location,
    timeStart: caseData.crimeWindow.start, timeEnd: caseData.crimeWindow.end, source: 'crime'
  }];
  const statements = caseData.characters.map(c => {
    const a = c.coartada;
    const conflictsWithTruth = normalizeName(c.name) === normalizeName(caseData.assassin) &&
      a.location !== caseData.location &&
      minutes(a.timeStart) < minutes(caseData.crimeWindow.end) &&
      minutes(a.timeEnd) > minutes(caseData.crimeWindow.start);
    return {
      characterName: c.name,
      text: describeAlibi(c),
      verified: false,
      conflictsWithTruth
    };
  });
  return { presences, statements };
}
