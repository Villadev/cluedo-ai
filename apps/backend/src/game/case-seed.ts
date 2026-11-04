import { randomInt } from 'node:crypto';
import { LOCATIONS, WEAPONS } from '../config/game-options.js';
import type { FullCase } from '../types/game.types.js';

export function createCaseSeed(names: string[]): Partial<FullCase> {
  if (names.length < 3 || new Set(names.map(n => n.trim().toLowerCase())).size !== names.length) {
    throw new Error('Calen almenys tres participants amb noms diferents.');
  }
  const victims = ['Elvira Font', 'Ramon Soler', 'Mercè Vidal', 'Esteve Roca'];
  let victim = victims.find(n => !names.some(p => p.trim().toLowerCase() === n.toLowerCase()))
    ?? 'Visitant del poble';
  while (names.some(p => p.trim().toLowerCase() === victim.toLowerCase())) victim += ' extern';
  return {
    assassin: names[randomInt(names.length)]!, victim,
    weapon: WEAPONS[randomInt(WEAPONS.length)]!,
    location: LOCATIONS[randomInt(LOCATIONS.length)]!,
    crimeWindow: { start: '21:00', end: '21:30' }
  };
}
