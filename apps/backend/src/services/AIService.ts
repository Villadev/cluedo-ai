import fs from 'node:fs';
import path from 'node:path';
import { openaiClient } from '../config/openai.js';
import { errorLogger } from '../utils/error-logger.js';
import { FullCase, Difficulty, AIServiceCharacter, AIServiceClue } from '../types/game.types.js';
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
  json?: boolean;
}

export class AIService {
  public getInstructionsContext(): string {
    return GAME_INSTRUCTIONS;
  }

  private getDifficultyInstruction(difficulty: Difficulty): string {
    switch (difficulty) {
      case 'easy':
        return 'Dificultat FÀCIL: Sigues molt explícit. Les pistes han de ser clares i directes, ajudant als jugadors a connectar els punts fàcilment.';
      case 'medium':
        return 'Dificultat MITJANA: Sigues equilibrat. Dona informació útil però manté un cert misteri.';
      case 'hard':
        return 'Dificultat DIFÍCIL: Sigues subtil. Les pistes han de requerir deducció i atenció als detalls. No donis res mastegat.';
      case 'extreme':
        return 'Dificultat EXTREMA: Sigues molt vague i indirecte. Les pistes han de ser críptiques i difícils de desxifrar, sovint basades en matisos o contradiccions molt fines.';
      default:
        return '';
    }
  }

  public async generateFullCase(playerCount: number, difficulty: Difficulty = 'hard', maxRounds: number = 5): Promise<FullCase> {
    const expectedCount = Math.max(playerCount, 4);
    const diffContext = this.getDifficultyInstruction(difficulty);
    const instruction = `Respon sempre en català.

Estàs creant un cas complet d'assassinat per un joc de misteri narratiu.
${diffContext}

L'objectiu és crear una història amb personatges connectats entre si, amb secrets, tensions i possibles motius per matar.

Context del poble:
${VILLAGE_CONTEXT}

Crea un cas complet d'assassinat amb exactament ${expectedCount} personatges sospitosos.

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
- cada personatge rebrà una secretKnowledge diferent.
- la secretKnowledge pot revelar informació parcial però mai directament qui és l'assassí.
- els personatges s'han de conèixer entreells.
- diversos personatges han de tenir conflictes amb la víctima.

Regles per a la narrativa:
1. una narrativa inicial (introductionNarrative) que presenti el crim, la víctima i els sospitosos (entre 200 i 300 paraules).
   REGLA D'OR: L'introducció NO ha de revelar l'arma, ni el lloc exacte (nom o descripció), ni la identitat de l'assassí.
   REGLA D'OR: No mencionis MAI llocs específicos del poble (ex: "celler", "cuina", "jardí", o noms de la llista de llocs).
   REGLA D'OR: Evita pistes indirectes sobre el lloc (ex: si el lloc és un celler, no parlis d'ampolles; si és l'església, no parlis de campanes; si és el Carrer Major, no parlis d'asfalt o botigues).
   CENTRA'T EXCLUSIVAMENT en la descoberta del cos, la commoció, les relacions tenses entre els personatges i l'ambient de sospita general.
   Menciona la incertesa de l'hora del crim (ex: "La mort podria haver tingut lloc en algun moment entre les nou i mitja i les onze de la nit.").
2. una narrativa final (solutionNarrative) que reveli què ha passat realment, explicant el motiu real, com es va cometre el crim (incloent lhora exacta), com s'han interpretat malament algunes pistes i una revelació dramàtica final.

Regles per a les pistes (clues):
Genera pistes progressives agrupades per rondes per a exactament ${maxRounds} rondes.
CADA RONDA (des de round1 fins a round${maxRounds}) ha de tenir almenys una pista.
IMPORTANT: Aproximadament un 30% de les pistes han de ser enganyoses (misleading) o incompletes, però plausibles.
IMPORTANT: Evita dir directament el nom de l'arma o del lloc. Utilitza descripcions evocadores.

- Round 1-2: Rumors i observacions vagues.
- Round 3-4: Referències indirectes a objectes o llocs. Inconsistències menors.
- Round 5+: Pistes més clares sobre l'arma o el lloc i contradiccions evidents.

Retorna el resultat en JSON amb aquesta estructura:
{
 "victim": "",
 "weapon": "",
 "location": "",
 "assassin": "",
 "crimeWindow": { "start": "HH:MM", "end": "HH:MM" },
 "characters": [...],
 "introductionNarrative": "",
 "solutionNarrative": "",
 "clues": {
    "round1": [{"type": "rumor", "text": "", "isTrue": true}],
    ...
    "round${maxRounds}": [...]
 }
}`;

    try {
      console.log(`[OPENAI] Attempting case generation (expected characters: ${expectedCount}, rounds: ${maxRounds})`);

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

        let fullCase = JSON.parse(responseText) as FullCase;

        // 1. Normalize and sanitize data
        fullCase = this.normalizeCaseData(fullCase, expectedCount);

        // 2. Validate critical integrity (excluding clues for now)
        const validationErrors = this.validateCaseData(fullCase, expectedCount);
        const isValidIntro = this.isValidIntro(fullCase.introductionNarrative, fullCase.weapon, fullCase.location);

        if (validationErrors.length === 0 && isValidIntro) {
          // 3. Robust Clue Coverage Validation
          let missingRounds = this.validateClueCoverage(fullCase, maxRounds);

          if (missingRounds.length > 0) {
            console.warn(`[OPENAI] Missing clues for rounds: ${missingRounds.join(', ')}. Attempting recovery...`);
            fullCase = await this.recoverMissingClues(fullCase, missingRounds, difficulty);

            // Re-validate after recovery
            missingRounds = this.validateClueCoverage(fullCase, maxRounds);
          }

          if (missingRounds.length > 0) {
            console.warn(`[REPAIR] Clue recovery failed for rounds: ${missingRounds.join(', ')}. Applying fallback clues.`);
            fullCase = this.applyFallbackClues(fullCase, missingRounds);
          }

          console.log(`[OPENAI] Case generated successfully on attempt ${attempts}`);
          return fullCase;
        }

        if (validationErrors.length > 0) {
          console.warn(`[OPENAI] Case validation failed (attempt ${attempts}):\n- ${validationErrors.join('\n- ')}`);
        }
        if (!isValidIntro) {
          console.warn(`[OPENAI] Intro validation failed (attempt ${attempts}). Location or weapon mentioned in introduction.`);
        }
        console.warn(`[OPENAI] Regenerating (attempt ${attempts + 1} of ${maxAttempts})...`);
      }

      throw new Error(`No s'ha pogut generar un cas vàlid després de ${maxAttempts} intents.`);
    } catch (error: any) {
      console.error("[OPENAI ERROR]", error.message || error);
      errorLogger.push("OPENAI", error);
      throw new Error(error.message || 'Error en generar el cas. Servei narratiu no disponible temporalment.');
    }
  }

  private validateClueCoverage(caseData: FullCase, maxRounds: number): string[] {
    const missing: string[] = [];
    for (let i = 1; i <= maxRounds; i++) {
      const roundKey = `round${i}`;
      if (!caseData.clues[roundKey] || caseData.clues[roundKey].length === 0) {
        missing.push(roundKey);
      }
    }
    return missing;
  }

  private async recoverMissingClues(caseData: FullCase, missingRounds: string[], difficulty: Difficulty): Promise<FullCase> {
    const diffContext = this.getDifficultyInstruction(difficulty);
    const caseSummary = `Víctima: ${caseData.victim}, Arma: ${caseData.weapon}, Lloc: ${caseData.location}, Assassí: ${caseData.assassin}.`;

    const existingCluesMap = Object.entries(caseData.clues)
      .filter(([_, clues]) => clues.length > 0)
      .map(([round, clues]) => `${round}: ${clues.map(c => c.text).join(' | ')}`)
      .join('\n');

    const instruction = `Respon en català.
Ets el Mestre del Joc. Hem generat un cas però falten pistes per a algunes rondes.
${diffContext}

Resum del cas:
${caseSummary}

Pistes existents:
${existingCluesMap}

Genera almenys 2 pistes noves per a CADASCUNA de les següents rondes: ${missingRounds.join(', ')}.
Les pistes han de ser coherents amb el cas i les pistes existents.
Manté el format progressiu:
- Round 1-2: rumors vagues.
- Round 3-4: referències indirectes.
- Round 5+: contradiccions i pistes més clares.

Retorna el resultat en JSON:
{
  "clues": {
    "roundX": [{"type": "rumor|witness|contradiction|evidence", "text": "...", "isTrue": true}],
    ...
  }
}`;

    try {
      let recoveryAttempts = 0;
      const maxRecoveryAttempts = 2;

      while (recoveryAttempts < maxRecoveryAttempts) {
        recoveryAttempts++;
        const completion = await openaiClient.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: instruction }
          ],
          response_format: { type: "json_object" }
        });

        const responseText = completion.choices[0]?.message.content;
        if (!responseText) continue;

        const recoveredData = JSON.parse(responseText) as { clues: Record<string, AIServiceClue[]> };

        if (recoveredData.clues) {
          for (const round of missingRounds) {
            if (recoveredData.clues[round] && recoveredData.clues[round].length > 0) {
              caseData.clues[round] = recoveredData.clues[round];
            }
          }
        }

        const stillMissing = this.validateClueCoverage(caseData, Math.max(...missingRounds.map(r => parseInt(r.replace('round', '')))));
        if (stillMissing.length === 0) break;
      }
    } catch (error) {
      console.error("[OPENAI RECOVERY ERROR]", error);
    }

    return caseData;
  }

  private applyFallbackClues(caseData: FullCase, missingRounds: string[]): FullCase {
    const fallbacks: Record<string, AIServiceClue[]> = {
      "round1": [{ type: "rumor", text: "Es diu que la víctima tenia enemics silenciosos al poble.", isTrue: true }],
      "round2": [{ type: "witness", text: "Algú va sentir una conversa pujada de to prop del lloc del crim.", isTrue: true }],
      "round3": [{ type: "evidence", text: "S'ha trobat una taca estranya que podria estar relacionada amb l'arma.", isTrue: true }],
      "round4": [{ type: "contradiction", text: "Un dels sospitosos no sembla recordar exactament on era a l'hora del crim.", isTrue: true }],
      "round5": [{ type: "evidence", text: "Una pista d'última hora apunta directament a una contradicció en el relat de l'assassí.", isTrue: true }]
    };

    for (const round of missingRounds) {
      caseData.clues[round] = fallbacks[round] || [
        { type: "rumor", text: `Encara s'estan investigant els detalls de la ronda ${round.replace('round', '')}.`, isTrue: true }
      ];
    }

    return caseData;
  }

  private normalizeCaseData(caseData: FullCase, expectedCount: number): FullCase {
    if (!caseData.characters || !Array.isArray(caseData.characters)) {
      caseData.characters = [];
    }

    if (!caseData.clues) {
      caseData.clues = {};
    }

    caseData.characters = caseData.characters.map((char, idx) => {
      const sanitized: AIServiceCharacter = {
        name: (char.name || `Sospitós ${idx + 1}`).trim(),
        profession: (char.profession || "Veí del poble").trim(),
        description: (char.description || "Un personatge misteriós que prefereix no parlar del seu passat.").trim(),
        personality: (char.personality || "Reservat i cautelós.").trim(),
        possibleMotive: (char.possibleMotive || "Tensions personals no resoltes.").trim(),
        secret: (char.secret || "Amaga un secret que ningú més coneix.").trim(),
        secretKnowledge: (char.secretKnowledge || "Ha observat moviments estranys recentment al poble.").trim(),
        coartada: char.coartada || {
          location: "A casa seva",
          timeStart: "21:00",
          timeEnd: "23:00",
          witness: "Ningú",
          credibility: "mitjana"
        },
        rumor: (char.rumor || "Es diu que darrerament actua de manera estranya.").trim(),
        relationships: (char.relationships || "Coneguts del poble.").trim(),
        tensions: (char.tensions || "Cap conflicte aparent.").trim()
      };
      return sanitized;
    });

    if (caseData.characters.length < expectedCount) {
      const missingCount = expectedCount - caseData.characters.length;
      console.warn(`[REPAIR] Adding ${missingCount} placeholder characters to match expected count.`);
      for (let i = 0; i < missingCount; i++) {
        caseData.characters.push({
          name: `Habitant extra ${caseData.characters.length + 1}`,
          profession: "Artesà local",
          description: "Un habitant discret que viu als afores del poble.",
          personality: "Observador i silenciós.",
          possibleMotive: "Enveja pel llegat de la víctima.",
          secret: "Té deutes que ningú coneix.",
          secretKnowledge: "Va veure una ombra fugint del lloc del crim.",
          coartada: {
            location: "Taller d'artesania",
            timeStart: "21:30",
            timeEnd: "23:00",
            witness: "Ningú",
            credibility: "baixa"
          },
          rumor: "Sempre treballa fins tard i ningú sap realment què fa.",
          relationships: "Poca relació amb els altres sospitosos.",
          tensions: "Frustració pel creixement del poble."
        });
      }
    }

    const assassinName = (caseData.assassin || "").trim().toLowerCase();
    const assassinChar = caseData.characters.find(c => c.name.trim().toLowerCase() === assassinName);

    if (!assassinChar && caseData.characters.length > 0) {
      const firstChar = caseData.characters[0];
      if (firstChar) {
        console.warn(`[REPAIR] Assassin '${caseData.assassin}' not found. Defaulting to '${firstChar.name}'.`);
        caseData.assassin = firstChar.name;
      }
    }

    return caseData;
  }

  private validateCaseData(caseData: FullCase, expectedCount: number): string[] {
    const errors: string[] = [];

    if (caseData.characters.length !== expectedCount) {
      errors.push(`Nombre de personatges incorrecte: s'esperaven ${expectedCount}, s'han rebut ${caseData.characters.length}.`);
    }

    const validWeapons = WEAPONS as string[];
    const validLocations = LOCATIONS as string[];

    if (!caseData.weapon || !validWeapons.includes(caseData.weapon)) {
       const fallbackWeapon = validWeapons[0] || 'Ganivet de cuina';
       console.warn(`[REPAIR] Invalid weapon '${caseData.weapon}'. Using '${fallbackWeapon}' as fallback.`);
       caseData.weapon = fallbackWeapon;
    }

    if (!caseData.location || !validLocations.includes(caseData.location)) {
       const fallbackLocation = validLocations[0] || 'Carrer Major';
       console.warn(`[REPAIR] Invalid location '${caseData.location}'. Using '${fallbackLocation}' as fallback.`);
       caseData.location = fallbackLocation;
    }

    if (!caseData.introductionNarrative || caseData.introductionNarrative.length < 100) {
      errors.push("L'introducció és massa curta o inexistent.");
    }

    if (!caseData.solutionNarrative || caseData.solutionNarrative.length < 100) {
      errors.push("La solució narrativa és massa curta o inexistent.");
    }

    return errors;
  }

  private isValidIntro(intro: string, weapon: string, location: string): boolean {
    if (!intro) return false;
    const lowerIntro = intro.toLowerCase();

    if (weapon && lowerIntro.includes(weapon.toLowerCase())) return false;
    if (location && lowerIntro.includes(location.toLowerCase())) return false;

    const genericForbidden = [
      'celler', 'cuina', 'jardí', 'habitació', 'sala', 'garatge', 'biblioteca', 'bany', 'golfes', 'terrassa', 'menjador'
    ];

    for (const word of genericForbidden) {
      if (lowerIntro.includes(word)) return false;
    }

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

  public async respondToQuestion(publicGameState: string, question: string, difficulty: Difficulty = 'hard'): Promise<{ response: string }> {
    const diffContext = this.getDifficultyInstruction(difficulty);
    const instruction = `Respon la pregunta de l'investigador de manera molt directa i breu (màxim 15 paraules).
${diffContext}
Regles:
- No utilitzis metàfores ni descripcions poètiques.
- Dona una pista subtil o un fet concret si és possible.
- Sigues enigmàtic però concís.
- Respon siempre en català.
- Retorna la resposta en JSON.
Estructura JSON:
{
  "response": "..."
}`;
    const result = await this.generateNarrative({ instruction, publicGameState, question, json: true }, 150);
    try {
      return JSON.parse(result);
    } catch (e) {
      return { response: result };
    }
  }

  public async generateClueNarration(publicGameState: string, clueDescription: string, difficulty: Difficulty = 'hard'): Promise<string> {
    const diffContext = this.getDifficultyInstruction(difficulty);
    const instruction = `Narra una pista o rumor de manera breu i directa (màxim 20 paraules).
${diffContext}
Evita l'atmosfera innecessària. Utilitza descripcions si parles de l'arma o el lloc, però sigues concís. Respon en català.`;
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
        ],
        response_format: payload.json ? { type: "json_object" } : undefined
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
