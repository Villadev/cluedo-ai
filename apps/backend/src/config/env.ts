import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGIN: z.string().default('http://localhost:4200,http://localhost:4300,https://backend-veq8.onrender.com,https://player-ui.onrender.com,https://master-ui.onrender.com'),
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY és obligatori'),
  GENERATION_STEP_TIMEOUT_MS: z.coerce.number().int().positive().default(90000),
  GENERATION_GLOBAL_TIMEOUT_MS: z.coerce.number().int().positive().default(600000),
  GENERATION_CHARACTER_BATCH_SIZE: z.coerce.number().int().positive().default(4),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_TEMPERATURE: z.coerce.number().default(0.4),
  OPENAI_FREQUENCY_PENALTY: z.coerce.number().default(0.2),
  OPENAI_MAX_TOKENS_JSON: z.coerce.number().int().positive().default(1200),
  OPENAI_MAX_TOKENS_NARRATOR: z.coerce.number().int().positive().default(320)
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  if (!process.env.OPENAI_API_KEY) {
    console.error("[CONFIG ERROR] OPENAI_API_KEY is missing");
  }
  throw new Error(`Variables d'entorn invàlides: ${parsed.error.message}`);
}

export const env = parsed.data;

if (env.OPENAI_API_KEY) {
  console.log("[CONFIG] OpenAI API key detected");
}

export const corsOrigins = env.CORS_ORIGIN.split(',').map((origin) => origin.trim());
