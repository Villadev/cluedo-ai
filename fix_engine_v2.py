import sys

file_path = 'apps/backend/src/engine/game-engine.ts'
with open('game-engine.ts.bak', 'r') as f:
    content = f.read()

# 1. Insert clue storage logic in startGame
search_start_game = """      game.characters = fullCase.characters.map((c) => ({
        ...c,
        id: generateId(),
        isAssassin: c.name === fullCase.assassin
      }));"""

clue_storage_logic = """

      // Store clues by round
      if (fullCase.clues) {
        const clueEntries = Object.entries(fullCase.clues);
        for (const [roundKey, roundClues] of clueEntries) {
          const roundNumber = int(roundKey.replace("round", "")) if roundKey.startswith("round") else None
          if (roundNumber is not None):
            for clue in roundClues:
              game.clues.push({
                id: generateId(),
                type: clue.type,
                text: clue.text,
                isTrue: clue.isTrue,
                roundNumber,
                createdAt: nowIso()
              });
        }
      }""".replace('int(roundKey.replace("round", "")) if roundKey.startswith("round") else None', 'parseInt(roundKey.replace("round", ""), 10)').replace('if (roundNumber is not None):', 'if (!isNaN(roundNumber)) {').replace('for clue in roundClues:', 'roundClues.forEach((clue: any) => {').replace('}', '});').replace('      //', '//') + "      }"

# Actually, let's just use the exact string I want to insert
clue_storage_logic = """

      // Store clues by round
      if (fullCase.clues) {
        const clueEntries = Object.entries(fullCase.clues);
        for (const [roundKey, roundClues] of clueEntries) {
          const roundNumber = parseInt(roundKey.replace("round", ""), 10);
          if (!isNaN(roundNumber)) {
            roundClues.forEach((clue: any) => {
              game.clues.push({
                id: generateId(),
                type: clue.type,
                text: clue.text,
                isTrue: clue.isTrue,
                roundNumber,
                createdAt: nowIso()
              });
            });
          }
        }
      }"""

if search_start_game in content:
    content = content.replace(search_start_game, search_start_game + clue_storage_logic)
else:
    print("Error: Could not find startGame insertion point")
    sys.exit(1)

# 2. Add logging in askQuestion
search_ask_question = """    const response = await this.aiService.respondToQuestion(
      JSON.stringify(this.getPublicState(game.id, player.id)),
      input.question,
      game.difficulty
    );"""

logging_logic = """
    console.log("NARRATOR RESULT:", response);"""

if search_ask_question in content:
    content = content.replace(search_ask_question, search_ask_question + logging_logic)
else:
    print("Error: Could not find askQuestion insertion point")
    sys.exit(1)

with open(file_path, 'w') as f:
    f.write(content)
print("Successfully updated game-engine.ts")
