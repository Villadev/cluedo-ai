import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { openaiClient } from '../config/openai.js';
import { env } from '../config/env.js';

// One transport for every LLM request. GPT-6 reasoning models do not use the legacy sampling knobs.
export async function requestCompletion(system: string, user: string, maxTokens: number, signal?: AbortSignal, schema?: z.ZodTypeAny, json = false) {
  const reasoningModel = /^(gpt-[56]|o[134])/.test(env.OPENAI_MODEL);
  return openaiClient.chat.completions.create({
    model: env.OPENAI_MODEL,
    ...(reasoningModel ? { max_completion_tokens: maxTokens, reasoning_effort: 'low' as const } : {
      max_tokens: maxTokens, temperature: env.OPENAI_TEMPERATURE,
      frequency_penalty: env.OPENAI_FREQUENCY_PENALTY
    }),
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    response_format: schema ? zodResponseFormat(schema, 'generation') : json ? { type: 'json_object' } : undefined
  }, { signal });
}
