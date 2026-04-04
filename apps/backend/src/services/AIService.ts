import fs from 'node:fs';
import path from 'node:path';
import { openaiClient } from '../config/openai.js';
import { errorLogger } from '../utils/error-logger.js';
import { FullCase, Difficulty, AIServiceCharacter, AIServiceClue, GenerationPhase } from '../types/game.types.js';
import { WEAPONS, LOCATIONS } from '../config/game-options.js';
import { env } from '../config/env.js';
import { telemetryService } from './telemetry.service.js';

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


  private shuffle<T>(array: T[]): T[] {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArray[i], newArray[j]] = [newArray[j] as T, newArray[i] as T];
    }
    return newArray;
  }

  public async generateCaseSkeleton(gameId: string, difficulty: Difficulty, signal?: AbortSignal): Promise<Partial<FullCase>> {
    const shuffledWeapons = this.shuffle(WEAPONS);
    const shuffledLocations = this.shuffle(LOCATIONS);

    const instruction = `Crea l'esquelet d'un cas d'assassinat en català. La víctima NO és un dels jugadors. La víctima ha de ser un personatge extern.
Retorna un JSON amb:
- victim: Nom de la víctima.
- weapon: Una arma de la llista: ${shuffledWeapons.join(' , ')}.
- location: Un lloc de la llista: ${shuffledLocations.join(' , ')}.
- assassin: Nom del futur assassí (serà un dels personatges).
- crimeWindow: { start: "HH:MM", end: "HH:MM" } (finestra d'unes 2 hores).

Regles:
- Tria una arma i un lloc realistes per al context d'un poble.
- L'assassí ha de tenir un nom català o comú a la zona.`;

    return this.callOpenAIWithRetry<Partial<FullCase>>(gameId, instruction, "skeleton", "SKELETON", (data) => {
      const valid = !!(data.victim && data.weapon && data.location && data.assassin && data.crimeWindow);
      return {
        valid,
        details: {
          assassinExpected: data.assassin,
          assassinMatched: !!data.assassin
        }
      };
    }, 3, signal);
  }

  public async generateBasicCharacters(gameId: string, caseBible: Partial<FullCase>, expectedCount: number, difficulty: Difficulty, signal?: AbortSignal): Promise<Partial<AIServiceCharacter>[]> {
    const instruction = `Crea exactament ${expectedCount} personatges per a un Cluedo en català. La víctima NO és un dels jugadors. La víctima ha de ser un personatge extern. La víctima ha de tenir relacions o connexions amb diversos participants (p. ex., conflictes, deutes, secrets o vincles personals).
Assassí: ${caseBible.assassin}. Víctima: ${caseBible.victim}. Arma: ${caseBible.weapon}. Lloc: ${caseBible.location}.

Retorna un JSON amb "characters": [
  { "name": "...", "profession": "...", "possibleMotive": "..." }
] (exactament ${expectedCount} elements, un d'ells ha de ser ${caseBible.assassin})`;

    const result = await this.callOpenAIWithRetry<{ characters: Partial<AIServiceCharacter>[] }>(gameId, instruction, "characters_basic", "CHARACTERS", (data) => {
      const returnedCount = Array.isArray(data.characters) ? data.characters.length : 0;
      const assassinMatched = Array.isArray(data.characters) && data.characters.some(c => c.name === caseBible.assassin);
      const valid = returnedCount === expectedCount && assassinMatched;

      return {
        valid,
        details: {
          expectedCount,
          returnedCount,
          assassinExpected: caseBible.assassin,
          assassinMatched
        }
      };
    }, 3, signal);
    return result.characters;
  }

  public async enrichCharacterProfilesBatch(gameId: string, caseBible: Partial<FullCase>, characters: Partial<AIServiceCharacter>[], difficulty: Difficulty, label: string, signal?: AbortSignal): Promise<Partial<AIServiceCharacter>[]> {
    const diffContext = this.getDifficultyInstruction(difficulty);
    const instruction = `Enriqueix el perfil d'aquests personatges (Cluedo en català).
Víctima: ${caseBible.victim}. Crim: de ${caseBible.crimeWindow?.start} a ${caseBible.crimeWindow?.end} a ${caseBible.location} amb ${caseBible.weapon}.
${diffContext}

Personatges: ${JSON.stringify(characters.map(c => c.name))}

Per a cada personatge, genera (màxim 1-2 frases per camp textual):
- description, personality
- secret (fet inconfessable), secretKnowledge (pista sobre un altre)
- rumor
- coartada: { location, timeStart, timeEnd, witness, credibility ("alta"|"mitjana"|"baixa") }

Retorna JSON amb "characters": [ { name, description, personality, secret, secretKnowledge, rumor, coartada } ]. Respon exclusivament en JSON.`;

    const result = await this.callOpenAIWithRetry<{ characters: Partial<AIServiceCharacter>[] }>(gameId, instruction, label, "CHARACTERS", (data) => {
      const returnedCount = Array.isArray(data.characters) ? data.characters.length : 0;
      const expectedCount = characters.length;
      return {
        valid: returnedCount === expectedCount,
        details: { expectedCount, returnedCount }
      };
    }, 3, signal);

    return result.characters;
  }

  public async enrichCharacterRelationsBatch(gameId: string, caseBible: Partial<FullCase>, characters: Partial<AIServiceCharacter>[], difficulty: Difficulty, label: string, signal?: AbortSignal): Promise<Partial<AIServiceCharacter>[]> {
    const diffContext = this.getDifficultyInstruction(difficulty);
    const instruction = `Defineix les relacions i tensions entre aquests personatges (Cluedo en català). Assegura't d'incloure relacions i tensions amb la víctima (${caseBible.victim}).
${diffContext}
Personatges: ${JSON.stringify(characters.map(c => c.name))}

Per a cada personatge, genera (màxim 1-2 frases per camp textual):
- relationships (com es porta amb els altres)
- tensions (conflictes recents)

Retorna JSON amb "characters": [ { name, relationships, tensions } ]. Respon exclusivament en JSON.`;

    const result = await this.callOpenAIWithRetry<{ characters: Partial<AIServiceCharacter>[] }>(gameId, instruction, label, "CHARACTERS", (data) => {
      const returnedCount = Array.isArray(data.characters) ? data.characters.length : 0;
      const expectedCount = characters.length;
      return {
        valid: returnedCount === expectedCount,
        details: { expectedCount, returnedCount }
      };
    }, 3, signal);

    return result.characters;
  }

  public async enrichCharacters(gameId: string, caseBible: Partial<FullCase>, characters: Partial<AIServiceCharacter>[], difficulty: Difficulty, signal?: AbortSignal): Promise<AIServiceCharacter[]> {
      const profiles = await this.enrichCharacterProfilesBatch(gameId, caseBible, characters, difficulty, "characters_enrich_legacy_profiles", signal);
      const relations = await this.enrichCharacterRelationsBatch(gameId, caseBible, profiles, difficulty, "characters_enrich_legacy_relations", signal);

      return this.normalizeCharacters(relations, profiles, caseBible);
  }

  private normalizeToString(value: any, fallback: string): string {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'string') return value.trim() || fallback;
    if (Array.isArray(value)) return value.join(', ') || fallback;
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch (e) {
        return String(value) || fallback;
      }
    }
    return String(value) || fallback;
  }

  public normalizeCharacters(aiCharacters: Partial<AIServiceCharacter>[], basicCharacters: Partial<AIServiceCharacter>[], caseBible: Partial<FullCase>): AIServiceCharacter[] {
      return basicCharacters.map((basic, i) => {
          const enriched = aiCharacters.find(c => c.name === basic.name) || aiCharacters[i] || ({} as Partial<AIServiceCharacter>);
          return {
              name: basic.name || enriched.name || 'Desconegut',
              profession: basic.profession || enriched.profession || 'Sense professió',
              description: enriched.description || basic.description || 'Sense descripció',
              personality: enriched.personality || basic.personality || 'Sense personalitat',
              possibleMotive: basic.possibleMotive || enriched.possibleMotive || 'Sense motiu',
              secret: enriched.secret || basic.secret || 'Sense secret',
              secretKnowledge: enriched.secretKnowledge || basic.secretKnowledge || 'Sense coneixement secret',
              coartada: enriched.coartada || basic.coartada || {
                  location: 'Desconeguda',
                  timeStart: caseBible.crimeWindow?.start || '00:00',
                  timeEnd: caseBible.crimeWindow?.end || '00:00',
                  witness: 'Ningú',
                  credibility: 'baixa'
              },
              rumor: this.normalizeToString(enriched.rumor || basic.rumor, 'Cap rumor'),
              relationships: this.normalizeToString(enriched.relationships || basic.relationships, 'Cap relació'),
              tensions: this.normalizeToString(enriched.tensions || basic.tensions, 'Cap tensió')
          } as AIServiceCharacter;
      });
  }

  public async generateNarratives(gameId: string, caseBible: FullCase, difficulty: Difficulty, signal?: AbortSignal): Promise<{ introductionNarrative: string, solutionNarrative: string }> {
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

    return this.callOpenAIWithRetry<{ introductionNarrative: string, solutionNarrative: string }>(gameId, instruction, "narratives", "NARRATIVES", (data) => {
      const validIntro = this.isValidIntro(data.introductionNarrative, caseBible.weapon, caseBible.location);
      return {
        valid: !!(data.introductionNarrative && data.solutionNarrative && validIntro)
      };
    }, 3, signal);
  }

  private normalizeCluesResponse(data: any): void {
    if (!data.clues) return;

    for (const roundKey of Object.keys(data.clues)) {
      const roundClues = data.clues[roundKey];
      if (!Array.isArray(roundClues)) continue;

      for (const clue of roundClues) {
        // Map misleading to isTrue if isTrue is missing
        if (clue.isTrue === undefined && clue.misleading !== undefined) {
          clue.isTrue = !clue.misleading;
        }

        // Ensure type and text fallback
        if (clue.type === undefined) clue.type = 'rumor';
        if (clue.text === undefined) clue.text = 'Pista no disponible temporalment';
        if (clue.isTrue === undefined) clue.isTrue = true; // Safe default
      }
    }
  }

  public async generateCluesByRounds(gameId: string, caseBible: FullCase, maxRounds: number, difficulty: Difficulty, signal?: AbortSignal): Promise<Record<string, AIServiceClue[]>> {
    const diffContext = this.getDifficultyInstruction(difficulty);
    const instruction = `Genera pistes progressives per a ${maxRounds} rondes en català.
${diffContext}
Cas: ${caseBible.victim} mort per ${caseBible.assassin} a ${caseBible.location} amb ${caseBible.weapon}.

Regles:
- CADA RONDA (round1 a round${maxRounds}) ha de tenir almenys una pista.
- Almenys un 30% de les pistes han de ser falses o enganyoses.
- Round 1-2: Rumors. Round 3-4: Referències indirectes. Round 5+: Contradiccions clares.
- IMPORTANT: El camp boolean per indicar veracitat és "isTrue" (true si és veritat, false si és mentida/enganyosa).

Retorna un JSON amb l'estructura exacta:
{
  "clues": {
    "round1": [
      { "type": "rumor" | "witness" | "contradiction" | "evidence", "text": "...", "isTrue": boolean }
    ],
    ...
  }
}`;

    const result = await this.callOpenAIWithRetry<{ clues: Record<string, AIServiceClue[]> }>(gameId, instruction, "clues", "CLUES", (data) => {
      this.normalizeCluesResponse(data);

      const errors: string[] = [];

      if (!data.clues) {
        errors.push("Missing 'clues' root object");
      } else {
        const missing = this.validateClueCoverage({ clues: data.clues } as FullCase, maxRounds);
        if (missing.length > 0) {
          errors.push(`Missing rounds: ${missing.join(', ')}`);
        }
      }

      return { valid: errors.length === 0 };
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

  public async recoverMissingClues(gameId: string, caseData: FullCase, missingRounds: string[], difficulty: Difficulty, signal?: AbortSignal): Promise<FullCase> {
    const diffContext = this.getDifficultyInstruction(difficulty);
    const caseSummary = `Víctima: ${caseData.victim}, Arma: ${caseData.weapon}, Lloc: ${caseData.location}, Assassí: ${caseData.assassin}.`;

    const instruction = `Respon en català. Falten pistes per a les rondes: ${missingRounds.join(', ')}.
${diffContext}
Resum del cas: ${caseSummary}
Genera almenys 2 pistes per a cadascuna d'aquestes rondes.
Retorna JSON: { "clues": { "roundX": [...] } }`;

    try {
      const result = await this.callOpenAIWithRetry<{ clues: Record<string, AIServiceClue[]> }>(gameId, instruction, "recovery", "RECOVERY", (data) => {
        return { valid: !!data.clues };
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

  private async callOpenAIWithRetry<T>(
    gameId: string,
    instruction: string,
    stepName: string,
    phase: GenerationPhase,
    validator: (data: T) => { valid: boolean, details?: any },
    maxRetries: number = 3,
    signal?: AbortSignal
  ): Promise<T> {
    let attempts = 0;
    while (attempts < maxRetries) {
      attempts++;
      const startedAt = Date.now();
      const model = 'gpt-4o-mini';

      if (signal?.aborted) {
        const endedAt = Date.now();
        telemetryService.record({
          gameId, phase, stepLabel: stepName, stepName, attempt: attempts,
          startAt: startedAt, endAt: endedAt, durationMs: endedAt - startedAt,
          outcome: 'aborted', model, errorMessage: 'Request aborted before call'
        });
        throw new Error(`Step ${stepName} aborted before attempt ${attempts}`);
      }

      try {
        console.log(`[OPENAI] Step: ${stepName} (Attempt ${attempts}/${maxRetries})`);
        const completion = await openaiClient.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: instruction + "\n\nRespon exclusivament en JSON." }
          ],
          response_format: { type: "json_object" }
        }, { signal });

        const endedAt = Date.now();
        const responseText = completion.choices[0]?.message.content;
        const usage = completion.usage ? {
          prompt_tokens: completion.usage.prompt_tokens,
          completion_tokens: completion.usage.completion_tokens,
          total_tokens: completion.usage.total_tokens
        } : undefined;

        if (!responseText) throw new Error("Empty response");

        let data: T;
        try {
          data = JSON.parse(responseText) as T;
        } catch (parseError: any) {
          telemetryService.record({
            gameId, phase, stepLabel: stepName, stepName, attempt: attempts,
            startAt: startedAt, endAt: endedAt, durationMs: endedAt - startedAt,
            outcome: 'error', model, usage, errorMessage: `JSON parse error: ${parseError.message}`
          });
          throw parseError;
        }

        const { valid, details } = validator(data);

        if (valid) {
          telemetryService.record({
            gameId, phase, stepLabel: stepName, stepName, attempt: attempts,
            startAt: startedAt, endAt: endedAt, durationMs: endedAt - startedAt,
            outcome: 'success', model, usage, validationDetails: details
          });
          return data;
        }

        telemetryService.record({
          gameId, phase, stepLabel: stepName, stepName, attempt: attempts,
          startAt: startedAt, endAt: endedAt, durationMs: endedAt - startedAt,
          outcome: 'validation_failed', model, usage, validationDetails: details,
          errorMessage: `Validation failed for ${stepName}`
        });

      } catch (error: any) {
        const endedAt = Date.now();
        const isAbort = error.name === 'AbortError' || signal?.aborted;
        const outcome = isAbort ? 'aborted' : (error.message?.includes('timeout') ? 'timeout' : 'error');

        telemetryService.record({
          gameId, phase, stepLabel: stepName, stepName, attempt: attempts,
          startAt: startedAt, endAt: endedAt, durationMs: endedAt - startedAt,
          outcome, model, errorMessage: error.message
        });

        if (isAbort) throw error;
        if (attempts >= maxRetries) throw error;
        await new Promise(res => setTimeout(res, 1000 * attempts));
      }
    }
    throw new Error(`Failed step ${stepName} after ${maxRetries} attempts.`);
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

  public async respondToQuestion(gameId: string, publicGameState: string, question: string, difficulty: Difficulty = 'hard'): Promise<{ response: string }> {
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
    const result = await this.generateNarrative(gameId, { instruction, publicGameState, question, json: true }, 150);
    try {
      return JSON.parse(result);
    } catch (e) {
      return { response: result };
    }
  }

  public async generateClueNarration(gameId: string, publicGameState: string, clueDescription: string, difficulty: Difficulty = 'hard'): Promise<string> {
    const diffContext = this.getDifficultyInstruction(difficulty);
    const instruction = `Narra una pista o rumor de manera breu i directa (màxim 20 paraules).
${diffContext}
Evita l'atmosfera innecessària. Utilitza descripcions si parles de l'arma o el lloc, però sigues concís. Respon en català.`;
    return this.generateNarrative(gameId, { instruction, publicGameState, clueDescription }, 100);
  }

  public async generatePrivateMessage(gameId: string, privateContext: string): Promise<string> {
    const instruction = 'Redacta un missatge privat i segur, alineat amb la partida i sense revelar informació aliena. Respon sempre en català.';
    return this.generateNarrative(gameId, { instruction, privateContext }, 220);
  }

  private async generateNarrative(gameId: string, payload: OpenAICallInput, maxTokens: number): Promise<string> {
    const startedAt = Date.now();
    const model = 'gpt-4o-mini';

    if (!process.env.OPENAI_API_KEY) {
      const endedAt = Date.now();
      telemetryService.record({
        gameId, phase: 'IDLE', stepLabel: 'narrative', stepName: 'narrative', attempt: 1,
        startAt: startedAt, endAt: endedAt, durationMs: endedAt - startedAt,
        outcome: 'error', model, errorMessage: 'OPENAI_API_KEY not configured'
      });
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
        model,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent }
        ],
        response_format: payload.json ? { type: "json_object" } : undefined
      }, { signal: payload.signal });

      const endedAt = Date.now();
      const outputText = completion.choices[0]?.message.content?.trim();
      const usage = completion.usage ? {
        prompt_tokens: completion.usage.prompt_tokens,
        completion_tokens: completion.usage.completion_tokens,
        total_tokens: completion.usage.total_tokens
      } : undefined;

      if (!outputText) throw new Error('Resposta buida del model');

      telemetryService.record({
        gameId, phase: 'IDLE', stepLabel: 'narrative', stepName: 'narrative', attempt: 1,
        startAt: startedAt, endAt: endedAt, durationMs: endedAt - startedAt,
        outcome: 'success', model, usage
      });

      return outputText;
    } catch (error: any) {
      const endedAt = Date.now();
      const isAbort = error.name === 'AbortError' || payload.signal?.aborted;
      const outcome = isAbort ? 'aborted' : 'error';

      telemetryService.record({
        gameId, phase: 'IDLE', stepLabel: 'narrative', stepName: 'narrative', attempt: 1,
        startAt: startedAt, endAt: endedAt, durationMs: endedAt - startedAt,
        outcome, model, errorMessage: error.message
      });

      console.error("[OPENAI ERROR]", error.message || error);
      errorLogger.push("OPENAI", error);
      throw new Error('Servei narratiu no disponible temporalment.');
    }
  }
}
