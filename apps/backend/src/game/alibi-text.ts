import type { AIServiceCharacter } from '../types/game.types.js';

/** Describe a claim without treating a named witness as independent evidence. */
export function describeAlibi(character: Pick<AIServiceCharacter, 'name' | 'coartada'>): string {
  const { name, coartada } = character;
  const location = coartada.location.trim();
  const place = /^el\s/i.test(location) ? `al ${location.slice(3)}` :
    /^els\s/i.test(location) ? `als ${location.slice(4)}` : `a ${location}`;
  const witness = coartada.witness.trim();
  const claim = `${name} diu que era ${place} entre les ${coartada.timeStart} i les ${coartada.timeEnd}.`;
  return !witness || witness.toLocaleLowerCase('ca') === 'ningú'
    ? `${claim} No aporta cap testimoni que pugui confirmar la seva coartada.`
    : `${claim} Segons ${name}, ${witness} ho pot confirmar, però encara falta que aquesta persona ho corrobori.`;
}
