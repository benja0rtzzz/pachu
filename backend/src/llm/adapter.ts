/**
 * Minimal LLM adapter interface. The backend never imports a concrete provider directly —
 * only this interface — so swapping Ollama for llama.cpp / MLX is a one-line change.
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  /** Approximate max tokens for the response. */
  maxTokens?: number;
  /** Sampling temperature. Defaults to 1.0 (gemma4 spec). */
  temperature?: number;
}

export interface LlmAdapter {
  readonly provider: string;
  readonly model: string;
  /** True if the underlying service is reachable right now. */
  ping(): Promise<boolean>;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>;
}
