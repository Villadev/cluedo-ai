import { z } from 'zod';

const text = z.string().trim().min(1);
export const coartadaSchema = z.object({
  location: text, timeStart: text, timeEnd: text, witness: text,
  credibility: z.enum(['alta', 'mitjana', 'baixa'])
}).strict();
const victimNameSchema = z.object({ name: text }).strict();
export const basicSchema = z.object({ characters: z.array(z.object({
  name: text, profession: text, possibleMotive: text
}).strict()) }).strict();
export const relationsSchema = z.object({ relations: z.array(z.object({
  a: text, b: text, type: z.enum(['conflict', 'ally', 'debt', 'secret']),
  strength: z.enum(['low', 'medium', 'high']), note: text
}).strict()) }).strict();
export const planSchema = z.object({ characters: z.array(z.object({
  name: text, secret: text, secretKnowledge: text, rumor: text,
  coartada: coartadaSchema
}).strict()) }).strict();
export const profilesSchema = z.object({ characters: z.array(z.object({
  name: text, description: text, personality: text
}).strict()) }).strict();
export const narrativesSchema = z.object({
  introductionNarrative: text, solutionNarrative: text
}).strict();
export const clueSchema = z.object({
  type: z.enum(['rumor', 'witness', 'contradiction', 'evidence']),
  text, isTrue: z.boolean()
}).strict();
export const cluesSchema = z.object({ clues: z.array(z.object({ factId: text, text }).strict()).min(2) }).strict();
export const reviewSchema = z.object({ issues: z.array(z.object({
  area: z.enum(['plan', 'clues', 'narratives']), reason: text
}).strict()) }).strict();

export function schemaForStep(step: string): z.ZodTypeAny {
  if (step === 'victim_name') return victimNameSchema;
  if (step === 'characters_basic') return basicSchema;
  if (step === 'relations_matrix') return relationsSchema;
  if (step === 'case_plan') return planSchema;
  if (step.startsWith('characters_enrich')) return profilesSchema;
  if (step === 'narratives') return narrativesSchema;
  if (step.startsWith('clues_round_')) return cluesSchema;
  if (step === 'case_review') return reviewSchema;
  throw new Error(`Unknown generation contract: ${step}`);
}
