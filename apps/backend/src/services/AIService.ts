import fs from 'node:fs';
import path from 'node:path';
import { openaiClient } from '../config/openai.js';

const VILLAGE_CONTEXT_PATH = path.resolve(__dirname, '../context/village.txt');

const readVillageContext = (): string => {
  if (!fs.existsSync(VILLAGE_CONTEXT_PATH)) {
    throw new Error(`Village context file not found at: ${VILLAGE_CONTEXT_PATH}`);
  }

  return fs.readFileSync(VILLAGE_CONTEXT_PATH, 'utf-8').trim();
};

const VILLAGE_CONTEXT = readVillageContext();

const SYSTEM_PROMPT = `Ets el Mestre del Joc d'un Cluedo narratiu.

Regles estrictes i innegociables:
- No pots decidir qui és l'assassí.
- No pots modificar la veritat definida pel backend.
- No pots revelar informació confidencial si no està autoritzat.
- Només generes narrativa i ambientació.
- Mantén sempre un to dramàtic i immersiu.
- No trenquis mai el personatge.
- Respon exclusivament en català.
- Tots els noms, personatges, armes, ubicacions i pistes han d'estar en català.

Context del poble:
${VILLAGE_CONTEXT}`;

interface OpenAICallInput {
  instruction: string;
  publicGameState?: string;
  question?: string;
  clueDescription?: string;
  privateContext?: string;
}

export class AIService {
  public async generateIntroNarration(publicGameState: string): Promise<string> {
    return this.generateNarrative({
      instruction: 'Genera una introducció d\'inici de partida intensa i breu.',
      publicGameState
    }, 220);
  }

  public async respondToQuestion(publicGameState: string, question: string): Promise<string> {
    return this.generateNarrative({
      instruction: 'Respon la pregunta del jugador sense revelar informació no autoritzada.',
      publicGameState,
      question
    }, 260);
  }

  public async generateClueNarration(publicGameState: string, clueDescription: string): Promise<string> {
    return this.generateNarrative({
      instruction: 'Narra la descoberta d\'aquesta pista amb misteri i claredat.',
      publicGameState,
      clueDescription
    }, 220);
  }

  public async generatePrivateMessage(privateContext: string): Promise<string> {
    return this.generateNarrative({
      instruction: 'Crea un missatge privat narratiu, discret i totalment segur.',
      privateContext
    }, 180);
  }

  public async generateCharacterProfile(input: { playerName: string }): Promise<string> {
    return this.generatePrivateMessage(
      `Nom del jugador: ${input.playerName}. Crea un perfil públic curt de personatge per a la partida.`
    );
  }

  private async generateNarrative(payload: OpenAICallInput, maxOutputTokens: number): Promise<string> {
    const userContent = [
      payload.instruction,
      'Respon exclusivament en català.',
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
        throw new Error('OpenAI returned empty output text');
      }

      return outputText;
    } catch {
      throw new Error('AI narrative service unavailable. Please try again later.');
    }
  }
}
