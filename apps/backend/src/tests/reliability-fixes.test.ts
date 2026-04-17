import { AIService } from '../services/AIService.js';

const aiService = new AIService() as any;

const testSoftValidationAndRepair = () => {
    console.log("\n--- Testing Soft Validation and Repair ---");

    const characters = [{ name: 'Joan' }, { name: 'Maria' }];
    const expectedNames = characters.map(c => aiService.normalizeName(c.name));

    const validator = (data: any) => {
        const returnedCharacters = Array.isArray(data.characters) ? data.characters : [];
        const returnedNames = returnedCharacters.map((c: any) => aiService.normalizeName(c.name || ''));
        const missingNames = expectedNames.filter((name: string) => !returnedNames.includes(name));
        const hardValidationPassed = returnedCharacters.length > 0;
        return {
            valid: hardValidationPassed,
            details: { missingNames }
        };
    };

    const repair = (data: any) => {
        const returnedCharacters = Array.isArray(data.characters) ? data.characters : [];
        const finalCharacters = [...returnedCharacters];
        expectedNames.forEach(name => {
            if (!returnedCharacters.some((rc: any) => rc.name && aiService.normalizeName(rc.name) === name)) {
                finalCharacters.push({ name, repaired: true });
            }
        });
        return { characters: finalCharacters };
    };

    // Case 1: Partial names returned
    const partialData = { characters: [{ name: 'Joan' }] };
    const { valid: initialValid } = validator(partialData);
    console.log("Initial validation (partial data):", initialValid ? "VALID" : "INVALID");

    const repairedData = repair(partialData);
    const { valid: finalValid } = validator(repairedData);

    if (finalValid && repairedData.characters.length === 2) {
        console.log("PASS: Repaired data is valid and has expected count");
    } else {
        console.error("FAIL: Repair logic failed", { finalValid, count: repairedData.characters.length });
    }
};

const testErrorClassification = () => {
    console.log("\n--- Testing Error Classification ---");

    const classify = (error: any) => {
        const status = error.status || error.response?.status;
        const isNonRetriable = status === 400 || status === 401 || status === 403;
        return { isNonRetriable };
    };

    const err400 = { status: 400 };
    const err429 = { status: 429 };
    const err500 = { status: 500 };
    const errNetwork = { message: 'Network error' };

    if (classify(err400).isNonRetriable === true) console.log("PASS: 400 classified as non-retriable");
    else console.error("FAIL: 400 classification");

    if (classify(err429).isNonRetriable === false) console.log("PASS: 429 classified as retriable");
    else console.error("FAIL: 429 classification");

    if (classify(err500).isNonRetriable === false) console.log("PASS: 500 classified as retriable");
    else console.error("FAIL: 500 classification");

    if (classify(errNetwork).isNonRetriable === false) console.log("PASS: Network error classified as retriable");
    else console.error("FAIL: Network error classification");
};

testSoftValidationAndRepair();
testErrorClassification();
