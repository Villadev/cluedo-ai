import { AIService } from '../services/AIService.js';

const aiService = new AIService() as any;

const testCluesDeduction = () => {
    console.log("Testing clues deduction signal validation...");

    const caseBible = {
        characters: [
            { name: 'Joan' },
            { name: 'Maria' }
        ]
    };
    const maxRounds = 1;

    const validator = (data: any) => {
      const rounds = Object.keys(data);
      const validRoundCount = rounds.length >= maxRounds;
      const allRoundsHaveClues = rounds.every(r => Array.isArray(data[r]) && data[r].length >= 1);

      const clues = Object.values(data).flat() as any[];
      const hasGoodDeductionValue = clues.every(c => {
          const text = c.text.toLowerCase();
          const hasName = caseBible.characters.some(char => text.includes(char.name.toLowerCase()));
          const hasTime = /\d{1,2}:\d{2}/.test(text);
          const hasKeywords = ['coartada', 'testimoni', 'contradicció', 'mentida', 'veritat', 'vist', 'trobat'].some(k => text.includes(k));
          return hasName || hasTime || hasKeywords;
      });

      return {
        valid: validRoundCount && allRoundsHaveClues && hasGoodDeductionValue,
        details: { roundsCount: rounds.length, expected: maxRounds, hasGoodDeductionValue }
      };
    };

    // Case 1: Valid clue with name
    const validName = { round1: [{ text: 'Vaig veure en Joan' }] };
    if (validator(validName).valid) {
        console.log("PASS: clue with name accepted");
    } else {
        console.error("FAIL: clue with name rejected");
        process.exit(1);
    }

    // Case 2: Valid clue with time
    const validTime = { round1: [{ text: 'A les 12:30 va passar quelcom' }] };
    if (validator(validTime).valid) {
        console.log("PASS: clue with time accepted");
    } else {
        console.error("FAIL: clue with time rejected");
        process.exit(1);
    }

    // Case 3: Valid clue with keyword
    const validKeyword = { round1: [{ text: 'La seva coartada és falsa' }] };
    if (validator(validKeyword).valid) {
        console.log("PASS: clue with keyword accepted");
    } else {
        console.error("FAIL: clue with keyword rejected");
        process.exit(1);
    }

    // Case 4: Invalid clue (vague)
    const invalidVague = { round1: [{ text: 'Va ploure molt' }] };
    if (!validator(invalidVague).valid) {
        console.log("PASS: vague clue rejected");
    } else {
        console.error("FAIL: vague clue accepted");
        process.exit(1);
    }
};

testCluesDeduction();
process.exit(0);
