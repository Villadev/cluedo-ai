import { Character, Clue, DetectiveMatrix, MatrixCell } from '../types/game.types';

export function buildDetectiveMatrix(input: {
  characters: Character[];
  clues: Clue[];
}): DetectiveMatrix {
  const cells: MatrixCell[] = input.characters.map(char => ({
    suspectId: char.id,
    score: 0,
    contradictions: 0,
    supports: 0
  }));

  input.clues.forEach(clue => {
    if (!clue.subjects) return;

    clue.subjects.forEach(subjectId => {
      const cell = cells.find(c => c.suspectId === subjectId);
      if (!cell) return;

      if (clue.truth === true) {
        cell.score += 2;
        cell.supports += 1;
      }

      if (clue.type === "contradiction") {
        cell.contradictions += 1;
        cell.score -= 3;
      }
    });
  });

  // Find the suspect with the highest score
  let maxScore = -Infinity;
  let culpritId: string | null = null;

  cells.forEach(cell => {
    if (cell.score > maxScore) {
      maxScore = cell.score;
      culpritId = cell.suspectId;
    }
  });

  return {
    cells,
    culpritId
  };
}
