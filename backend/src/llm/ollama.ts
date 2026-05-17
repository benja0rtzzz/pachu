import { config, missingEnv } from '../config.js';
import type { ChatMessage, ChatOptions, LlmAdapter } from './adapter.js';

/**
 * Ollama chat adapter.
 *
 * The model, base URL, and timeout are read from environment variables — there are no
 * hardcoded defaults in this file. If a value is missing at construction time, the
 * adapter throws a clear, actionable error pointing the developer at .env.example.
 *
 * Sampling defaults (temperature=1.0, top_p=0.95, top_k=64) follow Google's gemma4
 * recommendation. They also work well for most modern instruction-tuned models
 * (Qwen, Llama 3+). Lower temperatures empirically cause some local models to
 * produce empty output, so we keep the default at the model spec.
 *
 * We deliberately do NOT pass Ollama's `format: 'json'`. Some models (gemma4 in
 * particular) emit special channel/thinking tokens that interact badly with strict
 * JSON mode and return empty content. Our prompts ask for JSON in plain English
 * and our parsers handle fenced or raw JSON output.
 */
export class OllamaAdapter implements LlmAdapter {
  readonly provider = 'ollama';
  readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(opts?: { baseUrl?: string; model?: string; timeoutMs?: number }) {
    this.baseUrl = opts?.baseUrl ?? config.llm.baseUrl ?? missingEnv('OLLAMA_URL');
    this.model = opts?.model ?? config.llm.model ?? missingEnv('OLLAMA_MODEL');
    this.timeoutMs =
      opts?.timeoutMs ?? config.llm.timeoutMs ?? missingEnv('OLLAMA_TIMEOUT_MS');
  }

  async ping(): Promise<boolean> {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2_000);
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: ctrl.signal });
      clearTimeout(t);
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Always streams (`stream: true`) so callers can follow generation in real
   * time via `options.onProgress`. The streamed deltas are concatenated, so
   * the returned string is byte-identical to what the non-streaming endpoint
   * would have produced — callers that ignore `onProgress` are unaffected.
   *
   * Ollama emits newline-delimited JSON: one object per token-ish chunk
   * (`{message:{content:"…"},done:false}`), terminated by a `done:true`
   * object that may also carry an `error`.
   */
  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages,
          stream: true,
          options: {
            temperature: options.temperature ?? 1.0,
            top_p: 0.95,
            top_k: 64,
            num_predict: options.maxTokens ?? 256,
          },
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
      }
      if (!res.body) {
        throw new Error('Ollama returned no response body');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let content = '';
      let tokens = 0;
      let doneReason: string | undefined;

      const handleLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        let obj: {
          message?: { content?: string };
          done?: boolean;
          done_reason?: string;
          error?: string;
        };
        try {
          obj = JSON.parse(trimmed);
        } catch {
          return; // partial/garbled fragment — the buffer keeps the rest
        }
        if (obj.error) throw new Error(`Ollama error: ${obj.error}`);
        const delta = obj.message?.content ?? '';
        if (delta) {
          content += delta;
          tokens += 1;
          options.onProgress?.(tokens);
        }
        if (obj.done_reason) doneReason = obj.done_reason;
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          handleLine(line);
        }
      }
      // Flush any trailing object not newline-terminated.
      if (buffer.trim()) handleLine(buffer);

      if (!content && process.env.LLM_DEBUG === '1') {
        console.warn('[ollama] empty response from', this.model, 'reason:', doneReason);
      }
      return content;
    } finally {
      clearTimeout(t);
    }
  }
}
