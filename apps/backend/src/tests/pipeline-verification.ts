import { AIService } from '../services/AIService.js';
import { Difficulty, FullCase } from '../types/game.types.js';

async function testPipeline() {
  const aiService = new AIService();
  const difficulty: Difficulty = 'hard';
  const gameId = 'test-game-id';

  console.log("--- Testing Pipeline steps individually ---");

  try {
    console.log("Step 1: Skeleton...");
    const skeleton = await aiService.generateCaseSkeleton(gameId, difficulty);
    console.log("Skeleton result:", JSON.stringify(skeleton, null, 2));

    if (!skeleton.assassin || !skeleton.victim || !skeleton.crimeWindow) {
        throw new Error("Skeleton incomplete");
    }

    const fullCaseBase: Partial<FullCase> = {
        ...skeleton,
        characters: [],
        introductionNarrative: '',
        solutionNarrative: '',
        clues: {}
    };

    console.log("\nStep 2a: Characters Basic...");
    const basicCharacters = await aiService.generateBasicCharacters(gameId, fullCaseBase, 4, difficulty);
    console.log("Basic characters count:", basicCharacters.length);

    console.log("\nStep 2b: Characters Enrich split...");
    const profiles = await aiService.enrichCharacterProfilesBatch(gameId, fullCaseBase, basicCharacters, difficulty, "test_profiles");
    console.log("Profiles count:", profiles.length);

    const relations = await aiService.enrichCharacterRelationsBatch(gameId, profiles, difficulty, "test_relations");
    console.log("Relations count:", relations.length);

    const enrichedCharacters = aiService.normalizeCharacters(relations, profiles, fullCaseBase);
    console.log("Enriched characters count:", enrichedCharacters.length);

    fullCaseBase.characters = enrichedCharacters;

    console.log("\nStep 3: Narratives...");
    const narratives = await aiService.generateNarratives(gameId, fullCaseBase as FullCase, difficulty);
    console.log("Narratives generated successfully");

    fullCaseBase.introductionNarrative = narratives.introductionNarrative;
    fullCaseBase.solutionNarrative = narratives.solutionNarrative;

    console.log("\nStep 4: Clues...");
    const clues = await aiService.generateCluesByRounds(gameId, fullCaseBase as FullCase, 3, difficulty);
    console.log("Clues generated for rounds:", Object.keys(clues));

    console.log("\nPIPELINE VERIFICATION SUCCESSFUL");
  } catch (error: any) {
    console.error("\nPIPELINE VERIFICATION FAILED:", error.message);
    process.exit(1);
  }
}

testPipeline();
