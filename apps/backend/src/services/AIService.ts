import fs from 'node:fs';
import path from 'node:path';
import { openaiClient } from '../config/openai.js';
import { errorLogger } from '../utils/error-logger.js';
import { FullCase, Difficulty, AIServiceCharacter, AIServiceClue } from '../types/game.types.js';
import { WEAPONS, LOCATIONS } from '../config/game-options.js';
import { env } from '../config/env.js';

const resolveContextPath = (fileName: string): string => {
  const candidatePaths = [
    path.resolve(process.cwd(), `apps/backend/src/context/${fileName}`),
    path.resolve(process.cwd(), `src/context/${fileName}`),
    path.resolve(process.cwd(), `context/${fileName}`)
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
  signal?: AbortSignal;
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
        return 'Dificultat MITJANA: Sigues equilibrat. Dona informació útil peró manté un cert misteri.';
      case 'hard':
        return 'Dificultat DIFÍCIL: Sigues subtil. Les pistes han de requerir deducció i atenció als detalls. No donis res mastegat.';
      case 'extreme':
        return 'Dificultat EXTREMA: Sigues molt vague i indirecte. Les pistes han de ser críptiques i difícils de desxifrar, sovint basades en matisos o contradiccions molt fines.';
      default:
        return '';
    }
  }

  public async generateCaseSkeleton(difficulty: Difficulty, signal?: AbortSignal): Promise<Partial<FullCase>> {
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
    }, 3, signal);
  }

  public async generateBasicCharacters(caseBible: Partial<FullCase>, expectedCount: number, difficulty: Difficulty, signal?: AbortSignal): Promise<Partial<AIServiceCharacter>[]> {
    const instruction = `Crea exactament ${expectedCount} personatges per a un Cluedo en català.
Assassí: ${caseBible.assassin}. Víctima: ${caseBible.victim}. Arma: ${caseBible.weapon}. Lloc: ${caseBible.location}.

Retorna un JSON amb "characters": [
  { "name": "...", "profession": "...", "possibleMotive": "..." }
] (exactament ${expectedCount} elements, un d'ells ha de ser ${caseBible.assassin})`;

    const result = await this.callOpenAIWithRetry<{ characters: Partial<AIServiceCharacter>[] }>(instruction, "characters_basic", (data) => {
      return Array.isArray(data.characters) && data.characters.length === expectedCount && data.characters.some(c => c.name === caseBible.assassin);
    }, 3, signal);
    return result.characters;
  }

  public async enrichCharacters(caseBible: Partial<FullCase>, characters: Partial<AIServiceCharacter>[], difficulty: Difficulty, signal?: AbortSignal): Promise<AIServiceCharacter[]> {
    const diffContext = this.getDifficultyInstruction(difficulty);
    const instruction = `Enriqueix aquests personatges per al Cluedo en català.
Víctima: ${caseBible.victim}. Crim: de ${caseBible.crimeWindow?.start} a ${caseBible.crimeWindow?.end} a ${caseBible.location} amb ${caseBible.weapon}.
${diffContext}

Personatges a enriquir: ${JSON.stringify(characters.map(c => c.name))}

Per a cada personatge, genera:
- description, personality
- secret (fet inconfessable), secretKnowledge (pista sobre un altre)
- coartada: { location, timeStart, timeEnd, witness, credibility ("alta"|"mitjana"|"baixa") }
- rumor, relationships, tensions

Retorna JSON amb "characters": [ { ...full_details } ]`;

    const result = await this.callOpenAIWithRetry<{ characters: AIServiceCharacter[] }>(instruction, "characters_enrich", (data) => {
      return Array.isArray(data.characters) && data.characters.length === characters.length;
    }, 3, signal);

    return this.normalizeCharacters(result.characters, characters, caseBible);
  }

  private normalizeCharacters(aiCharacters: AIServiceCharacter[], basicCharacters: Partial<AIServiceCharacter>[], caseBible: Partial<FullCase>): AIServiceCharacter[] {
      return basicCharacters.map((basic, i) => {
          const enriched = aiCharacters.find(c => c.name === basic.name) || aiCharacters[i] || ({} as AIServiceCharacter);
          return {
              name: basic.name || enriched.name || 'Desconegut',
              profession: basic.profession || enriched.profession || 'Sense professió',
              description: enriched.description || 'Sense descripció',
              personality: enriched.personality || 'Sense personalitat',
              possibleMotive: basic.possibleMotive || enriched.possibleMotive || 'Sense motiu',
              secret: enriched.secret || 'Sense secret',
              secretKnowledge: enriched.secretKnowledge || 'Sense coneixement secret',
              coartada: enriched.coartada || {
                  location: 'Desconeguda',
                  timeStart: caseBible.crimeWindow?.start || '00:00',
                  timeEnd: caseBible.crimeWindow?.end || '00:00',
                  witness: 'Ningú',
                  credibility: 'baixa'
              },
              rumor: enriched.rumor || 'Cap rumor',
              relationships: enriched.relationships || 'Cap relació',
              tensions: enriched.tensions || 'Cap tensió'
          } as AIServiceCharacter;
      });
  }

  public async generateCharacters(caseBible: FullCase, expectedCount: number, difficulty: Difficulty): Promise<AIServiceCharacter[]> {
    const basics = await this.generateBasicCharacters(caseBible, expectedCount, difficulty);
    return this.enrichCharacters(caseBible, basics, difficulty);
  }

  public async generateNarratives(caseBible: FullCase, difficulty: Difficulty, signal?: AbortSignal): Promise<{ introductionNarrative: string, solutionNarrative: string }> {
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
    }, 3, signal);
  }

  public async generateCluesByRounds(caseBible: FullCase, maxRounds: number, difficulty: Difficulty, signal?: AbortSignal): Promise<Record<string, AIServiceClue[]>> {
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
      if (!data.clues) return false;

      const missing = this.validateClueCoverage({ clues: data.clues } as FullCase, maxRounds);
      if (missing.length > 0) return false;

      // Validate each clue has required non-empty text and type
      for (const roundClues of Object.values(data.clues)) {
        if (!Array.isArray(roundClues)) return false;
        for (const clue of roundClues) {
          if (!clue.text || typeof clue.text !== 'string' || clue.text.trim() === '') return false;
          if (!clue.type || typeof clue.type !== 'string') return false;
          if (typeof clue.isTrue !== 'boolean') return false;
        }
      }
      return true;
    }, 3, signal);

    return result.clues;
  }

  public validateClueCoverage(caseData: FullCase, maxRounds: number): string[] {
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

  public async recoverMissingClues(caseData: FullCase, missingRounds: string[], difficulty: Difficulty, signal?: AbortSignal): Promise<FullCase> {
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
      }, 2, signal);

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

  private async callOpenAIWithRetry<T>(instruction: string, stepName: string, validator: (data: T) => boolean, maxRetries: number = 3, signal?: AbortSignal): Promise<T> {
    let attempts = 0;
    while (attempts < maxRetries) {
      attempts++;
      if (signal?.aborted) throw new Error(`Step ${stepName} aborted before attempt ${attempts}`);

      try {
        console.log(`[OPENAI] Step: ${stepName} (Attempt ${attempts}/${maxRetries})`);
        const completion = await openaiClient.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: instruction + "\n\nRespon exclusivament en JSON." }
          ],
          response_format: { type: "json_object" }
        }, { signal });

        const responseText = completion.choices[0]?.message.content;
        if (!responseText) throw new Error("Empty response");

        const data = JSON.parse(responseText) as T;
        if (validator(data)) {
          return data;
        }
        console.warn(`[OPENAI] Validation failed for step: ${stepName}`);
      } catch (error: any) {
        if (error.name === 'AbortError') {
           console.warn(`[OPENAI] Step ${stepName} aborted during attempt ${attempts}`);
           throw error;
        }
        console.error(`[OPENAI ERROR] Step: ${stepName}, Attempt: ${attempts}`, error.message);
        if (attempts >= maxRetries) throw error;
        await new Promise(res => setTimeout(res, 1000 * attempts));
      }
    }
    throw new Error(`Failed step ${stepName} after ${maxRetries} attempts`);
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
- Sigues enigmàtic peró concís.
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
      }, { signal: payload.signal });

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
