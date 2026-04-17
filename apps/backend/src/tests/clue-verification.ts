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
    if (missing.length === 3 && missing.includes(2) && missing.includes(4) && missing.includes(5)) {
      console.log("✅ validateClueCoverage passed.");
    } else {
      throw new Error("validateClueCoverage failed.");
    }

    console.log("\nALL TESTS PASSED SUCCESSFULLY");
  } catch (e: any) {
    console.error("\n❌ TEST FAILED:", e.message);
    process.exit(1);
  }
}

testClueCoverage();
