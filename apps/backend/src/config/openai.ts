import OpenAI from 'openai';

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  throw new Error('Missing OPENAI_API_KEY environment variable. Configure it in Render: Environment -> Add OPENAI_API_KEY.');
}

export const openaiClient = new OpenAI({ apiKey });
