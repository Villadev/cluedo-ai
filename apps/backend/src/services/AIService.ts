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
    console.log(`[ORCHESTRATOR] Starting multi-step case generation (Players: ${expectedCount}, Rounds: ${maxRounds})`);

    // 1. Case Skeleton
    let fullCase = await this.generateCaseSkeleton(difficulty);

    // 2. Characters
    fullCase.characters = await this.generateCharacters(fullCase as FullCase, expectedCount, difficulty);
    fullCase = this.normalizeCaseData(fullCase as FullCase, expectedCount);

    // 3. Narratives
    const narratives = await this.generateNarratives(fullCase as FullCase, difficulty);
    fullCase.introductionNarrative = narratives.introductionNarrative;
    fullCase.solutionNarrative = narratives.solutionNarrative;

    // 4. Clues
    fullCase.clues = await this.generateCluesByRounds(fullCase as FullCase, maxRounds, difficulty);

    // 5. Missing Clues Recovery
    let missingRounds = this.validateClueCoverage(fullCase as FullCase, maxRounds);
    if (missingRounds.length > 0) {
      console.warn(`[ORCHESTRATOR] Missing clues for rounds: ${missingRounds.join(', ')}. Attempting recovery...`);
      fullCase = await this.recoverMissingClues(fullCase as FullCase, missingRounds, difficulty);
      missingRounds = this.validateClueCoverage(fullCase as FullCase, maxRounds);
    }

    if (missingRounds.length > 0) {
      console.warn(`[ORCHESTRATOR] Clue recovery failed for: ${missingRounds.join(', ')}. Applying fallbacks.`);
      fullCase = this.applyFallbackClues(fullCase as FullCase, missingRounds);
    }

    // Final Validation
    const errors = this.validateCaseData(fullCase as FullCase, expectedCount);
    if (errors.length > 0) {
      console.error("[ORCHESTRATOR] Final case validation failed:", errors);
      // We try to return it anyway if it's mostly usable, or throw if critical
      if (errors.some(e => e.includes('personatges'))) {
        throw new Error("Critical validation failure: " + errors.join("; "));
      }
    }

    console.log("[ORCHESTRATOR] Case generation complete.");
    return fullCase as FullCase;
  }

  private async generateCaseSkeleton(difficulty: Difficulty): Promise<Partial<FullCase>> {
    const instruction = `Crea l'esquelet d'un cas d'assassinat en català.
Retorna un JSON amb:
- victim: Nom de la víctima.
- weapon: Una arma de la llista: ${WEAPONS.join(', ')}.
- location: Un lloc de la llista: ${LOCATIONS.join(', ')}.
- assassin: Nom del futur assassí (serà un dels personatges).
- crimeWindow: { start: "HH:MM", end: "HH:MM" } (finestra d'unes 2 hores).

Regles:
- Tria una arma i un lloc realistes per al context d'un poble.
- L'assassí ha de tenir un nom català o comú a la zona.`;

    return this.callOpenAIWithRetry<Partial<FullCase>>(instruction, "skeleton", (data) => {
      return !!(data.victim && data.weapon && data.location && data.assassin && data.crimeWindow);
    });
  }

  private async generateCharacters(caseBible: FullCase, expectedCount: number, difficulty: Difficulty): Promise<AIServiceCharacter[]> {
    const instruction = `Crea exactament ${expectedCount} personatges sospitosos per a un cas d'assassinat en català.
L'assassí ha de ser ${caseBible.assassin}. La víctima és ${caseBible.victim}. El crim va passar entre les ${caseBible.crimeWindow.start} i les ${caseBible.crimeWindow.end} a ${caseBible.location} amb ${caseBible.weapon}.

Cada personatge ha de tenir:
- nom (un d'ells ha de ser ${caseBible.assassin})
- professió, descripció, personalitat
- possibleMotive (motiu per voler mort a ${caseBible.victim})
- secret, secretKnowledge (pista sobre un altre personatge o el crim)
- coartada: { location, timeStart, timeEnd, witness, credibility ("alta", "mitjana", "baixa") }
- rumor, relationships, tensions

Regles coartada:
- Cap coartada cobreix tota la finestra del crim.
- Almenys el 60% referencien un altre sospitós com a testimoni.
- Almenys una contradicció entre coartades.

Retorna un JSON amb una llista "characters".`;

    const result = await this.callOpenAIWithRetry<{ characters: AIServiceCharacter[] }>(instruction, "characters", (data) => {
      return Array.isArray(data.characters) && data.characters.length >= expectedCount;
    });

    return result.characters;
  }

  private async generateNarratives(caseBible: FullCase, difficulty: Difficulty): Promise<{ introductionNarrative: string, solutionNarrative: string }> {
    const instruction = `Genera dues narratives per al cas d'assassinat en català.
Víctima: ${caseBible.victim}. Assassí: ${caseBible.assassin}. Arma: ${caseBible.weapon}. Lloc: ${caseBible.location}.

1. introductionNarrative (200-300 paraules):
   - Presenta el crim i la commoció al poble.
   - REGLA D'OR: NO mencionis l'arma (${caseBible.weapon}), ni el lloc (${caseBible.location}), ni l'assassí.
   - NO mencionis llocs concrets del poble.
   - Menciona la finestra temporal: ${caseBible.crimeWindow.start} - ${caseBible.crimeWindow.end}.

2. solutionNarrative (200-300 paraules):
   - Revela com ${caseBible.assassin} va matar a ${caseBible.victim} amb ${caseBible.weapon} a ${caseBible.location}.
   - Explica el motiu i la revelació final.

Retorna un JSON amb "introductionNarrative" i "solutionNarrative".`;

    return this.callOpenAIWithRetry<{ introductionNarrative: string, solutionNarrative: string }>(instruction, "narratives", (data) => {
      const validIntro = this.isValidIntro(data.introductionNarrative, caseBible.weapon, caseBible.location);
      return !!(data.introductionNarrative && data.solutionNarrative && validIntro);
    });
  }

  private async generateCluesByRounds(caseBible: FullCase, maxRounds: number, difficulty: Difficulty): Promise<Record<string, AIServiceClue[]>> {
    const diffContext = this.getDifficultyInstruction(difficulty);
    const instruction = `Genera pistes progressives per a ${maxRounds} rondes en català.
${diffContext}
Cas: ${caseBible.victim} mort per ${caseBible.assassin} a ${caseBible.location} amb ${caseBible.weapon}.

Regles:
- CADA RONDA (round1 a round${maxRounds}) ha de tenir almenys una pista.
- 30% de pistes enganyoses (misleading: true/false).
- Round 1-2: Rumors. Round 3-4: Referències indirectes. Round 5+: Contradiccions clares.

Retorna un JSON amb l'estructura "clues": { "round1": [...], ... }`;

    const result = await this.callOpenAIWithRetry<{ clues: Record<string, AIServiceClue[]> }>(instruction, "clues", (data) => {
      const missing = this.validateClueCoverage({ clues: data.clues } as FullCase, maxRounds);
      return missing.length === 0;
    });

    return result.clues;
  }

  private async callOpenAIWithRetry<T>(instruction: string, stepName: string, validator: (data: T) => boolean, maxRetries: number = 3): Promise<T> {
    let attempts = 0;
    while (attempts < maxRetries) {
      attempts++;
      try {
        console.log(`[OPENAI] Step: ${stepName} (Attempt ${attempts}/${maxRetries})`);
        const completion = await openaiClient.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: instruction + "\n\nRespon exclusivament en JSON." }
          ],
          response_format: { type: "json_object" }
        });

        const responseText = completion.choices[0]?.message.content;
        if (!responseText) throw new Error("Empty response");

        const data = JSON.parse(responseText) as T;
        if (validator(data)) {
          return data;
        }
        console.warn(`[OPENAI] Validation failed for step: ${stepName}`);
      } catch (error: any) {
        console.error(`[OPENAI ERROR] Step: ${stepName}, Attempt: ${attempts}`, error.message);
        if (attempts >= maxRetries) throw error;
      }
    }
    throw new Error(`Failed step ${stepName} after ${maxRetries} attempts`);
  }

  private validateClueCoverage(caseData: FullCase, maxRounds: number): string[] {
    const missing: string[] = [];
    if (!caseData.clues) return Array.from({ length: maxRounds }, (_, i) => `round${i + 1}`);
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

    const instruction = `Respon en català. Falten pistes per a les rondes: ${missingRounds.join(', ')}.
${diffContext}
Resum del cas: ${caseSummary}
Genera almenys 2 pistes per a cadascuna d'aquestes rondes.
Retorna JSON: { "clues": { "roundX": [...] } }`;

    try {
      const result = await this.callOpenAIWithRetry<{ clues: Record<string, AIServiceClue[]> }>(instruction, "recovery", (data) => {
        return !!data.clues;
      }, 2);

      for (const round of missingRounds) {
        if (result.clues[round]) {
          caseData.clues[round] = result.clues[round];
        }
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
       caseData.weapon = validWeapons[0] || 'Ganivet de cuina';
    }

    if (!caseData.location || !validLocations.includes(caseData.location)) {
       caseData.location = validLocations[0] || 'Carrer Major';
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
