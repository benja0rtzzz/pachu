import { useCallback, useEffect, useRef, useState } from 'react';
import type { CoachClientMessage, CoachEvent } from '@pachu/shared';
import { API_BASE_URL } from './client';

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

/**
 * Derive the WebSocket URL from the HTTP base URL.
 * http://host:port  →  ws://host:port/coach
 * https://host:port →  wss://host:port/coach
 */
function getCoachWsUrl(): string {
  return API_BASE_URL.replace(/^http/, 'ws') + '/coach';
}

// ---------------------------------------------------------------------------
// CoachWsClient — low-level transport
// ---------------------------------------------------------------------------

export interface CoachWsCallbacks {
  onHello?: (sessionId: string) => void;
  onHint?: (termId: string, tier: 1 | 2 | 3, text: string) => void;
  onPong?: () => void;
  onStatusChange?: (connected: boolean) => void;
}

/**
 * Thin WebSocket wrapper for the `/coach` endpoint.
 *
 * Reconnects automatically with exponential backoff (1 s → 2 s → … → 30 s max).
 * Call `destroy()` to tear it down (e.g. in a useEffect cleanup).
 *
 * Not React-specific. Use `useCoach()` for hooks-based usage.
 */
export class CoachWsClient {
  private ws: WebSocket | null = null;
  private destroyed = false;
  private reconnectDelayMs = 1_000;
  private readonly maxDelayMs: number;
  private readonly url: string;
  private readonly cbs: CoachWsCallbacks;

  constructor(cbs: CoachWsCallbacks = {}, url?: string, maxDelayMs = 30_000) {
    this.cbs = cbs;
    this.url = url ?? getCoachWsUrl();
    this.maxDelayMs = maxDelayMs;
    this.connect();
  }

  private connect(): void {
    if (this.destroyed) return;

    try {
      this.ws = new WebSocket(this.url);
    } catch {
      // URL is malformed or the platform blocked the call — schedule a retry anyway.
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectDelayMs = 1_000;
      this.cbs.onStatusChange?.(true);
    };

    this.ws.onmessage = (e: MessageEvent<string>) => {
      let event: CoachEvent;
      try {
        event = JSON.parse(e.data) as CoachEvent;
      } catch {
        return;
      }
      this.dispatch(event);
    };

    this.ws.onerror = () => {
      // onclose always fires after onerror; reconnect logic lives there.
    };

    this.ws.onclose = () => {
      this.cbs.onStatusChange?.(false);
      if (!this.destroyed) this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    const delay = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, this.maxDelayMs);
    setTimeout(() => this.connect(), delay);
  }

  private dispatch(event: CoachEvent): void {
    switch (event.type) {
      case 'hello':
        this.cbs.onHello?.(event.sessionId);
        break;
      case 'hint':
        this.cbs.onHint?.(event.termId, event.tier, event.text);
        break;
      case 'pong':
        this.cbs.onPong?.();
        break;
      case 'mistake':
        // Server never sends 'mistake'; guard is here for exhaustiveness.
        break;
    }
  }

  private send(msg: CoachClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  ping(): void {
    this.send({ type: 'ping' });
  }

  /**
   * Tell the coach what the learner just did wrong.
   * The observation is stored server-side and included in the next tier-1 LLM nudge.
   * Example: `reportMistake(termId, "typed MITOSIS — answer is MEIOSIS")`
   */
  reportMistake(termId: string, observation: string): void {
    this.send({ type: 'mistake', termId, observation });
  }

  /**
   * Request a hint for the given term at the specified tier.
   *   tier 1 — LLM-generated nudge in the notes' register (never reveals the answer)
   *   tier 2 — structural pattern: "9 letters, starts with A, ends with S"
   *   tier 3 — full definition reveal
   * The response arrives asynchronously via `onHint`.
   */
  requestHint(termId: string, tier: 1 | 2 | 3): void {
    this.send({ type: 'hint_request', termId, tier });
  }

  destroy(): void {
    this.destroyed = true;
    this.ws?.close();
    this.ws = null;
  }
}

// ---------------------------------------------------------------------------
// useCoach — React hook
// ---------------------------------------------------------------------------

export interface HintState {
  termId: string;
  tier: 1 | 2 | 3;
  text: string;
}

export interface CoachHookValue {
  /** True when the WebSocket is open. */
  connected: boolean;
  /** Session ID assigned by the server on connect. Null until first hello. */
  sessionId: string | null;
  /** Most recent hint received. Null until the first hint_request response. */
  lastHint: HintState | null;
  /** Clear the last hint (e.g. when moving to the next card). */
  clearHint: () => void;
  /** Request a hint at the given tier. Response arrives in `lastHint`. */
  requestHint: (termId: string, tier: 1 | 2 | 3) => void;
  /** Report a wrong attempt. Context is used by the tier-1 LLM nudge. */
  reportMistake: (termId: string, observation: string) => void;
}

/**
 * React hook that manages a single `CoachWsClient` for the lifetime of the
 * component (or until `enabled` goes false).
 *
 * Usage in a puzzle screen:
 *
 *   const { requestHint, reportMistake, lastHint, clearHint } = useCoach();
 *
 * Moving to the next card? Call `clearHint()`.
 * User typed a wrong answer? Call `reportMistake(termId, "typed X, correct is Y")`.
 * User tapped "Hint"? Call `requestHint(termId, 1)`. Show `lastHint?.text` when it arrives.
 */
export function useCoach(options: { enabled?: boolean; url?: string } = {}): CoachHookValue {
  const enabled = options.enabled !== false;
  const [connected, setConnected] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lastHint, setLastHint] = useState<HintState | null>(null);
  const clientRef = useRef<CoachWsClient | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const client = new CoachWsClient(
      {
        onStatusChange: setConnected,
        onHello: (sid) => setSessionId(sid),
        onHint: (termId, tier, text) => setLastHint({ termId, tier, text }),
      },
      options.url,
    );
    clientRef.current = client;

    return () => {
      client.destroy();
      clientRef.current = null;
    };
    // options.url is intentionally excluded — reconnect if it changes is not needed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const requestHint = useCallback((termId: string, tier: 1 | 2 | 3) => {
    clientRef.current?.requestHint(termId, tier);
  }, []);

  const reportMistake = useCallback((termId: string, observation: string) => {
    clientRef.current?.reportMistake(termId, observation);
  }, []);

  const clearHint = useCallback(() => setLastHint(null), []);

  return { connected, sessionId, lastHint, clearHint, requestHint, reportMistake };
}
