import { Character, Clue, DetectiveMatrix } from '../types/game.types';

export function validateCase(input: {
  characters: Character[];
  clues: Clue[];
  matrix: DetectiveMatrix;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const killer = input.characters.find(c => c.isAssassin);
  if (!killer) {
    errors.push("Exactly 1 killer required");
  } else {
    const incriminatingClues = input.clues.filter(c =>
      c.truth === true &&
      c.subjects?.includes(killer.id)
    );
    if (incriminatingClues.length < 2) {
      errors.push("Killer must have at least 2 incriminating clues");
    }

    if (killer.alibi && killer.alibi.credibility > 1) {
        errors.push("Killer alibi credibility must be 0 or 1");
    }

    if (input.matrix.culpritId !== killer.id) {
        errors.push("Detective matrix culprit must be the actual killer");
    }
  }

  const contradictionClues = input.clues.filter(c => c.type === "contradiction");
  if (contradictionClues.length < 2) {
    errors.push("At least 2 contradiction clues are required");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
