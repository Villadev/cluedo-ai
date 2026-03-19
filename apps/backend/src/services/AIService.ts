import fs from 'node:fs';
import path from 'node:path';
import { openaiClient } from '../config/openai.js';
import { errorLogger } from '../utils/error-logger.js';
import { FullCase } from '../types/game.types.js';
import { WEAPONS, LOCATIONS } from '../config/game-options.js';

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

const SYSTEM_PROMPT = `Ets el Mestre del Joc d'un Cluedo narratiu d'estil "social drama".
- La teva narrativa és misteriosa, suggestiva i carregada de tensió.
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
- una arma del crim (triada EXCLUSIVAMENT de la llista d'armes permeses)
- un lloc on ha passat el crim (triat EXCLUSIVAMENT de la llista de llocs permesos)
- una finestra temporal pel crim (crimeWindow) amb format HH:MM (ex: "21:30" a "23:00").

Llista d'armes permeses (weapon):
${WEAPONS.join(', ')}

Llista de llocs permesos (location):
${LOCATIONS.join(', ')}

Cada personatge ha de tenir:
- nom fictici
- professió
- descripció
- personalitat
- possible motiu (possibleMotive)
- secret
- secretKnowledge (informació secreta que aquest personatge coneix sobre la història o altres personatges)
- coartada estructurada (coartada)
- rumor
- relacions amb altres personatges (relationships)
- tensions o conflictes (tensions)

Regles per a la finestra temporal del crim:
- Defineix un inici i un final (ex: 21:30 - 23:00).
- L'assassinat ha passat en algun moment dins d'aquest interval.

Regles per a la coartada (coartada):
- Ha de ser un objecte amb: location, timeStart, timeEnd, witness, credibility ("alta", "mitjana", "baixa").
- Cap coartada ha de cobrir totalment la finestra temporal del crim.
- Almenys el 60% dels personatges han de referenciar un altre personatge com a testimoni (witness).
- Almenys una coartada ha de contradir-ne una altra (ex: A diu que estava amb B, però B diu que estava sol).
- Almenys una coartada ha de no tenir testimoni ("ningú").
- L'assassí pot tenir una coartada falsa, incompleta o un testimoni que no la pot confirmar.

Regles importants per a cada personatge:
- cada personatge rep una secretKnowledge diferent.
- la secretKnowledge pot revelar informació parcial peró never directament qui és l'assassí.
- els personatges s'han de conèixer entre ells.
- diversos personatges han de tenir conflictes amb la víctima.

Regles per a la narrativa:
1. una narrativa inicial (introductionNarrative) que presenti el crim, la víctima i els sospitosos (entre 200 i 300 paraules).
   REGLA D'OR: L'introducció NO ha de revelar l'arma, ni el lloc exacte (nom o descripció), ni la identitat de l'assassí.
   REGLA D'OR: No mencionis MAI llocs específics del poble (ex: "celler", "cuina", "jardí", o noms de la llista de llocs).
   REGLA D'OR: Evita pistes indirectes sobre el lloc (ex: si el lloc és un celler, no parlis d'ampolles; si és l'església, no parlis de campanes; si és el Carrer Major, no parlis d'asfalt o botigues).
   CENTRA'T EXCLUSIVAMENT en la descoberta del cos, la commoció, les relacions tenses entre els personatges i l'ambient de sospita general.
   Menciona la incertesa de l'hora del crim (ex: "La mort podria haver tingut lloc en algun moment entre les nou i mitja i les onze de la nit.").
2. una narrativa final (solutionNarrative) que reveli què ha passat realment, explicant el motiu real, com es va cometre el crim (incloent l'hora exacta), com s'han interpretat malament algunes pistes i una revelació dramàtica final.

Regles per a les pistes (clues):
Genera pistes progressives agrupades per rondes (entre 10 i 15 en total).
IMPORTANT: Aproximadament un 30% de les pistes han de ser enganyoses (misleading) o incompletes, però plausibles.
IMPORTANT: Evita dir directament el nom de l'arma o del lloc. Utilitza descripcions evocadores (ex: en comptes de "ganivet", digues "un objecte tallant habitual a la cuina").

- Round 1-2: Rumors i observacions vagues. Comportaments estranys, reaccions emocionals, murmuracions sobre el passat.
- Round 3-4: Referències indirectes a objectes o llocs. Inconsistències menors en les coartades. Informació parcial sobre moviments.
- Round 5+: Pistes més clares sobre l'arma o el lloc (encara descriptives) i contradiccions evidents entre sospitosos.

Retorna el resultat en JSON amb aquesta estructura:
{
 "victim": "",
 "weapon": "",
 "location": "",
 "assassin": "",
 "crimeWindow": { "start": "HH:MM", "end": "HH:MM" },
 "characters": [
    {
      "name": "",
      "profession": "",
      "description": "",
      "personality": "",
      "possibleMotive": "",
      "secret": "",
      "secretKnowledge": "",
      "coartada": {
        "location": "",
        "timeStart": "HH:MM",
        "timeEnd": "HH:MM",
        "witness": "",
        "credibility": "alta|mitjana|baixa"
      },
      "rumor": "",
      "relationships": "",
      "tensions": ""
    }
 ],
 "introductionNarrative": "",
 "solutionNarrative": "",
 "clues": {
    "round1": [{"type": "rumor", "text": "", "isTrue": true}],
    "round2": [{"type": "witness", "text": "", "isTrue": true}],
    "round3": [{"type": "evidence", "text": "", "isTrue": true}],
    "round4": [{"type": "contradiction", "text": "", "isTrue": true}]
 }
}`;

    try {
      console.log("[OPENAI] Sending request for full case");

      let fullCase: FullCase | null = null;
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        attempts++;
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

        fullCase = JSON.parse(responseText) as FullCase;

        if (this.isValidIntro(fullCase.introductionNarrative, fullCase.weapon, fullCase.location)) {
          console.log(`[OPENAI] Case generated successfully on attempt ${attempts}`);
          return fullCase;
        }

        console.warn(`[OPENAI] Intro validation failed (attempt ${attempts}). Location or weapon mentioned in introduction. Regenerating...`);
      }

      return fullCase!;
    } catch (error: any) {
      console.error("[OPENAI ERROR]", error.message || error);
      errorLogger.push("OPENAI", error);
      throw new Error('Error en generar el cas. Servei narratiu no disponible temporalment.');
    }
  }

  private isValidIntro(intro: string, weapon: string, location: string): boolean {
    const lowerIntro = intro.toLowerCase();

    // Check for the specific weapon and location chosen for this case
    if (lowerIntro.includes(weapon.toLowerCase())) return false;
    if (lowerIntro.includes(location.toLowerCase())) return false;

    // Common mystery location keywords that should not appear in introduction
    const genericForbidden = [
      'celler', 'cuina', 'jardí', 'habitació', 'sala', 'garatge', 'biblioteca', 'bany', 'golfes', 'terrassa', 'menjador'
    ];

    for (const word of genericForbidden) {
      if (lowerIntro.includes(word)) return false;
    }

    // Check for any possible location or weapon from the allowed list
    const forbiddenKeywords = [
      ...WEAPONS.map(w => w.toLowerCase()),
      ...LOCATIONS.map(l => l.toLowerCase())
    ];

    for (const keyword of forbiddenKeywords) {
      if (keyword.length >= 4 && lowerIntro.includes(keyword)) {
        return false;
      }
    }

    return true;
  }

  public async respondToQuestion(publicGameState: string, question: string): Promise<string> {
    const instruction = `Respon la pregunta de l'investigador de manera molt directa i breu (màxim 15 paraules).
Regles:
- No utilitzis metàfores ni descripcions poètiques.
- Dona una pista subtil o un fet concret si és possible.
- Sigues enigmàtic però concís.
- Respon sempre en català.`;
    return this.generateNarrative({ instruction, publicGameState, question }, 80);
  }

  public async generateClueNarration(publicGameState: string, clueDescription: string): Promise<string> {
    const instruction = "Narra una pista o rumor de manera breu i directa (màxim 20 paraules). Evita l'atmosfera innecessària. Utilitza descripcions si parles de l'arma o el lloc, però sigues concís. Respon en català.";
    return this.generateNarrative({ instruction, publicGameState, clueDescription }, 100);
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
