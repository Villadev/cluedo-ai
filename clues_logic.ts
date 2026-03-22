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
      }
