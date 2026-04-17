import { AIService } from '../services/AIService.js';

const aiService = new AIService() as any;

const testCluesValidation = () => {
    console.log("\nTesting clues validation logic...");

    const maxRounds = 2;

    const testValidation = (cluesData: any) => {
        const data = cluesData.clues || cluesData;
        const errors: string[] = [];

        const missing = aiService.validateClueCoverage({ clues: data } as any, maxRounds);
        if (missing.length > 0) {
            errors.push(`Missing rounds: ${missing.join(', ')}`);
        }
        for (const [roundKey, roundClues] of Object.entries(data)) {
            if (!Array.isArray(roundClues)) {
                errors.push(`${roundKey} is not an array`);
                continue;
            }
            for (const [idx, clue] of (roundClues as any[]).entries()) {
                if (!clue.text || typeof clue.text !== 'string' || clue.text.trim() === '') {
                    errors.push(`${roundKey}[${idx}] has empty or invalid text`);
                }
                if (!clue.type || typeof clue.type !== 'string') {
                    errors.push(`${roundKey}[${idx}] has missing or invalid type`);
                }
                if (typeof clue.isTrue !== 'boolean') {
                    errors.push(`${roundKey}[${idx}] has missing or invalid isTrue boolean`);
                }
            }
        }
        return errors;
    };

    // Case 1: Valid clues
    const validData = {
        round1: [{ type: 'rumor', text: 'T1', isTrue: true }],
        round2: [{ type: 'witness', text: 'T2', isTrue: false }]
    };
    if (testValidation(validData).length === 0) {
        console.log("PASS: valid clues accepted");
    } else {
        console.error("FAIL: valid clues rejected", testValidation(validData));
        process.exit(1);
    }

    // Case 2: Missing round
    const missingRoundData = {
        round1: [{ text: 'T1', type: 'rumor', isTrue: true }]
    };
    if (testValidation(missingRoundData).length > 0) {
        console.log("PASS: missing round detected");
    } else {
        console.error("FAIL: missing round not detected");
        process.exit(1);
    }

    // Case 3: Empty text
    const emptyTextData = {
        round1: [{ text: '', type: 'rumor', isTrue: true }],
        round2: [{ text: 'T2', type: 'witness', isTrue: false }]
    };
    if (testValidation(emptyTextData).length > 0) {
        console.log("PASS: empty text detected");
    } else {
        console.error("FAIL: empty text not detected");
        process.exit(1);
    }
};

testCluesValidation();
process.exit(0);
