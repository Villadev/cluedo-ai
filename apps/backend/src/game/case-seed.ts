import { randomInt } from 'node:crypto';
import { LOCATIONS, WEAPONS } from '../config/game-options.js';
import type { FullCase } from '../types/game.types.js';

type CaseSeed = Pick<FullCase, 'assassin' | 'weapon' | 'location' | 'crimeWindow'>;

const START_TIMES = ['18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00', '22:30', '23:00'];

function choose<T>(options: T[], recent: (T | undefined)[]): T {
  const fresh = options.filter(option => !recent.includes(option));
  if (fresh.length) return fresh[randomInt(fresh.length)]!;
  // When the pool is exhausted, reuse the option seen longest ago.
  return options.reduce((oldest, option) => recent.indexOf(option) > recent.indexOf(oldest) ? option : oldest);
}

export function createCaseSeed(names: string[], recent: Partial<CaseSeed>[] = []): CaseSeed {
  const participantNames = new Set(names.map(name => name.trim().toLowerCase()));
  if (names.length < 3 || participantNames.size !== names.length) {
    throw new Error('Calen almenys tres participants amb noms diferents.');
  }

  const start = choose(START_TIMES, recent.map(seed => seed.crimeWindow?.start));
  const [hour, minute] = start.split(':').map(Number);
  const end = minute === 0 ? `${hour}:30` : `${hour! + 1}:00`;

  return {
    assassin: choose(names, recent.map(seed => seed.assassin)),
    weapon: choose(WEAPONS, recent.map(seed => seed.weapon)),
    location: choose(LOCATIONS, recent.map(seed => seed.location)),
    crimeWindow: { start, end }
  };
}
