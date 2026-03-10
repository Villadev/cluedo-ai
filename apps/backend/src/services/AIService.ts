import fs from 'node:fs';
import path from 'node:path';
import { openaiClient } from '../config/openai.js';
import { errorLogger } from '../utils/error-logger.js';

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

  public async generateNPCs(count: number): Promise<{ name: string; role: string; description: string; personality: string; possibleMotive: string; relationshipWithVictim: string }[]> {
    const response = await this.generateNarrative(
      {
        instruction: `Respon sempre en català.

Ets un escriptor que crea personatges per a un joc de misteri d'assassinat tipus Cluedo.

La història té lloc en aquest poble:
${VILLAGE_CONTEXT}

Crea ${count} habitants del poble que podrien viure realment en aquest lloc.
Els personatges han de sentir-se integrats al poble, amb història, relacions i possibles secrets.

Retorna els personatges en format JSON.
Cada personatge ha d'incloure:
- name
- role
- description
- personality
- possibleMotive
- relationshipWithVictim

Regles importants:
- Els personatges han de semblar habitants reals del poble
- Han de tenir relacions amb altres habitants
- Alguns poden tenir conflictes amb la víctima
- Alguns poden amagar secrets
- Les motivacions han de ser plausibles`
      },
      800
    );

    try {
      const parsed = JSON.parse(response);
      return Array.isArray(parsed) ? parsed : parsed.characters || [];
    } catch (error) {
      errorLogger.push("OPENAI_JSON_PARSE", error);
      return Array.from({ length: count }).map((_, i) => ({
        name: `Habitant ${i + 1}`,
        role: 'Habitant del poble',
        description: 'Un habitant misteriós amb molts secrets per amagar.',
        personality: 'Reservat i desconfiat',
        possibleMotive: 'Té un passat fosc amb la víctima',
        relationshipWithVictim: 'Conegut de tota la vida'
      }));
    }
  }

  public async generateIntroNarration(charactersList: string): Promise<string> {
    return this.generateNarrative(
      {
        instruction: `Respon sempre en català.

Estàs escrivint la introducció d'un joc de misteri d'assassinat.
La història té lloc en el següent poble:
${VILLAGE_CONTEXT}

Els habitants implicats en la història són:
${charactersList}

Escriu una introducció immersiva per als jugadors.
La introducció ha d'incloure:
1. Una descripció del poble i la seva atmosfera
2. La presentació de la víctima
3. El moment en què es descobreix l'assassinat
4. Les sospites sobre els habitants del poble
5. Un ambient de misteri i tensió

Estil: narratiu, cinematogràfic, misteriós, amb tensió narrativa.
Longitud: entre 200 i 400 paraules.`
      },
      600
    );
  }

  public async respondToQuestion(publicGameState: string, question: string): Promise<string> {
    return this.generateNarrative(
      {
        instruction: 'Respon la pregunta del jugador amb to narratiu sense revelar cap secret no autoritzat. Respon sempre en català.',
        publicGameState,
        question
      },
      300
    );
  }

  public async generateClueNarration(publicGameState: string, clueDescription: string): Promise<string> {
    return this.generateNarrative(
      {
        instruction: 'Narra la descoberta de la pista amb misteri, ritme i coherència amb la història. Respon sempre en català.',
        publicGameState,
        clueDescription
      },
      240
    );
  }

  public async generatePrivateMessage(privateContext: string): Promise<string> {
    return this.generateNarrative(
      {
        instruction: 'Redacta un missatge privat i segur, alineat amb la partida i sense revelar informació aliena. Respon sempre en català.',
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
    const data = JSON.parse(murderJson);
    return this.generateNarrative(
      {
        instruction: `Respon sempre en català.

Estàs escrivint la revelació final d'un misteri d'assassinat.
La història té lloc en el següent poble:
${VILLAGE_CONTEXT}

La veritat del cas és la següent:
Assassí: ${data.killer}
Arma: ${data.weapon}
Lloc del crim: ${data.location}
Víctima: ${data.victim}

Escriu la narrativa final que explica què va passar realment.
La narrativa ha d'incloure:
- els esdeveniments previs a l'assassinat
- el motiu de l'assassí
- com es va cometre el crim
- com les pistes conduïen a la veritat
- una revelació final dramàtica

To narratiu: misteriós, dramàtic, estil revelació de detectiu.
Longitud: entre 200 i 400 paraules.`
      },
      600
    );
  }

  private async generateNarrative(payload: OpenAICallInput, maxOutputTokens: number): Promise<string> {
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
      console.log("[OPENAI] Sending request");
      console.log("[OPENAI] Prompt length:", userContent.length);

      const response = await openaiClient.responses.create({
        model: 'gpt-4o-mini',
        max_output_tokens: maxOutputTokens,
        input: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent }
        ]
      });

      console.log("[OPENAI] Response received");

      const outputText = response.output_text?.trim();
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
