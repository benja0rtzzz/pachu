import { config } from '../config.js';
import type { ChatMessage, ChatOptions, LlmAdapter } from './adapter.js';

export class OllamaAdapter implements LlmAdapter {
  readonly provider = 'ollama';
  readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(opts?: { baseUrl?: string; model?: string; timeoutMs?: number }) {
    this.baseUrl = opts?.baseUrl ?? config.llm.baseUrl;
    this.model = opts?.model ?? config.llm.model;
    this.timeoutMs = opts?.timeoutMs ?? config.llm.timeoutMs;
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
          stream: false,
          options: {
            temperature: options.temperature ?? 1.0,
            top_p: 0.95,
            top_k: 64,
            num_predict: options.maxTokens ?? 256,
          },
          ...(options.jsonHint ? { format: 'json' } : {}),
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
      }
      const data = (await res.json()) as { message?: { content?: string } };
      return data.message?.content ?? '';
    } finally {
      clearTimeout(t);
    }
  }
}
