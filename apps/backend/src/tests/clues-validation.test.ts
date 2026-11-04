import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AIService } from '../services/AIService.js';
import type { FullCase } from '../types/game.types.js';

test('coverage requires at least two clues under each exact round key', () => {
  const clue = { type: 'witness' as const, text: 'Joan era al bar a les 20:00.', isTrue: true };
  const caseData = { clues: { round1: [clue, clue], round2: [clue], round4: [clue, clue] } } as unknown as FullCase;
  assert.deepEqual(new AIService().validateClueCoverage(caseData, 3), [2, 3]);
});
