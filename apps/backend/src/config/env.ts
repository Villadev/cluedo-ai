import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGIN: z.string().default('http://localhost:4200,http://localhost:4300,https://backend-veq8.onrender.com,https://player-ui.onrender.com,https://master-ui.onrender.com'),
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY és obligatori')
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Variables d'entorn invàlides: ${parsed.error.message}`);
}

export const env = parsed.data;

export const corsOrigins = env.CORS_ORIGIN.split(',').map((origin) => origin.trim());
