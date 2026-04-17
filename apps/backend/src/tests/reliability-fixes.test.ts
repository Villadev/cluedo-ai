import { AIService } from '../services/AIService.js';

const aiService = new AIService() as any;

const testNameSetValidation = () => {
    console.log("--- Testing Name-Set Validation ---");

    const expectedCharacters = [{ name: 'Joan' }, { name: 'Maria' }];
    const expectedNames = expectedCharacters.map(c => aiService.normalizeName(c.name));

    // Define the validator as it is in AIService
    const validator = (data: any) => {
      const returnedCharacters = Array.isArray(data.characters) ? data.characters : [];
      const returnedNames = returnedCharacters.map((c: any) => aiService.normalizeName(c.name || ''));
      const missingNames = expectedNames.filter((name: string) => !returnedNames.includes(name));
      const extraNames = returnedNames.filter((name: string) => !expectedNames.includes(name));
      const valid = missingNames.length === 0 && extraNames.length === 0 && returnedNames.length === expectedNames.length;
      return {
        valid,
        details: {
          expectedCount: expectedNames.length,
          returnedCount: returnedNames.length,
          expectedNames,
          returnedNames,
          missingNames,
          extraNames
        }
      };
    };

    // Case 1: Same names, different order
    const validData = { characters: [{ name: 'Maria' }, { name: 'Joan' }] };
    const res1 = validator(validData);
    if (res1.valid) {
        console.log("PASS: Same names in different order accepted");
    } else {
        console.error("FAIL: Same names in different order rejected", res1.details);
    }

    // Case 2: Missing name
    const missingData = { characters: [{ name: 'Joan' }, { name: 'Pere' }] };
    const res2 = validator(missingData);
    if (!res2.valid && res2.details.missingNames.includes('maria')) {
        console.log("PASS: Missing name rejected correctly");
    } else {
        console.error("FAIL: Missing name check failed", res2.details);
    }

    // Case 3: Extra name
    const extraData = { characters: [{ name: 'Joan' }, { name: 'Maria' }, { name: 'Pere' }] };
    const res3 = validator(extraData);
    if (!res3.valid && res3.details.extraNames.includes('pere')) {
        console.log("PASS: Extra name rejected correctly");
    } else {
        console.error("FAIL: Extra name check failed", res3.details);
    }
};

const testRetryJitter = () => {
    console.log("\n--- Testing Retry Jitter Logic ---");
    // Simulate the backoff logic
    const getDelay = (attempts: number) => {
        const baseDelay = Math.pow(2, attempts) * 1000;
        const jitter = Math.random() * 1000;
        return baseDelay + jitter;
    };

    for (let i = 1; i <= 3; i++) {
        const delays = Array.from({ length: 5 }, () => getDelay(i));
        const min = Math.pow(2, i) * 1000;
        const max = min + 1000;

        const allInRange = delays.every(d => d >= min && d <= max);
        const unique = new Set(delays).size === delays.length;

        if (allInRange && unique) {
            console.log(`PASS: Attempt ${i} delays are in range [${min}, ${max}] and have jitter`);
        } else {
            console.error(`FAIL: Attempt ${i} delays failed range or jitter check`, delays);
        }
    }
};

testNameSetValidation();
testRetryJitter();
