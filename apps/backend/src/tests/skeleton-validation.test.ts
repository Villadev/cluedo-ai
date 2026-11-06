import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AIService } from '../services/AIService.js';
import { WEAPONS, LOCATIONS } from '../config/game-options.js';

test('case skeleton is fixed by the backend without an API request', async () => {
  const seed = await new AIService().generateCaseSkeleton('seed', ['Joan', 'Maria', 'Pere'], 'hard');
  assert.ok(['Joan', 'Maria', 'Pere'].includes(seed.assassin!));
  assert.equal(seed.victim, undefined);
  assert.ok(WEAPONS.includes(seed.weapon!));
  assert.ok(LOCATIONS.includes(seed.location!));
  assert.ok(seed.crimeWindow!.start < seed.crimeWindow!.end);
});
