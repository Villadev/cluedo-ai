import { AIService } from '../services/AIService.js';

const aiService = new AIService() as any;

const testNameValidation = () => {
    console.log("Testing name validation in generateBasicCharacters validator...");

    const expectedCount = 2;
    const allowedPlayerNames = ['Joan', 'Maria'];
    const caseBible = { assassin: 'Joan', victim: 'Pere' };

    const validator = (data: any) => {
        const characters = data.characters || [];
        const returnedCount = characters.length;

        const assassinMatched = characters.some((c: any) => aiService.normalizeName(c.name || '') === aiService.normalizeName(caseBible.assassin || ''));
        const uniqueNames = new Set(characters.map((c: any) => aiService.normalizeName(c.name || '')));
        const allNamesAllowed = characters.every((c: any) => allowedPlayerNames.some(allowed => aiService.normalizeName(allowed) === aiService.normalizeName(c.name || '')));

        const valid = returnedCount === expectedCount && assassinMatched && uniqueNames.size === expectedCount && allNamesAllowed;

        return {
            valid,
            details: {
                expectedCount,
                returnedCount,
                assassinExpected: caseBible.assassin,
                assassinMatched,
                uniqueNamesCount: uniqueNames.size,
                allNamesAllowed
            }
        };
    };

    // Case 1: Valid
    const validData = {
        characters: [
            { name: 'Joan', profession: 'P1', possibleMotive: 'M1' },
            { name: 'Maria', profession: 'P2', possibleMotive: 'M2' }
        ]
    };
    if (validator(validData).valid) {
        console.log("PASS: valid names accepted");
    } else {
        console.error("FAIL: valid names rejected", validator(validData));
        process.exit(1);
    }

    // Case 2: Invented name
    const inventedData = {
        characters: [
            { name: 'Joan', profession: 'P1', possibleMotive: 'M1' },
            { name: 'Inventat', profession: 'P2', possibleMotive: 'M2' }
        ]
    };
    if (!validator(inventedData).valid) {
        console.log("PASS: invented name rejected");
    } else {
        console.error("FAIL: invented name accepted");
        process.exit(1);
    }

    // Case 3: Missing assassin
    const noAssassinData = {
        characters: [
            { name: 'Maria', profession: 'P2', possibleMotive: 'M2' },
            { name: 'Joan-Altre', profession: 'P1', possibleMotive: 'M1' }
        ]
    };
    if (!validator(noAssassinData).valid) {
        console.log("PASS: missing assassin rejected");
    } else {
        console.error("FAIL: missing assassin accepted");
        process.exit(1);
    }

    // Case 4: Duplicate names
    const duplicateData = {
        characters: [
            { name: 'Joan', profession: 'P1', possibleMotive: 'M1' },
            { name: 'Joan', profession: 'P2', possibleMotive: 'M2' }
        ]
    };
    if (!validator(duplicateData).valid) {
        console.log("PASS: duplicate names rejected");
    } else {
        console.error("FAIL: duplicate names accepted");
        process.exit(1);
    }
};

testNameValidation();
process.exit(0);
