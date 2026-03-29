import dotenv from 'dotenv';
// Mock process.env before any imports
process.env.OPENAI_API_KEY = 'mock-key';
import { AIService } from '../services/AIService.js';

async function testPipeline() {
  console.log("Starting Stability Hotfix Verification Test (Mocked AI)...");
  const aiService = new AIService();

  // Helper for mock implementation
  const mockCall = async (instruction: string, stepName: string, validator: (data: any) => boolean) => {
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
        characters: Array.from({ length: 10 }, (_, i) => ({
          name: i === 0 ? "A1" : `S${i + 1}`,
          profession: `P${i + 1}`,
          description: `D${i + 1}`,
          personality: `Pers${i + 1}`,
          possibleMotive: `M${i + 1}`,
          secret: `S${i + 1}`,
          secretKnowledge: `K${i + 1}`,
          coartada: { location: `L${i + 1}`, timeStart: "21:00", timeEnd: "22:00", witness: "None", credibility: "alta" },
          rumor: `R${i + 1}`,
          relationships: `Rel${i + 1}`,
          tensions: `T${i + 1}`
        }))
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

  (aiService as any).callOpenAIWithRetry = mockCall;

  try {
    // 1. Test character trimming (Large player count)
    console.log("--- TEST 1: Character Trimming (8 players requested, 10 mocked) ---");
    const playerCount = 8;
    const fullCase = await aiService.generateFullCase(playerCount, 'medium', 5);

    console.log(`- Characters after normalization: ${fullCase.characters.length}`);
    if (fullCase.characters.length === playerCount) {
      console.log("✅ TEST 1 PASSED: Character trimming enforced.");
    } else {
      throw new Error(`TEST 1 FAILED: Expected exactly ${playerCount} characters, got ${fullCase.characters.length}`);
    }

    // 2. Test placeholder filling (Mock only 4 characters when 8 requested)
    console.log("--- TEST 2: Character Filling (8 players requested, 4 mocked) ---");
    const mockServiceForFilling = new AIService();
    (mockServiceForFilling as any).callOpenAIWithRetry = async (instruction: string, stepName: string, validator: (data: any) => boolean) => {
        if (stepName === "characters") {
            const validData = { characters: Array.from({ length: 7 }, (_, i) => ({ name: i === 0 ? "A1" : `S${i + 1}` })) };
            return validData;
        }
        return mockCall(instruction, stepName, validator);
    };

    const filledCase = await mockServiceForFilling.generateFullCase(8, 'medium', 5);
    console.log(`- Characters after filling: ${filledCase.characters.length}`);
    if (filledCase.characters.length === 8) {
      console.log("✅ TEST 2 PASSED: Character filling enforced.");
    } else {
      throw new Error(`TEST 2 FAILED: Expected 8 characters, got ${filledCase.characters.length}`);
    }

    // 3. Test Global Timeout
    console.log("--- TEST 3: Global Timeout ---");
    const mockServiceForTimeout = new AIService();
    (mockServiceForTimeout as any).GLOBAL_TIMEOUT_MS = -1; // Force immediate timeout
    (mockServiceForTimeout as any).callOpenAIWithRetry = mockCall;

    try {
        await mockServiceForTimeout.generateFullCase(4, 'medium', 5);
        throw new Error("TEST 3 FAILED: Global timeout not triggered.");
    } catch (e: any) {
        if (e.message.includes("temps límit global")) {
            console.log("✅ TEST 3 PASSED: Global timeout triggered correctly.");
        } else {
            throw e;
        }
    }

    console.log("\nALL STABILITY TESTS PASSED SUCCESSFULLY");
  } catch (e: any) {
    console.error("\n❌ TEST FAILED:", e.message);
    process.exit(1);
  }
}

testPipeline();
