import type { AIServiceCharacter, FullCase, RelationshipMatrix } from '../types/game.types.js';
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
    const a = normalizeName(r.a), b = normalizeName(r.b);
    const key = [a, b].sort().join('|');
    if (!allowed.has(a) || !allowed.has(b) || a === b || pairs.has(key)) issues.push('Relació desconeguda, repetida o amb un mateix.');
    pairs.add(key);
  }
  for (const n of names) {
    if (!matrix.relations.some(r => [r.a, r.b].map(normalizeName).includes(normalizeName(n)))) issues.push(`Falten relacions per a ${n}.`);
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
    if (a.witness !== 'Ningú') {
      const witness = characters.find(w => normalizeName(w.name || '') === normalizeName(a.witness));
      if (!witness || witness === c || !witness.coartada || witness.coartada.location !== a.location ||
          minutes(witness.coartada.timeStart) > minutes(a.timeStart) || minutes(witness.coartada.timeEnd) < minutes(a.timeEnd)) {
        issues.push(`El testimoni de ${c.name} no coincideix en lloc i horari.`);
      }
    }
    if (normalizeName(c.name || '') === normalizeName(seed.assassin || '') && a.credibility === 'alta' && a.witness !== 'Ningú' &&
        seed.crimeWindow && minutes(a.timeStart) <= minutes(seed.crimeWindow.start) && minutes(a.timeEnd) >= minutes(seed.crimeWindow.end) && a.location !== seed.location) {
      issues.push('La coartada confirmada del culpable impedeix el crim.');
    }
  }
  return issues;
}
