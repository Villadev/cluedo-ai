import { AIService } from '../services/AIService.js';
import { FullCase } from '../types/game.types.js';

async function testClueCoverage() {
  console.log("Starting Clue Coverage Test...");
  const aiService = new AIService();
  const maxRounds = 5;

  try {
    const mockCase: FullCase = {
      victim: "Test", weapon: "Corda", location: "Carrer Major", assassin: "S1",
      crimeWindow: { start: "21:00", end: "22:00" },
      characters: [{ name: "S1", profession: "P1", description: "D1", personality: "Pers1", possibleMotive: "M1", secret: "S1", secretKnowledge: "K1", coartada: { location: "L1", timeStart: "21:00", timeEnd: "22:00", witness: "W1", credibility: "alta" }, rumor: "R1", relationships: "Rel1", tensions: "T1" }],
      introductionNarrative: "Intro...", solutionNarrative: "Solution...",
      clues: {
        "round1": [{ type: "rumor", text: "C1", isTrue: true }],
        "round3": [{ type: "rumor", text: "C3", isTrue: true }]
      }
    };

    console.log("--- CASE 1: Validation ---");
    const missing = (aiService as any).validateClueCoverage(mockCase, maxRounds);
    console.log("Missing rounds:", missing);
    if (missing.length === 3 && missing.includes("round2") && missing.includes("round4") && missing.includes("round5")) {
      console.log("✅ validateClueCoverage passed.");
    } else {
      throw new Error("validateClueCoverage failed.");
    }

    console.log("--- CASE 2: Fallback Application ---");
    const fixedCase = (aiService as any).applyFallbackClues(mockCase, missing);
    const stillMissing = (aiService as any).validateClueCoverage(fixedCase, maxRounds);
    if (stillMissing.length === 0) {
      console.log("✅ applyFallbackClues passed.");
    } else {
      throw new Error("applyFallbackClues failed.");
    }

    console.log("--- CASE 3: Empty Clues Initial State ---");
    const emptyCase: FullCase = { ...mockCase, clues: {} };
    const missingAll = (aiService as any).validateClueCoverage(emptyCase, maxRounds);
    const fullyFixed = (aiService as any).applyFallbackClues(emptyCase, missingAll);
    if ((aiService as any).validateClueCoverage(fullyFixed, maxRounds).length === 0) {
      console.log("✅ Full fallback passed.");
      for(let i=1; i<=maxRounds; i++) {
        if (!fullyFixed.clues[`round${i}`] || fullyFixed.clues[`round${i}`].length === 0) {
           throw new Error(`Round ${i} missing clue after fallback`);
        }
      }
      console.log("✅ All rounds have at least 1 clue.");
    } else {
      throw new Error("Full fallback failed.");
    }

    console.log("\nALL TESTS PASSED SUCCESSFULLY");
  } catch (e: any) {
    console.error("\n❌ TEST FAILED:", e.message);
    process.exit(1);
  }
}

testClueCoverage();
