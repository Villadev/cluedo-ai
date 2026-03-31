import { AIService } from '../services/AIService.js';

// Mock some of AIService to test specifically the normalization and validation
const aiService = new AIService() as any;

const testNormalizeClues = () => {
    console.log("Testing normalizeCluesResponse...");

    const data: any = {
        clues: {
            round1: [
                { type: 'rumor', text: 'Some text', misleading: true },
                { text: 'Another text', misleading: false }
            ]
        }
    };

    aiService.normalizeCluesResponse(data);

    if (data.clues.round1[0].isTrue === false && data.clues.round1[1].isTrue === true) {
        console.log("PASS: misleading mapped to isTrue correctly");
    } else {
        console.error("FAIL: misleading mapping failed", data.clues.round1);
        process.exit(1);
    }

    if (data.clues.round1[1].type === 'rumor') {
        console.log("PASS: default type applied");
    } else {
        console.error("FAIL: default type not applied");
        process.exit(1);
    }
};

const testCluesValidation = () => {
    console.log("\nTesting clues validation logic...");

    const maxRounds = 2;

    const testValidation = (cluesData: any) => {
        aiService.normalizeCluesResponse(cluesData);
        const errors: string[] = [];
        if (!cluesData.clues) {
            errors.push("Missing 'clues' root object");
        } else {
            const missing = aiService.validateClueCoverage({ clues: cluesData.clues }, maxRounds);
            if (missing.length > 0) {
                errors.push(`Missing rounds: ${missing.join(', ')}`);
            }
            for (const [roundKey, roundClues] of Object.entries(cluesData.clues)) {
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
        }
        return errors;
    };

    // Case 1: Valid clues
    const validData = {
        clues: {
            round1: [{ type: 'rumor', text: 'T1', isTrue: true }],
            round2: [{ type: 'witness', text: 'T2', isTrue: false }]
        }
    };
    if (testValidation(validData).length === 0) {
        console.log("PASS: valid clues accepted");
    } else {
        console.error("FAIL: valid clues rejected", testValidation(validData));
        process.exit(1);
    }

    // Case 2: Normalizable clues
    const normalizableData = {
        clues: {
            round1: [{ text: 'T1', misleading: true }],
            round2: [{ text: 'T2', misleading: false }]
        }
    };
    if (testValidation(normalizableData).length === 0) {
        console.log("PASS: normalizable clues accepted");
    } else {
        console.error("FAIL: normalizable clues rejected", testValidation(normalizableData));
        process.exit(1);
    }

    // Case 3: Missing round
    const missingRoundData = {
        clues: {
            round1: [{ text: 'T1', isTrue: true }]
        }
    };
    if (testValidation(missingRoundData).length > 0) {
        console.log("PASS: missing round detected");
    } else {
        console.error("FAIL: missing round not detected");
        process.exit(1);
    }

    // Case 4: Empty text
    const emptyTextData = {
        clues: {
            round1: [{ text: '', isTrue: true }],
            round2: [{ text: 'T2', isTrue: false }]
        }
    };
    if (testValidation(emptyTextData).length > 0) {
        console.log("PASS: empty text detected");
    } else {
        console.error("FAIL: empty text not detected");
        process.exit(1);
    }
};

testNormalizeClues();
testCluesValidation();
process.exit(0);
