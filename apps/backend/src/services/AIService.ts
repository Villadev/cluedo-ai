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

const SYSTEM_PROMPT = `Ets el Mestre del Joc d'un Cluedo narratiu.
- Prioritza la narració per deducció, no la floritura literària.
- La teva narrativa és concisa i factual, carregada de tensió peró útil per als investigadors.
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

  private normalizeName(name: string): string {
    return name.trim().toLowerCase();
  }

  private shuffle<T>(array: T[]): T[] {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArray[i], newArray[j]] = [newArray[j] as T, newArray[i] as T];
    }
    return newArray;
  }

  public async generateCaseSkeleton(gameId: string, allowedParticipantNames: string[], difficulty: Difficulty, signal?: AbortSignal): Promise<Partial<FullCase>> {
    const shuffledWeapons = this.shuffle(WEAPONS);
    const shuffledLocations = this.shuffle(LOCATIONS);

    const instruction = `Crea l'esquelet d'un cas d'assassinat en català.

NOMS DELS PARTICIPANTS (l'assassí HA de ser un d'aquests):
${allowedParticipantNames.join(', ')}

La víctima NO pot ser cap dels participants anteriors. Ha de ser un personatge extern fictici.

Retorna un JSON amb:
- victim: Nom de la víctima (externa).
- weapon: Una arma de la llista: ${shuffledWeapons.join(' , ')}.
- location: Un lloc de la llista: ${shuffledLocations.join(' , ')}.
- assassin: Nom de l'assassí (un dels participants).
- crimeWindow: { start: "HH:MM", end: "HH:MM" } (finestra d'unes 2 hores).

Regles:
- Tria una arma i un lloc realistes per al context d'un poble.
- L'assassí HA de ser exactament un dels noms de la llista de participants.
- La víctima NO pot estar a la llista de participants.`;

    return this.callOpenAIWithRetry<Partial<FullCase>>(gameId, instruction, "skeleton", "SKELETON", (data) => {
      const assassinName = (data.assassin || '').trim().toLowerCase();
      const victimName = (data.victim || '').trim().toLowerCase();
      const normalizedParticipants = allowedParticipantNames.map(n => n.trim().toLowerCase());

      const assassinInParticipants = normalizedParticipants.includes(assassinName);
      const victimNotInParticipants = !normalizedParticipants.includes(victimName);

      const hasRequiredFields = !!(data.victim && data.weapon && data.location && data.assassin && data.crimeWindow);
      const valid = hasRequiredFields && assassinInParticipants && victimNotInParticipants;

      return {
        valid,
        details: {
          victim: !!data.victim,
          weapon: !!data.weapon,
          location: !!data.location,
          assassin: !!data.assassin,
          crimeWindow: !!data.crimeWindow,
          assassinInParticipants,
          victimNotInParticipants
        }
      };
    }, 3, signal);
  }

  public async generateBasicCharacters(
    gameId: string,
    caseBible: Partial<FullCase>,
    expectedCount: number,
    allowedPlayerNames: string[],
    difficulty: Difficulty,
    signal?: AbortSignal
  ): Promise<Partial<AIServiceCharacter>[]> {
    const instruction = `Crea exactament ${expectedCount} personatges per a un Cluedo en català.

NOMS PERMESOS (usa EXCLUSIVAMENT aquests noms i no n'inventis cap):
${allowedPlayerNames.join(', ')}

Regles obligatòries:
- Retorna exactament ${expectedCount} personatges.
- Cada "name" ha de coincidir EXACTAMENT amb un nom permès.
- No inventis diminutius, cognoms ni variacions.
- Inclou exactament un personatge amb el nom "${caseBible.assassin}".
- La víctima (${caseBible.victim}) NO pot aparèixer com a personatge.
- Prioritza possibleMotive concret i verificable (1 frase).

Context: Assassí: ${caseBible.assassin}. Víctima: ${caseBible.victim}. Arma: ${caseBible.weapon}. Lloc: ${caseBible.location}.

Retorna JSON:
{
  "characters": [
    { "name": "...", "profession": "...", "possibleMotive": "..." }
  ]
}`;

    const result = await this.callOpenAIWithRetry<{ characters: Partial<AIServiceCharacter>[] }>(gameId, instruction, "characters_basic", "CHARACTERS", (data) => {
      const characters = data.characters || [];
      const returnedCount = characters.length;

      const assassinMatched = characters.some(c => this.normalizeName(c.name || '') === this.normalizeName(caseBible.assassin || ''));
      const uniqueNames = new Set(characters.map(c => this.normalizeName(c.name || '')));
      const allNamesAllowed = characters.every(c => allowedPlayerNames.some(allowed => this.normalizeName(allowed) === this.normalizeName(c.name || '')));

      const valid = returnedCount === expectedCount && assassinMatched && uniqueNames.size === expectedCount && allNamesAllowed;

      return {
        valid,
        details: {
          expectedCount,
          returnedCount,
          assassinExpected: caseBible.assassin,
          assassinMatched,
          uniqueNamesCount: uniqueNames.size,
          allNamesAllowed
        }
      };
    }, 3, signal);
    return result.characters;
  }

  public async enrichCharacterProfilesBatch(gameId: string, caseBible: Partial<FullCase>, characters: Partial<AIServiceCharacter>[], difficulty: Difficulty, label: string, signal?: AbortSignal): Promise<Partial<AIServiceCharacter>[]> {
    const diffContext = this.getDifficultyInstruction(difficulty);
    const instruction = `Enriqueix aquests personatges per a deducció (Cluedo en català).
Víctima: ${caseBible.victim}. Crim: de ${caseBible.crimeWindow?.start} a ${caseBible.crimeWindow?.end} a ${caseBible.location} amb ${caseBible.weapon}.
${diffContext}

Personatges: ${JSON.stringify(characters.map(c => c.name))}

Prioritats (obligatori):
1) possibleMotive concret (deute, gelosia, venjança, xantatge, etc.)
2) coartada amb franja horària i testimoni
3) secretKnowledge útil sobre un altre personatge

No prioritats:
- Descripcions literàries llargues
- Atmosfera/floritura narrativa

Per a cada personatge, limita:
- description: màxim 1 frase curta
- personality: màxim 1 frase curta
- secret: 1 frase factual
- secretKnowledge: 1 frase factual amb nom d'un altre personatge
- rumor: 1 frase verificable
- coartada: { location, timeStart, timeEnd, witness, credibility ("alta"|"mitjana"|"baixa") }

Retorna només JSON:
{ "characters": [ { name, description, personality, secret, secretKnowledge, rumor, coartada } ] }`;

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
    const instruction = `Defineix relacions per deducció entre personatges (Cluedo en català). Inclou relació amb la víctima (${caseBible.victim}).
${diffContext}
Personatges: ${JSON.stringify(characters.map(c => c.name))}

Per a cada personatge:
- relationships: 1 frase concreta amb noms
- tensions: 1 frase concreta amb un conflicte recent i verificable

Evita llenguatge literari o ambigu. Dona dades accionables.
Retorna JSON: { "characters": [ { name, relationships, tensions } ] }`;

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

  private normalizeCharacters(relations: Partial<AIServiceCharacter>[], profiles: Partial<AIServiceCharacter>[], caseBible: Partial<FullCase>): AIServiceCharacter[] {
    const merged = profiles.map(p => {
      const r = relations.find(rel => this.normalizeName(rel.name || '') === this.normalizeName(p.name || ''));
      return {
        name: this.normalizeToString(p.name, 'Anònim'),
        profession: this.normalizeToString(p.profession, 'Desconeguda'),
        description: this.normalizeToString(p.description, 'Sense descripció'),
        personality: this.normalizeToString(p.personality, 'Sense personalitat'),
        possibleMotive: this.normalizeToString(p.possibleMotive, 'Desconegut'),
        secret: this.normalizeToString(p.secret, 'Cap secret'),
        secretKnowledge: this.normalizeToString(p.secretKnowledge, 'Cap coneixement'),
        coartada: p.coartada || { location: 'Desconeguda', timeStart: '00:00', timeEnd: '00:00', witness: 'Cap', credibility: 'baixa' },
        rumor: this.normalizeToString(p.rumor, 'Cap rumor'),
        relationships: this.normalizeToString(r?.relationships, 'Cap relació'),
        tensions: this.normalizeToString(r?.tensions, 'Cap tensió'),
        isAssassin: this.normalizeName(p.name || '') === this.normalizeName(caseBible.assassin || '')
      } as AIServiceCharacter;
    });

    return merged;
  }

  public async generateNarratives(gameId: string, caseBible: FullCase, difficulty: Difficulty, signal?: AbortSignal): Promise<{ introductionNarrative: string, solutionNarrative: string }> {
    const diffContext = this.getDifficultyInstruction(difficulty);
    const instruction = `Genera la introducció i la solució per a un cas de Cluedo en català.
${diffContext}
Context: Víctima: ${caseBible.victim}. Assassí: ${caseBible.assassin}. Arma: ${caseBible.weapon}. Lloc: ${caseBible.location}.
Instruccions introducció: No revelis l'assassí, l'arma ni el lloc del crim. Sigues suggestiu.
Instruccions solució: Explica com l'assassí va cometre el crim i per què.

Retorna JSON:
{
  "introductionNarrative": "...",
  "solutionNarrative": "..."
}`;

    const result = await this.callOpenAIWithRetry<{ introductionNarrative: string, solutionNarrative: string }>(gameId, instruction, "narratives", "NARRATIVES", (data) => {
      const hasIntro = !!data.introductionNarrative && data.introductionNarrative.length > 50;
      const hasSolution = !!data.solutionNarrative && data.solutionNarrative.length > 50;
      const validIntro = hasIntro && this.isValidIntro(data.introductionNarrative, caseBible.weapon, caseBible.location);

      return {
        valid: validIntro && hasSolution,
        details: { hasIntro, hasSolution, validIntro }
      };
    }, 3, signal);

    return result;
  }

  public async generateCluesByRounds(gameId: string, caseBible: FullCase, maxRounds: number, difficulty: Difficulty, signal?: AbortSignal): Promise<Record<string, AIServiceClue[]>> {
    const diffContext = this.getDifficultyInstruction(difficulty);
    const instruction = `Genera pistes progressives per a ${maxRounds} rondes en català.
${diffContext}
Cas: ${caseBible.victim} mort per ${caseBible.assassin} a ${caseBible.location} amb ${caseBible.weapon}.
Personatges: ${caseBible.characters.map(c => c.name).join(', ')}

Objectiu: pistes útils per deducció, no narrativa.
Cada pista ha d'incloure almenys UN d'aquests elements:
- nom explícit d'un personatge
- hora o franja temporal
- coartada (lloc + testimoni)
- contradicció entre declaracions

Regles:
- CADA ronda (round1..round${maxRounds}) ha de tenir >= 2 pistes.
- 25-35% de pistes han de ser falses/enganyoses (isTrue=false).
- Round 1-2: rumors i testimonis concrets.
- Round 3-4: inconsistències temporals i d'alibi.
- Round 5+: contradiccions directes que acotin sospitosos.
- Text de pista: 1-2 frases, factual, sense floritura.

Retorna JSON exactament:
{
  "clues": {
    "round1": [
      { "type": "rumor" | "witness" | "contradiction" | "evidence", "text": "...", "isTrue": boolean }
    ]
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

        // Deduction signals check
        const characterNames = caseBible.characters.map(c => this.normalizeName(c.name));
        const timeRegex = /\b([01]\d|2[0-3]):[0-5]\d\b/;
        const keywordsRegex = /coartada|testimoni|contradicció/i;

        Object.values(data.clues).forEach((roundClues: any[]) => {
            roundClues.forEach(clue => {
                if (!clue.text) errors.push("Clue text is empty");
                if (!['rumor', 'witness', 'contradiction', 'evidence'].includes(clue.type)) errors.push(`Invalid clue type: ${clue.type}`);
                if (typeof clue.isTrue !== 'boolean') errors.push("isTrue must be boolean");

                const normalizedText = this.normalizeName(clue.text || '');
                const hasName = characterNames.some(name => normalizedText.includes(name));
                const hasTime = timeRegex.test(clue.text || '');
                const hasKeyword = keywordsRegex.test(clue.text || '');

                if (!hasName && !hasTime && !hasKeyword) {
                    errors.push(`Clue lacks deduction signals: ${clue.text}`);
                }
            });
        });
      }

      return { valid: errors.length === 0, details: { errors } };
    }, 3, signal);

    return result.clues;
  }

  private normalizeCluesResponse(data: any) {
    if (!data.clues && typeof data === 'object') {
      const potentialClues = Object.keys(data).filter(k => k.startsWith('round'));
      if (potentialClues.length > 0) {
        data.clues = {};
        potentialClues.forEach(k => {
          data.clues[k] = data[k];
          delete data[k];
        });
      }
    }
  }

  public validateClueCoverage(caseData: FullCase, maxRounds: number): string[] {
    const missing: string[] = [];
    for (let i = 1; i <= maxRounds; i++) {
      const key = `round${i}`;
      if (!caseData.clues[key] || !Array.isArray(caseData.clues[key]) || caseData.clues[key].length === 0) {
        missing.push(key);
      }
    }
    return missing;
  }

  public async recoverMissingClues(gameId: string, caseData: FullCase, missingRounds: string[], difficulty: Difficulty, signal?: AbortSignal): Promise<FullCase> {
    const diffContext = this.getDifficultyInstruction(difficulty);
    const caseSummary = `Víctima: ${caseData.victim}. Assassí: ${caseData.assassin}.`;

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
      const model = env.OPENAI_MODEL;

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
          temperature: env.OPENAI_TEMPERATURE,
          frequency_penalty: env.OPENAI_FREQUENCY_PENALTY,
          max_tokens: env.OPENAI_MAX_TOKENS_JSON,
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
    const instruction = `Respon com a narrador-investigador en català.
${diffContext}

Format obligatori:
- 2 o 3 frases totals.
- Frase 1 (FET): dada observable o verificable.
- Frase 2 (CONTEXT): com encaixa amb coartades, temps o relacions.
- Frase 3 (IMPLICACIÓ): què implica per a la deducció (sense revelar directament el culpable).

Regles:
- No siguis poètic ni vague.
- Prioritza dades de noms, hores, coartades, contradiccions.
- No excedeixis 70 paraules.
- Retorna JSON: { "response": "..." }`;
    const result = await this.generateNarrative(gameId, { instruction, publicGameState, question, json: true }, env.OPENAI_MAX_TOKENS_NARRATOR);
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
    const model = env.OPENAI_MODEL;

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
        temperature: env.OPENAI_TEMPERATURE,
        frequency_penalty: env.OPENAI_FREQUENCY_PENALTY,
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
