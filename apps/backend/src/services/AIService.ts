import fs from 'node:fs';
import path from 'node:path';
import { openaiClient } from '../config/openai.js';
import { errorLogger } from '../utils/error-logger.js';
import { FullCase } from '../types/game.types.js';

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

  public async generateFullCase(playerCount: number): Promise<FullCase> {
    const instruction = `Respon sempre en català.

Estàs creant un cas complet d'assassinat per un joc de misteri narratiu.

L'objectiu és crear una història amb personatges connectats entre si, amb secrets, tensions i possibles motius per matar.

Context del poble:
${VILLAGE_CONTEXT}

Crea un cas complet d'assassinat amb exactament ${Math.max(playerCount, 4)} personatges sospitosos.

Crea:
- diversos personatges sospitosos
- una víctima
- un assassí (que ha de ser un dels personatges)
- una arma del crim
- un lloc on ha passat el crim

Cada personatge ha de tenir:
- nom fictici
- professió
- descripció
- personalitat
- possible motiu (possibleMotive)
- secret
- secretKnowledge (informació secreta que aquest personatge coneix sobre la història o altres personatges)
- coartada
- rumor
- relacions amb altres personatges (relationships)
- tensions o conflictes (tensions)

Regles importants per a cada personatge:
- cada personatge rep una secretKnowledge diferent.
- la secretKnowledge pot revelar informació parcial però mai directament qui és l'assassí.
- els personatges s'han de conèixer entre ells.
- diversos personatges han de tenir conflictes amb la víctima.

Regles per a la narrativa:
1. una narrativa inicial (introductionNarrative) que presenti el crim, la víctima i els sospitosos (entre 200 i 300 paraules).
   CRÍTIC: L'introductionNarrative NO ha de revelar l'arma, ni el lloc exacte del crim, ni com va passar l'assassinat. S'ha de centrar en l'atmosfera, la víctima i les tensions.
2. una narrativa final (solutionNarrative) que reveli què ha passat realment, explicant el motiu real, com es va cometre el crim, com s'han interpretat malament algunes pistes i una revelació dramàtica final.

Regles per a les pistes (clues):
Has de generar pistes agrupades per rondes (entre 10 i 15 en total):
- Round 1: rumors
- Round 2: testimonis (witness)
- Round 3: evidències físiques (evidence)
- Round 4: contradiccions (contradiction)

L'arma i el lloc només han de ser deduïbles a partir de les pistes de rondes posteriors.

Retorna el resultat en JSON with aquesta estructura:
{
 "victim": "",
 "weapon": "",
 "location": "",
 "assassin": "",
 "characters": [
    {
      "name": "",
      "profession": "",
      "description": "",
      "personality": "",
      "possibleMotive": "",
      "secret": "",
      "secretKnowledge": "",
      "coartada": "",
      "rumor": "",
      "relationships": "",
      "tensions": ""
    }
 ],
 "introductionNarrative": "",
 "solutionNarrative": "",
 "clues": {
    "round1": [{"type": "rumor", "text": ""}],
    "round2": [{"type": "witness", "text": ""}],
    "round3": [{"type": "evidence", "text": ""}],
    "round4": [{"type": "contradiction", "text": ""}]
 }
}`;

    try {
      console.log("[OPENAI] Sending request for full case");

      const completion = await openaiClient.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: instruction }
        ],
        response_format: { type: "json_object" }
      });

      const responseText = completion.choices[0]?.message.content;
      if (!responseText) {
        throw new Error('Resposta buida del model');
      }

      return JSON.parse(responseText) as FullCase;
    } catch (error: any) {
      console.error("[OPENAI ERROR]", error.message || error);
      errorLogger.push("OPENAI", error);
      throw new Error('Error en generar el cas. Servei narratiu no disponible temporalment.');
    }
  }

  public async respondToQuestion(publicGameState: string, question: string): Promise<string> {
    const instruction = 'Respon la pregunta del jugador amb to narratiu sense revelar cap secret no autoritzat. Respon sempre en català.';
    return this.generateNarrative({ instruction, publicGameState, question }, 300);
  }

  public async generateClueNarration(publicGameState: string, clueDescription: string): Promise<string> {
    const instruction = 'Narra la descoberta de la pista amb misteri, ritme i coherència amb la història. Respon sempre en català.';
    return this.generateNarrative({ instruction, publicGameState, clueDescription }, 240);
  }

  public async generatePrivateMessage(privateContext: string): Promise<string> {
    const instruction = 'Redacta un missatge privat i segur, alineat amb la partida i sense revelar informació aliena. Respon sempre en català.';
    return this.generateNarrative({ instruction, privateContext }, 220);
  }

  private async generateNarrative(payload: OpenAICallInput, maxTokens: number): Promise<string> {
    if (!process.env.OPENAI_API_KEY) {
      const error = new Error("OPENAI_API_KEY not configured");
      errorLogger.push("OPENAI", error);
      throw error;
    }

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
      console.log("[OPENAI] Sending narrative request");

      const completion = await openaiClient.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent }
        ]
      });

      const outputText = completion.choices[0]?.message.content?.trim();
      if (!outputText) {
        throw new Error('Resposta buida del model');
      }

      return outputText;
    } catch (error: any) {
      console.error("[OPENAI ERROR]", error.message || error);
      errorLogger.push("OPENAI", error);
      throw new Error('Servei narratiu no disponible temporalment.');
    }
  }
}
