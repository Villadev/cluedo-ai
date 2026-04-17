import fs from 'node:fs';
import path from 'node:path';
import { openaiClient } from '../config/openai.js';
import {
  FullCase,
  AIServiceCharacter,
  AIServiceClue,
  Difficulty,
  GenerationPhase,
  GenerationPhases
} from '../types/game.types.js';
import { env } from '../config/env.js';
import { WEAPONS, LOCATIONS } from '../config/game-options.js';
import { telemetryService } from './telemetry.service.js';
import { errorLogger } from '../utils/error-logger.js';

const resolveContextPath = (fileName: string): string => {
  const possiblePaths = [
    path.join(process.cwd(), 'src', 'context', fileName),
    path.join(process.cwd(), 'apps', 'backend', 'src', 'context', fileName)
  ];

  const foundPath = possiblePaths.find((candidatePath) => fs.existsSync(candidatePath));
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

  public async enrichCharacterProfilesBatch(gameId: string, caseBible: Partial<FullCase>, characters: Partial<AIServiceCharacter>[], difficulty: Difficulty, chunkIndex: number = 0, signal?: AbortSignal): Promise<Partial<AIServiceCharacter>[]> {
    const label = `characters_enrich_profiles_chunk_${chunkIndex}`;
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
      const returnedCharacters = Array.isArray(data.characters) ? data.characters : [];
      const returnedNames = returnedCharacters.map(c => this.normalizeName(c.name || ''));
      const expectedNames = characters.map(c => this.normalizeName(c.name || ''));
      const missingNames = expectedNames.filter(name => !returnedNames.includes(name));
      const extraNames = returnedNames.filter(name => !expectedNames.includes(name));
      const valid = missingNames.length === 0 && extraNames.length === 0 && returnedNames.length === expectedNames.length;
      return {
        valid,
        details: {
          expectedCount: expectedNames.length,
          returnedCount: returnedNames.length,
          expectedNames,
          returnedNames,
          missingNames,
          extraNames
        }
      };
    }, 3, signal);

    return result.characters;
  }

  public async enrichCharacterRelationsBatch(gameId: string, caseBible: Partial<FullCase>, characters: Partial<AIServiceCharacter>[], difficulty: Difficulty, chunkIndex: number = 0, signal?: AbortSignal): Promise<Partial<AIServiceCharacter>[]> {
    const label = `characters_enrich_relations_chunk_${chunkIndex}`;
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
      const returnedCharacters = Array.isArray(data.characters) ? data.characters : [];
      const returnedNames = returnedCharacters.map(c => this.normalizeName(c.name || ''));
      const expectedNames = characters.map(c => this.normalizeName(c.name || ''));
      const missingNames = expectedNames.filter(name => !returnedNames.includes(name));
      const extraNames = returnedNames.filter(name => !expectedNames.includes(name));
      const valid = missingNames.length === 0 && extraNames.length === 0 && returnedNames.length === expectedNames.length;
      return {
        valid,
        details: {
          expectedCount: expectedNames.length,
          returnedCount: returnedNames.length,
          expectedNames,
          returnedNames,
          missingNames,
          extraNames
        }
      };
    }, 3, signal);

    return result.characters;
  }

  public async enrichCharacters(gameId: string, caseBible: Partial<FullCase>, characters: Partial<AIServiceCharacter>[], difficulty: Difficulty, chunkIndex: number = 0, signal?: AbortSignal): Promise<AIServiceCharacter[]> {
      const profiles = await this.enrichCharacterProfilesBatch(gameId, caseBible, characters, difficulty, chunkIndex, signal);
      const relations = await this.enrichCharacterRelationsBatch(gameId, caseBible, profiles, difficulty, chunkIndex, signal);

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

  public normalizeCharacters(relations: Partial<AIServiceCharacter>[], profiles: Partial<AIServiceCharacter>[], caseBible: Partial<FullCase>): AIServiceCharacter[] {
    return profiles.map(profile => {
      const relation = relations.find(r => this.normalizeName(r.name || '') === this.normalizeName(profile.name || ''));
      const char: AIServiceCharacter = {
        name: profile.name || 'Sense nom',
        profession: this.normalizeToString(profile.profession, 'Desconeguda'),
        description: this.normalizeToString(profile.description, 'Sense descripció'),
        personality: this.normalizeToString(profile.personality, 'Normal'),
        possibleMotive: this.normalizeToString(profile.possibleMotive, 'Cap motiu aparent'),
        secret: this.normalizeToString(profile.secret, 'Cap secret'),
        secretKnowledge: this.normalizeToString(profile.secretKnowledge, 'Cap coneixement extra'),
        rumor: this.normalizeToString(profile.rumor, 'Cap rumor'),
        relationships: this.normalizeToString(relation?.relationships, 'Cap relació especial'),
        tensions: this.normalizeToString(relation?.tensions, 'Cap tensió'),
        coartada: profile.coartada || { location: 'Desconeguda', timeStart: '00:00', timeEnd: '00:00', witness: 'Cap', credibility: 'baixa' },
        isAssassin: this.normalizeName(profile.name || '') === this.normalizeName(caseBible.assassin || '')
      };
      return char;
    });
  }

  public async generateNarratives(gameId: string, caseBible: Partial<FullCase>, difficulty: Difficulty, signal?: AbortSignal): Promise<{ introductionNarrative: string, solutionNarrative: string }> {
    const diffContext = this.getDifficultyInstruction(difficulty);
    const instruction = `Genera la introducció i la solució del cas en català.
${diffContext}
Context: Víctima: ${caseBible.victim}. Assassí: ${caseBible.assassin}. Arma: ${caseBible.weapon}. Lloc: ${caseBible.location}.

Instruccions introducció:
PROHIBICIÓ ESTRICTA: No mencionis MAI pel seu nom l'assassí, l'arma ni el lloc del crim en la introducció.
Pel que fa al LLOC DEL CRIM ("${caseBible.location}"):
- Està totalment prohibit utilitzar el nom exacte, fragments del nom o topònims identificables.
- No utilitzis sinònims ni descripcions que identifiquin de manera única l'indret exacte.
- Utilitza termes genèrics com "un indret del poble", "una zona apartada" o "un racó fosc".
Sigues suggestiu i crea misteri sense filtrar dades.

Instruccions solució: Explica com l'assassí va cometre el crim i per què.

Retorna JSON:
{
  "introductionNarrative": "...",
  "solutionNarrative": "..."
}`;

    const result = await this.callOpenAIWithRetry<{ introductionNarrative: string, solutionNarrative: string }>(gameId, instruction, "narratives", "NARRATIVES", (data) => {
      const intro = data.introductionNarrative || '';
      const solution = data.solutionNarrative || '';

      const introLen = intro.trim().length;
      const solutionLen = solution.trim().length;

      const hasIntro = introLen > 50;
      const hasSolution = solutionLen > 50;

      const validation = this.isValidIntro(intro, caseBible.weapon || '', caseBible.location || '', caseBible.assassin || '');

      const valid = hasIntro && hasSolution && validation.valid;

      return {
        valid,
        details: {
          hasIntro,
          introLength: introLen,
          hasSolution,
          solutionLength: solutionLen,
          ...validation.details
        }
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
- No revelis el culpable directament en les primeres rondes.
- Retorna un JSON on les claus siguin "round1", "round2", etc.

Exemple de format:
{
  "round1": [
    { "type": "testimoni", "text": "...", "isTrue": true },
    { "type": "rumor", "text": "...", "isTrue": false }
  ]
}`;

    return this.callOpenAIWithRetry<Record<string, AIServiceClue[]>>(gameId, instruction, "clues", "CLUES", (data) => {
      const rounds = Object.keys(data);
      const validRoundCount = rounds.length >= maxRounds;
      const allRoundsHaveClues = rounds.every(r => Array.isArray(data[r]) && data[r].length >= 1);

      // Additional deduction quality check
      const clues = Object.values(data).flat();
      const hasGoodDeductionValue = clues.every(c => {
          const text = c.text.toLowerCase();
          const hasName = caseBible.characters.some(char => text.includes(char.name.toLowerCase()));
          const hasTime = /\d{1,2}:\d{2}/.test(text);
          const hasKeywords = ['coartada', 'testimoni', 'contradicció', 'mentida', 'veritat', 'vist', 'trobat'].some(k => text.includes(k));
          return hasName || hasTime || hasKeywords;
      });

      return {
        valid: validRoundCount && allRoundsHaveClues && hasGoodDeductionValue,
        details: { roundsCount: rounds.length, expected: maxRounds, hasGoodDeductionValue }
      };
    }, 3, signal);
  }

  public validateClueCoverage(caseData: FullCase, maxRounds: number): number[] {
    const missingRounds: number[] = [];
    for (let r = 1; r <= maxRounds; r++) {
      const key = `round${r}`;
      if (!caseData.clues[key] || caseData.clues[key].length === 0) {
        missingRounds.push(r);
      }
    }
    return missingRounds;
  }

  public async recoverMissingClues(gameId: string, caseData: FullCase, missingRounds: number[], difficulty: Difficulty, signal?: AbortSignal): Promise<FullCase> {
    const diffContext = this.getDifficultyInstruction(difficulty);
    const instruction = `Falten pistes per a les rondes: ${missingRounds.join(', ')}.
Genera-les seguint el mateix format i context del cas.
${diffContext}
Cas: ${caseData.victim} mort per ${caseData.assassin} a ${caseData.location} amb ${caseData.weapon}.
Retorna JSON: { "clues": { "roundX": [ ... ] } }`;

    try {
      const result = await this.callOpenAIWithRetry<{ clues: Record<string, AIServiceClue[]> }>(gameId, instruction, "clues_recovery", "RECOVERY", (data) => {
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

        if (!responseText) throw new Error('Empty response');

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
        const baseDelay = Math.pow(2, attempts) * 1000;
        const jitter = Math.random() * 1000;
        await new Promise(res => setTimeout(res, baseDelay + jitter));
      }
    }
    throw new Error(`Failed step ${stepName} after ${maxRetries} attempts.`);
  }

  private normalizeForComparison(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .replace(/[^a-z0-9\s]/g, ' ')     // Replace punctuation with space
      .replace(/\s+/g, ' ')            // Normalize spaces
      .trim();
  }

      private isValidIntro(intro: string, weapon: string, location: string, assassin: string): {
    valid: boolean,
    details: {
      mentionsWeapon: boolean,
      mentionsAssassin: boolean,
      mentionsLocationExact: boolean,
      mentionsLocationTokens: boolean,
      matchedLocationTokens: string[]
    }
  } {
    if (!intro) return {
      valid: false,
      details: {
        mentionsWeapon: false,
        mentionsAssassin: false,
        mentionsLocationExact: false,
        mentionsLocationTokens: false,
        matchedLocationTokens: []
      }
    };

    const normIntro = this.normalizeForComparison(intro);
    const normWeapon = this.normalizeForComparison(weapon || "");
    const normLocation = this.normalizeForComparison(location || "");
    const normAssassin = this.normalizeForComparison(assassin || "");

    const checkMention = (fullText: string, target: string) => {
      if (!target) return false;
      const escapedTarget = target.replace(/[-\\/\\^$*+?.()|[\]{}]/g, "\\$&");
      const regex = new RegExp(`\\b${escapedTarget}\\b`, "i");
      return regex.test(fullText);
    };

    const mentionsWeapon = checkMention(normIntro, normWeapon);
    const mentionsAssassin = checkMention(normIntro, normAssassin);
    const mentionsLocationExact = checkMention(normIntro, normLocation);

    // Token-based location leak detection
    const stopwords = new Set(["de", "del", "la", "el", "l", "els", "les", "a", "al", "i", "d", "un", "una", "uns", "unes", "amb", "per", "en", "na"]);
    const distinctiveTokens = new Set(["torrelles", "miniatura", "esglesia", "segarra", "ajuntament", "biblioteca", "cementiri", "cluedo"]);

    const locationTokens = normLocation.split(" ")
      .filter(t => t.length >= 4 && !stopwords.has(t));

    const matchedLocationTokens = locationTokens.filter(token => {
      const regex = new RegExp(`\\b${token}\\b`, "i");
      return regex.test(normIntro);
    });

    const mentionsLocationTokens = matchedLocationTokens.length >= 2 ||
      matchedLocationTokens.some(t => distinctiveTokens.has(t));

    const valid = !mentionsWeapon && !mentionsAssassin && !mentionsLocationExact && !mentionsLocationTokens;

    return {
      valid,
      details: {
        mentionsWeapon,
        mentionsAssassin,
        mentionsLocationExact,
        mentionsLocationTokens,
        matchedLocationTokens
      }
    };
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
      const error = new Error('OPENAI_API_KEY not configured');
      errorLogger.push('OPENAI', error);
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
        response_format: payload.json ? { type: 'json_object' } : undefined
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

      console.error('[OPENAI ERROR]', error.message || error);
      errorLogger.push('OPENAI', error);
      throw new Error('Servei narratiu no disponible temporalment.');
    }
  }
}
