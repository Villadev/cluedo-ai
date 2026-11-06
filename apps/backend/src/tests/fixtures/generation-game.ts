import type { Game } from '../../types/game.types.js';
import { GameStoreService } from '../../services/game-store.service.js';
export function gameFor(count: number): Game {
  return {
    id: `test-${count}`, state: 'GENERATING',
    players: Array.from({ length: count }, (_, i) => ({
      id: `player-${i}`, nickname: `Persona ${i + 1}`, characterId: null,
      isReady: true, isEliminated: false, hasAccused: false, askedThisRound: false,
      accusedThisRound: false, accusationCooldown: 0, type: 'real' as const
    })), characters: [], assassinCharacterId: null, murder: null, introNarrative: null,
    solution: null, clues: [], turns: [], currentTurnIndex: 0, roundNumber: 1,
    maxRounds: 3, tensionLevel: 0, difficulty: 'hard', winnerPlayerId: null,
    winnerType: null, timeline: [], chatHistory: [], questionHistory: [], nextSequenceId: 1,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
}
export function memoryStore(initial: Game) {
  let saved = structuredClone(initial);
  return {
    getById: () => structuredClone(saved),
    list: () => [structuredClone(saved)],
    save: (value: Game) => { saved = structuredClone(value); }
  } as unknown as GameStoreService;
}
