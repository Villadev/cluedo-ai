import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AIService } from '../services/AIService.js';
import { WEAPONS, LOCATIONS } from '../config/game-options.js';

test('case skeleton is fixed by the backend without an API request', async () => {
  const seed = await new AIService().generateCaseSkeleton('seed', ['Joan', 'Maria', 'Pere'], 'hard');
  assert.ok(['Joan', 'Maria', 'Pere'].includes(seed.assassin!));
  assert.ok(!['Joan', 'Maria', 'Pere'].includes(seed.victim!));
  assert.ok(WEAPONS.includes(seed.weapon!));
  assert.ok(LOCATIONS.includes(seed.location!));
  assert.deepEqual(seed.crimeWindow, { start: '21:00', end: '21:30' });
});
