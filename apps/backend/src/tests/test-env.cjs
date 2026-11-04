// Unit tests always use fake credentials and a mocked transport, regardless of the host environment.
process.env.OPENAI_API_KEY = 'test-only-do-not-use';
process.env.OPENAI_MODEL = 'gpt-6-luna';
