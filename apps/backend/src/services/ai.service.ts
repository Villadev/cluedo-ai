interface CharacterProfileInput {
  playerName: string;
}

interface IntroNarrationInput {
  gameId: string;
  victim: string;
}

interface ClueNarrationInput {
  roundNumber: number;
  structuredClue: string;
}

interface QuestionInput {
  playerName: string;
  question: string;
}

export class AIService {
  public async generateCharacterProfile(input: CharacterProfileInput): Promise<string> {
    return `Detective persona for ${input.playerName}: sharp observer with a hidden agenda.`;
  }

  public async generateIntroNarration(input: IntroNarrationInput): Promise<string> {
    return `Game ${input.gameId} begins. The victim is ${input.victim}. Everyone has something to hide.`;
  }

  public async generateClueNarration(input: ClueNarrationInput): Promise<string> {
    return `Round ${input.roundNumber} clue report: ${input.structuredClue}`;
  }

  public async respondToQuestion(input: QuestionInput): Promise<string> {
    return `Narrator to ${input.playerName}: You asked "${input.question}". The room grows tense as eyes avoid your gaze.`;
  }
}
