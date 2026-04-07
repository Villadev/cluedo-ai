import { Character, Clue, DetectiveMatrix, MatrixCell, Alibi } from '../types/game.types';
import { buildDetectiveMatrix } from '../game/detective-matrix';
import { validateCase } from '../game/case-validation';

function mockCharacter(id: string, name: string, isAssassin: boolean): Character {
    return {
        id,
        name,
        profession: 'test',
        description: 'test',
        personality: 'test',
        possibleMotive: 'test',
        secret: 'test',
        secretKnowledge: 'test',
        coartada: { location: 'test', timeStart: '20:00', timeEnd: '21:00', witness: 'test', credibility: 'baixa' },
        rumor: 'test',
        relationships: 'test',
        tensions: 'test',
        isAssassin
    };
}

function testLogic() {
    console.log("--- Testing Cluedo Deterministic Logic ---");

    const char1 = mockCharacter('1', 'Killer', true);
    const char2 = mockCharacter('2', 'Innocent 1', false);
    const char3 = mockCharacter('3', 'Innocent 2', false);
    const char4 = mockCharacter('4', 'Innocent 3', false);

    const characters = [char1, char2, char3, char4];

    // Killer alibi
    char1.alibi = { location: 'Celler', timeStart: 2000, timeEnd: 2100, credibility: 0, isLie: true };
    char2.alibi = { location: 'Cuina', timeStart: 2000, timeEnd: 2100, credibility: 2, isLie: false, witnessId: '3' };
    char3.alibi = { location: 'Cuina', timeStart: 2000, timeEnd: 2100, credibility: 2, isLie: false, witnessId: '2' };
    char4.alibi = { location: 'Jardi', timeStart: 2000, timeEnd: 2100, credibility: 1, isLie: true };

    const clues: Clue[] = [
        { id: 'c1', type: 'evidence', text: 'K trace', isTrue: true, truth: true, subjects: ['1'], weight: 2, roundNumber: 1, createdAt: '' },
        { id: 'c2', type: 'evidence', text: 'K trace 2', isTrue: true, truth: true, subjects: ['1'], weight: 2, roundNumber: 2, createdAt: '' },
        { id: 'c3', type: 'contradiction', text: 'Liar 1', isTrue: true, truth: false, subjects: ['1'], weight: 1, roundNumber: 1, createdAt: '' },
        { id: 'c4', type: 'contradiction', text: 'Liar 4', isTrue: true, truth: false, subjects: ['4'], weight: 1, roundNumber: 2, createdAt: '' },
        { id: 'c5', type: 'witness', text: 'Saw 1', isTrue: true, truth: true, subjects: ['1'], weight: 1, roundNumber: 1, createdAt: '' },
        { id: 'c6', type: 'witness', text: 'Saw 2', isTrue: true, truth: true, subjects: ['2'], weight: 1, roundNumber: 2, createdAt: '' },
    ];

    console.log("Building Matrix...");
    const matrix = buildDetectiveMatrix({ characters, clues });
    console.log("Matrix result:", JSON.stringify(matrix, null, 2));

    if (matrix.culpritId !== '1') {
        throw new Error("Logic Error: Matrix culprit should be '1'");
    }

    console.log("Validating Case...");
    const validation = validateCase({ characters, clues, matrix });
    console.log("Validation result:", JSON.stringify(validation, null, 2));

    if (!validation.valid) {
        throw new Error("Validation Error: Case should be valid. Errors: " + validation.errors.join(", "));
    }

    console.log("\nLOGIC VERIFICATION SUCCESSFUL");
}

try {
    testLogic();
} catch (e: any) {
    console.error("\nLOGIC VERIFICATION FAILED:", e.message);
    process.exit(1);
}
