export const config = {
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? '0.0.0.0',
  dataDir: process.env.PACHU_DATA_DIR ?? './data',
  llm: {
    baseUrl: process.env.OLLAMA_URL ?? 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL ?? 'gemma4:26b',
    timeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS ?? 90_000),
  },
  fsrs: {
    stabilityThresholdDays: Number(process.env.FSRS_STABILITY_DAYS ?? 7),
  },
} as const;

export const VERSION = '0.0.1';
