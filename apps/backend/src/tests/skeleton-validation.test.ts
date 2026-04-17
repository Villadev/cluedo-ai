import { AIService } from '../services/AIService.js';
import { Difficulty } from '../types/game.types.js';

async function testSkeletonValidation() {
  const aiService = new AIService() as any;
  const gameId = 'test-game-id';
  const difficulty: Difficulty = 'hard';
  const allowedParticipantNames = ['Joan', 'Maria', 'Pere'];

  console.log("--- Testing Skeleton Validator ---");

  const originalCall = aiService.callOpenAIWithRetry;

  let capturedValidator: any = null;
  aiService.callOpenAIWithRetry = async (gid: any, inst: any, sn: any, ph: any, validator: any) => {
    capturedValidator = validator;
    return {}; // Mock return
  };

  await aiService.generateCaseSkeleton(gameId, allowedParticipantNames, difficulty);

  const validator = capturedValidator;
  if (!validator) {
    console.error("Failed to capture validator");
    process.exit(1);
  }

  const testCases = [
    {
      name: "Valid skeleton",
      data: {
        victim: "Sr. Burns",
        weapon: "Ganivet",
        location: "Cuina",
        assassin: "Joan",
        crimeWindow: { start: "20:00", end: "22:00" }
      },
      expected: true
    },
    {
      name: "Invalid: Assassin not in participants",
      data: {
        victim: "Sr. Burns",
        weapon: "Ganivet",
        location: "Cuina",
        assassin: "Steve",
        crimeWindow: { start: "20:00", end: "22:00" }
      },
      expected: false
    },
    {
      name: "Invalid: Victim in participants",
      data: {
        victim: "Maria",
        weapon: "Ganivet",
        location: "Cuina",
        assassin: "Joan",
        crimeWindow: { start: "20:00", end: "22:00" }
      },
      expected: false
    },
    {
      name: "Invalid: Missing field",
      data: {
        victim: "Sr. Burns",
        weapon: "Ganivet",
        assassin: "Joan",
        crimeWindow: { start: "20:00", end: "22:00" }
      },
      expected: false
    }
  ];

  let allPassed = true;
  for (const tc of testCases) {
    const { valid, details } = validator(tc.data);
    if (valid === tc.expected) {
      console.log(`PASS: ${tc.name}`);
    } else {
      console.log(`FAIL: ${tc.name} (Expected ${tc.expected}, got ${valid})`);
      console.log(`Details: `, details);
      allPassed = false;
    }
  }

  if (allPassed) {
    console.log("\nSKELETON VALIDATION TESTS PASSED");
  } else {
    console.log("\nSKELETON VALIDATION TESTS FAILED");
    process.exit(1);
  }
}

testSkeletonValidation();
