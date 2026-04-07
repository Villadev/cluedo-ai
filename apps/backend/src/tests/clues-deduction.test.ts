import { AIService } from '../services/AIService.js';

const aiService = new AIService() as any;

const testCluesDeduction = () => {
    console.log("Testing clues deduction signal validation...");

    const caseBible = {
        characters: [{ name: 'Joan' }, { name: 'Maria' }],
        victim: 'Pere',
        assassin: 'Joan',
        weapon: 'Ganivet',
        location: 'Celler',
        clues: {}
    };
    const maxRounds = 1;

    const validator = (data: any) => {
        aiService.normalizeCluesResponse(data);
        const errors: string[] = [];

        if (!data.clues) {
            errors.push("Missing 'clues' root object");
        } else {
            const missing = aiService.validateClueCoverage({ clues: data.clues }, maxRounds);
            if (missing.length > 0) {
                errors.push(`Missing rounds: ${missing.join(', ')}`);
            }

            const characterNames = caseBible.characters.map(c => aiService.normalizeName(c.name));
            const timeRegex = /\b([01]\d|2[0-3]):[0-5]\d\b/;
            const keywordsRegex = /coartada|testimoni|contradicció/i;

            Object.values(data.clues).forEach((roundClues: any) => {
                roundClues.forEach((clue: any) => {
                    if (!clue.text) errors.push("Clue text is empty");
                    if (!['rumor', 'witness', 'contradiction', 'evidence'].includes(clue.type)) errors.push(`Invalid clue type: ${clue.type}`);
                    if (typeof clue.isTrue !== 'boolean') errors.push("isTrue must be boolean");

                    const normalizedText = aiService.normalizeName(clue.text || '');
                    const hasName = characterNames.some(name => normalizedText.includes(name));
                    const hasTime = timeRegex.test(clue.text || '');
                    const hasKeyword = keywordsRegex.test(clue.text || '');

                    if (!hasName && !hasTime && !hasKeyword) {
                        errors.push(`Clue lacks deduction signals: ${clue.text}`);
                    }
                });
            });
        }
        return { valid: errors.length === 0, details: { errors } };
    };

    // Case 1: Valid clue with name
    const validDataName = {
        clues: { round1: [{ type: 'rumor', text: 'En Joan estava nerviós.', isTrue: true }] }
    };
    if (validator(validDataName).valid) {
        console.log("PASS: clue with name accepted");
    } else {
        console.error("FAIL: clue with name rejected", validator(validDataName).details.errors);
        process.exit(1);
    }

    // Case 2: Valid clue with time
    const validDataTime = {
        clues: { round1: [{ type: 'witness', text: 'Algú va marxar a les 22:30.', isTrue: true }] }
    };
    if (validator(validDataTime).valid) {
        console.log("PASS: clue with time accepted");
    } else {
        console.error("FAIL: clue with time rejected", validator(validDataTime).details.errors);
        process.exit(1);
    }

    // Case 3: Valid clue with keyword
    const validDataKeyword = {
        clues: { round1: [{ type: 'contradiction', text: 'Hi ha una contradicció en el que es diu.', isTrue: true }] }
    };
    if (validator(validDataKeyword).valid) {
        console.log("PASS: clue with keyword accepted");
    } else {
        console.error("FAIL: clue with keyword rejected", validator(validDataKeyword).details.errors);
        process.exit(1);
    }

    // Case 4: Invalid clue (vague)
    const invalidDataVague = {
        clues: { round1: [{ type: 'rumor', text: 'Sembla que plourà demà.', isTrue: true }] }
    };
    if (!validator(invalidDataVague).valid) {
        console.log("PASS: vague clue rejected");
    } else {
        console.error("FAIL: vague clue accepted");
        process.exit(1);
    }
};

testCluesDeduction();
process.exit(0);
