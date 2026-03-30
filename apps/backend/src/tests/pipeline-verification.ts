import { AIService } from '../services/AIService.js';
import { Difficulty } from '../types/game.types.js';

async function testPipeline() {
  const aiService = new AIService();
  const difficulty: Difficulty = 'hard';

  console.log("--- Testing Pipeline steps individually ---");

  try {
    console.log("Step 1: Skeleton...");
    const skeleton = await aiService.generateCaseSkeleton(difficulty);
    console.log("Skeleton result:", JSON.stringify(skeleton, null, 2));

    if (!skeleton.assassin || !skeleton.victim || !skeleton.crimeWindow) {
        throw new Error("Skeleton incomplete");
    }

    const fullCaseBase = {
        ...skeleton,
        characters: [],
        introductionNarrative: '',
        solutionNarrative: '',
        clues: {}
    } as any;

    console.log("\nStep 2: Characters...");
    const characters = await aiService.generateCharacters(fullCaseBase, 4, difficulty);
    console.log("Characters count:", characters.length);

    fullCaseBase.characters = characters;

    console.log("\nStep 3: Narratives...");
    const narratives = await aiService.generateNarratives(fullCaseBase, difficulty);
    console.log("Narratives generated successfully");

    fullCaseBase.introductionNarrative = narratives.introductionNarrative;
    fullCaseBase.solutionNarrative = narratives.solutionNarrative;

    console.log("\nStep 4: Clues...");
    const clues = await aiService.generateCluesByRounds(fullCaseBase, 3, difficulty);
    console.log("Clues generated for rounds:", Object.keys(clues));

    console.log("\nPIPELINE VERIFICATION SUCCESSFUL");
  } catch (error: any) {
    console.error("\nPIPELINE VERIFICATION FAILED:", error.message);
    process.exit(1);
  }
}

testPipeline();
