/**
 * Backend configuration. Sourced strictly from environment variables — no hardcoded
 * model tags, URLs, or timeouts in this file. The values seen below are read at module
 * load; missing required values will not crash here, but will surface as clear errors
 * when the consumer (e.g. OllamaAdapter) is constructed. This lets unit tests that
 * don't touch the LLM pass without an `.env` file.
 *
 * The single source of truth for environment is `<repo-root>/.env` (gitignored). Copy
 * `<repo-root>/.env.example` to `.env` and fill in values. The import below has the
 * side effect of locating the monorepo root and loading that file into process.env.
 */
import './env.js';

const num = (s: string | undefined): number | undefined =>
  s !== undefined && s !== '' && Number.isFinite(Number(s)) ? Number(s) : undefined;

const str = (s: string | undefined): string | undefined =>
  s !== undefined && s !== '' ? s : undefined;

export const config = {
  port: num(process.env.PORT) ?? 4000,
  host: str(process.env.HOST) ?? '0.0.0.0',
  dataDir: str(process.env.PACHU_DATA_DIR) ?? './data',
  llm: {
    baseUrl: str(process.env.OLLAMA_URL),
    model: str(process.env.OLLAMA_MODEL),
    timeoutMs: num(process.env.OLLAMA_TIMEOUT_MS),
  },
  fsrs: {
    stabilityThresholdDays: num(process.env.FSRS_STABILITY_DAYS) ?? 7,
  },
} as const;

export const VERSION = '0.0.1';

/**
 * Throw a uniformly-formatted error for a missing required env var.
 * Used by adapters that need a value at construction time.
 */
export function missingEnv(name: string): never {
  throw new Error(
    `[pachu] required env var ${name} is not set. Copy backend/.env.example to backend/.env and edit.`
  );
}
