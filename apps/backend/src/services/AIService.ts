import fs from 'node:fs';
import path from 'node:path';
import { openaiClient } from '../config/openai.js';

const resolveContextPath = (fileName: string): string => {
  const candidatePaths = [
    path.resolve(__dirname, `../context/${fileName}`),
    path.resolve(__dirname, `../src/context/${fileName}`),
    path.resolve(process.cwd(), `src/context/${fileName}`)
  ];

  const foundPath = candidatePaths.find((candidatePath) => fs.existsSync(candidatePath));
  if (!foundPath) {
    throw new Error(`No s'ha trobat el fitxer de context: ${fileName}`);
  }

  return foundPath;
};

const VILLAGE_CONTEXT_PATH = resolveContextPath('village.txt');
const INSTRUCTIONS_CONTEXT_PATH = resolveContextPath('instructions.txt');

const readContextFile = (absolutePath: string): string => {
  return fs.readFileSync(absolutePath, 'utf-8').trim();
};

const VILLAGE_CONTEXT = readContextFile(VILLAGE_CONTEXT_PATH);
const GAME_INSTRUCTIONS = readContextFile(INSTRUCTIONS_CONTEXT_PATH);

const SYSTEM_PROMPT = `Ets el Mestre del Joc d'un Cluedo narratiu.
- Només generes narrativa i ambientació.
- Mai decideixes qui és l'assassí.
- Mai reveles informació confidencial sense autorització.
- Sempre respon exclusivament en català.
- Considera el context del poble i les instruccions del joc.
- Mantingues coherència narrativa i dramàtica.`;

interface OpenAICallInput {
  instruction: string;
  publicGameState?: string;
  question?: string;
  clueDescription?: string;
  privateContext?: string;
}

export class AIService {
  public getInstructionsContext(): string {
    return GAME_INSTRUCTIONS;
  }

  public async generateNPCs(count: number): Promise<{ name: string; description: string; personality: string }[]> {
    const response = await this.generateNarrative(
      {
        instruction: `Genera ${count} perfils de personatges NPC per a un joc de misteri.
        Cada personatge ha de tenir un nom, una descripció i una personalitat.
        Respon exclusivament en format JSON: [{"name": "...", "description": "...", "personality": "..."}]`
      },
      500
    );

    try {
      return JSON.parse(response);
    } catch {
      // Fallback simple si falla el JSON
      return Array.from({ length: count }).map((_, i) => ({
        name: `NPC ${i + 1}`,
        description: 'Habitant del poble amb secrets.',
        personality: 'misteriós'
      }));
    }
  }

  public async generateIntroNarration(publicGameState: string): Promise<string> {
    return this.generateNarrative(
      {
        instruction: 'Genera la narrativa inicial de la partida per a tots els jugadors.',
        publicGameState
      },
      280
    );
  }

  public async respondToQuestion(publicGameState: string, question: string): Promise<string> {
    return this.generateNarrative(
      {
        instruction: 'Respon la pregunta del jugador amb to narratiu sense revelar cap secret no autoritzat.',
        publicGameState,
        question
      },
      300
    );
  }

  public async generateClueNarration(publicGameState: string, clueDescription: string): Promise<string> {
    return this.generateNarrative(
      {
        instruction: 'Narra la descoberta de la pista amb misteri, ritme i coherència amb la història.',
        publicGameState,
        clueDescription
      },
      240
    );
  }

  public async generatePrivateMessage(privateContext: string): Promise<string> {
    return this.generateNarrative(
      {
        instruction: 'Redacta un missatge privat i segur, alineat amb la partida i sense revelar informació aliena.',
        privateContext
      },
      220
    );
  }

  public async generateCharacterProfile(input: { playerName: string }): Promise<string> {
    return this.generatePrivateMessage(
      `Nom del jugador: ${input.playerName}. Crea un perfil públic curt de personatge en català per a la partida.`
    );
  }

  public async generateCaseSolution(murderJson: string): Promise<string> {
    return this.generateNarrative(
      {
        instruction: 'Explica la solució del crim de forma narrativa i detallada, incloent com l\'assassí va cometre el crim.',
        privateContext: `Dades del crim: ${murderJson}`
      },
      400
    );
  }

  private async generateNarrative(payload: OpenAICallInput, maxOutputTokens: number): Promise<string> {
    const userContent = [
      payload.instruction,
      `Context del poble:\n${VILLAGE_CONTEXT}`,
      `Instruccions del joc:\n${GAME_INSTRUCTIONS}`,
      payload.publicGameState ? `Estat públic del joc:\n${payload.publicGameState}` : '',
      payload.question ? `Pregunta del jugador:\n${payload.question}` : '',
      payload.clueDescription ? `Descripció de la pista:\n${payload.clueDescription}` : '',
      payload.privateContext ? `Context privat autoritzat:\n${payload.privateContext}` : ''
    ]
      .filter((value) => value.length > 0)
      .join('\n\n');

    try {
      const response = await openaiClient.responses.create({
        model: 'gpt-4o-mini',
        max_output_tokens: maxOutputTokens,
        input: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent }
        ]
      });

      const outputText = response.output_text?.trim();
      if (!outputText) {
        throw new Error('Resposta buida del model');
      }

      return outputText;
    } catch {
      throw new Error('Servei narratiu no disponible temporalment.');
    }
  }
}
