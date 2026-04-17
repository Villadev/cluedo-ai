import { AIService } from '../services/AIService.js';
import { Difficulty, FullCase } from '../types/game.types.js';

async function testPipeline() {
  const aiService = new AIService() as any;
  const difficulty: Difficulty = 'hard';
  const gameId = 'test-game-id';
  const allowedPlayerNames = ['Joan', 'Maria', 'Pere', 'Anna'];

  console.log("--- Testing Pipeline steps individually ---");

  // We mock the real OpenAI calls here to verify the code paths but avoid real network calls with dummy key
  const mockAi = aiService as any;
  mockAi.callOpenAIWithRetry = async (gid: string, inst: string, name: string, phase: string, validator: any, retries: number, signal: any, repair: any) => {
      console.log(`Mocking call: ${name}`);

      let data: any = {};
      if (name === 'skeleton') {
          data = {
              victim: 'Victim Name',
              weapon: 'Corda',
              location: 'Carrer Major',
              assassin: 'Joan',
              crimeWindow: { start: '22:00', end: '00:00' }
          };
      } else if (name === 'characters_basic') {
          data = { characters: allowedPlayerNames.map(n => ({ name: n, profession: 'Worker', possibleMotive: 'Motive' })) };
      } else if (name === 'relations_matrix') {
          data = { relations: [{ a: 'Joan', b: 'Maria', type: 'conflict', strength: 'high', note: 'Tension' }] };
      } else if (name.startsWith('characters_enrich_profiles')) {
          data = { characters: [{ name: 'Joan', description: 'Desc', personality: 'Pers', secret: 'Sec', secretKnowledge: 'Know', rumor: 'Rum', coartada: { location: 'Loc', timeStart: '22:00', timeEnd: '00:00', witness: 'Nobody', credibility: 'alta' } }] };
      } else if (name === 'narratives') {
          data = { introductionNarrative: 'Intro', solutionNarrative: 'Solution' };
      } else if (name === 'clues') {
          data = { round1: [], round2: [], round3: [] };
      }

      const { valid } = validator(data);
      if (!valid && repair) {
          data = repair(data);
      }
      return data;
  };

  try {
    console.log("Step 1: Skeleton...");
    const skeleton = await aiService.generateCaseSkeleton(gameId, allowedPlayerNames, difficulty);
    console.log("Skeleton result obtained");

    const fullCaseBase: Partial<FullCase> = {
        ...skeleton,
        characters: [],
        introductionNarrative: '',
        solutionNarrative: '',
        clues: {}
    };

    console.log("\nStep 2a: Characters Basic...");
    const basicCharacters = await aiService.generateBasicCharacters(gameId, fullCaseBase, 4, allowedPlayerNames, difficulty);
    console.log("Basic characters count:", basicCharacters.length);

    console.log("\nStep 2b: Relations Matrix...");
    const matrix = await aiService.generateRelationshipMatrix(gameId, fullCaseBase, allowedPlayerNames, difficulty);
    fullCaseBase.relationshipMatrix = matrix;
    console.log("Matrix generated");

    console.log("\nStep 2c: Characters Enrich...");
    const enriched = await aiService.enrichCharacters(gameId, fullCaseBase, basicCharacters.slice(0, 1), difficulty, 0);
    console.log("Enriched characters count:", enriched.length);

    fullCaseBase.characters = enriched;

    console.log("\nStep 3: Narratives...");
    const narratives = await aiService.generateNarratives(gameId, fullCaseBase as FullCase, difficulty);
    console.log("Narratives generated successfully");

    console.log("\nStep 4: Clues...");
    const clues = await aiService.generateCluesByRounds(gameId, fullCaseBase as FullCase, 3, difficulty);
    console.log("Clues generated");

    console.log("\nPIPELINE VERIFICATION SUCCESSFUL");
  } catch (error: any) {
    console.error("\nPIPELINE VERIFICATION FAILED:", error.message);
    process.exit(1);
  }
}

testPipeline();
