import type { HealthResponse } from '@pachu/shared';

const ENV_BASE = process.env.EXPO_PUBLIC_API_BASE_URL;

/**
 * Resolve the backend base URL.
 * - On a real device, you must set EXPO_PUBLIC_API_BASE_URL to the dev laptop's LAN IP.
 * - On the iOS simulator or web, localhost works.
 * - Android emulator's localhost is 10.0.2.2; users should set EXPO_PUBLIC_API_BASE_URL accordingly.
 */
export const API_BASE_URL = ENV_BASE && ENV_BASE.length > 0
  ? ENV_BASE
  : 'http://localhost:4000';

/**
 * Error thrown by the typed fetch helpers below. Carries `status` and the
 * parsed JSON body (when present) so callers can branch on backend error
 * codes — e.g. 422 "no terms available" vs 404 "space not found" — without
 * re-parsing the response.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

interface FetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * Centralized JSON fetch. All `api/*` modules go through this so error
 * shapes, header set, and base-URL resolution stay consistent.
 *
 * - Stringifies `body` as JSON, sets `content-type: application/json`.
 * - Throws `ApiError` on non-2xx with the parsed body (when JSON) attached.
 * - Returns `undefined` cast to T for 204 responses (`DELETE /spaces/:id`).
 */
export async function apiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const init: RequestInit = {
    method: opts.method ?? 'GET',
    signal: opts.signal,
    headers:
      opts.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  };

  const res = await fetch(url, init);

  if (res.status === 204) return undefined as unknown as T;

  const text = await res.text();
  const parsed: unknown = text.length > 0 ? safeJson(text) : undefined;

  if (!res.ok) {
    const message =
      (parsed && typeof parsed === 'object' && 'error' in parsed && typeof (parsed as { error: unknown }).error === 'string'
        ? (parsed as { error: string }).error
        : null) ?? `${init.method} ${path} failed: ${res.status}`;
    throw new ApiError(res.status, message, parsed);
  }

  return parsed as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function getHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>('/health');
}
