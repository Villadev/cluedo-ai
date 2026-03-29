import dotenv from 'dotenv';
// Mock process.env before any imports
process.env.OPENAI_API_KEY = 'mock-key';
import { AIService } from '../services/AIService.js';

async function testPipeline() {
  console.log("Starting Pipeline Verification Test (Mocked AI)...");
  const aiService = new AIService();

  // Mock callOpenAIWithRetry to avoid actual API calls
  (aiService as any).callOpenAIWithRetry = async (instruction: string, stepName: string, validator: (data: any) => boolean) => {
    console.log(`[MOCK OPENAI] Step: ${stepName}`);
    let mockData: any = {};

    if (stepName === "skeleton") {
      mockData = {
        victim: "V1",
        weapon: "Corda",
        location: "Carrer Major",
        assassin: "A1",
        crimeWindow: { start: "21:00", end: "23:00" }
      };
    } else if (stepName === "characters") {
      mockData = {
        characters: [
          { name: "A1", profession: "P1", description: "D1", personality: "Pers1", possibleMotive: "M1", secret: "S1", secretKnowledge: "K1", coartada: { location: "L1", timeStart: "21:00", timeEnd: "22:00", witness: "W2", credibility: "alta" }, rumor: "R1", relationships: "Rel1", tensions: "T1" },
          { name: "S2", profession: "P2", description: "D2", personality: "Pers2", possibleMotive: "M2", secret: "S2", secretKnowledge: "K2", coartada: { location: "L2", timeStart: "21:00", timeEnd: "22:00", witness: "A1", credibility: "alta" }, rumor: "R2", relationships: "Rel2", tensions: "T2" },
          { name: "S3", profession: "P3", description: "D3", personality: "Pers3", possibleMotive: "M3", secret: "S3", secretKnowledge: "K3", coartada: { location: "L3", timeStart: "21:00", timeEnd: "22:00", witness: "S2", credibility: "alta" }, rumor: "R3", relationships: "Rel3", tensions: "T3" },
          { name: "S4", profession: "P4", description: "D4", personality: "Pers4", possibleMotive: "M4", secret: "S4", secretKnowledge: "K4", coartada: { location: "L4", timeStart: "21:00", timeEnd: "22:00", witness: "S3", credibility: "alta" }, rumor: "R4", relationships: "Rel4", tensions: "T4" },
          { name: "S5", profession: "P5", description: "D5", personality: "Pers5", possibleMotive: "M5", secret: "S5", secretKnowledge: "K5", coartada: { location: "L5", timeStart: "21:00", timeEnd: "22:00", witness: "S4", credibility: "alta" }, rumor: "R5", relationships: "Rel5", tensions: "T5" },
          { name: "S6", profession: "P6", description: "D6", personality: "Pers6", possibleMotive: "M6", secret: "S6", secretKnowledge: "K6", coartada: { location: "L6", timeStart: "21:00", timeEnd: "22:00", witness: "S5", credibility: "alta" }, rumor: "R6", relationships: "Rel6", tensions: "T6" },
          { name: "S7", profession: "P7", description: "D7", personality: "Pers7", possibleMotive: "M7", secret: "S7", secretKnowledge: "K7", coartada: { location: "L7", timeStart: "21:00", timeEnd: "22:00", witness: "S6", credibility: "alta" }, rumor: "R7", relationships: "Rel7", tensions: "T7" },
          { name: "S8", profession: "P8", description: "D8", personality: "Pers8", possibleMotive: "M8", secret: "S8", secretKnowledge: "K8", coartada: { location: "L8", timeStart: "21:00", timeEnd: "22:00", witness: "S7", credibility: "alta" }, rumor: "R8", relationships: "Rel8", tensions: "T8" }
        ]
      };
    } else if (stepName === "narratives") {
      mockData = {
        introductionNarrative: "Aquest és un llarg text d'introducció que no menciona ni l'arma ni el lloc del crim per passar la validació de longitud i contingut.",
        solutionNarrative: "Aquest és un llarg text de solució que explica com va passar el crim i qui és l'assassí per passar la validació de longitud."
      };
    } else if (stepName === "clues") {
      mockData = {
        clues: {
          "round1": [{ type: "rumor", text: "C1", isTrue: true }],
          "round2": [{ type: "rumor", text: "C2", isTrue: true }],
          "round3": [{ type: "rumor", text: "C3", isTrue: true }],
          "round4": [{ type: "rumor", text: "C4", isTrue: true }],
          "round5": [{ type: "rumor", text: "C5", isTrue: true }]
        }
      };
    }

    if (validator(mockData)) {
      return mockData;
    }
    throw new Error(`Mock validation failed for ${stepName}`);
  };

  try {
    // 1. Test with large player count
    console.log("--- TEST 1: Large Player Count (8 players) ---");
    const playerCount = 8;
    const fullCase = await aiService.generateFullCase(playerCount, 'medium', 5);

    console.log(`- Victim: ${fullCase.victim}`);
    console.log(`- Assassin: ${fullCase.assassin}`);
    console.log(`- Characters generated: ${fullCase.characters.length}`);

    if (fullCase.characters.length >= playerCount) {
      console.log("✅ TEST 1 PASSED: Character count is correct.");
    } else {
      throw new Error(`TEST 1 FAILED: Expected at least ${playerCount} characters, got ${fullCase.characters.length}`);
    }

    // 2. Test Clue Coverage
    console.log("--- TEST 2: Clue Coverage ---");
    const maxRounds = 5;
    let allRoundsHaveClues = true;
    for (let i = 1; i <= maxRounds; i++) {
      const roundClues = fullCase.clues[`round${i}`];
      if (!roundClues || roundClues.length === 0) {
        console.error(`- Round ${i} is missing clues!`);
        allRoundsHaveClues = false;
      } else {
        console.log(`- Round ${i}: ${roundClues.length} clues.`);
      }
    }

    if (allRoundsHaveClues) {
      console.log("✅ TEST 2 PASSED: All rounds have clues.");
    } else {
      throw new Error("TEST 2 FAILED: Some rounds are missing clues.");
    }

    // 3. Test Narratives
    console.log("--- TEST 3: Narrative Content ---");
    if (fullCase.introductionNarrative.length > 50 && fullCase.solutionNarrative.length > 50) {
      console.log("✅ TEST 3 PASSED: Narratives are sufficiently long.");
    } else {
      throw new Error("TEST 3 FAILED: Narratives are too short.");
    }

    console.log("\nALL PIPELINE TESTS PASSED SUCCESSFULLY");
  } catch (e: any) {
    console.error("\n❌ TEST FAILED:", e.message);
    process.exit(1);
  }
}

testPipeline();
