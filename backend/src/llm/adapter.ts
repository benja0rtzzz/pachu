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
  /** Sampling temperature. */
  temperature?: number;
  /** If provided, the adapter will instruct the model to respond with JSON of this rough shape. */
  jsonHint?: string;
}

export interface LlmAdapter {
  readonly provider: string;
  readonly model: string;
  /** True if the underlying service is reachable right now. */
  ping(): Promise<boolean>;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>;
}
