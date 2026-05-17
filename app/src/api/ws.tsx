import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { CoachClientMessage, CoachEvent } from '@pachu/shared';
import { API_BASE_URL } from './client';

// `useCoach()` wraps a single shared WebSocket connection to `/coach`. The
// provider opens the socket once at app boot, auto-reconnects with
// exponential backoff, and exposes the latest event log + a `send` helper.
//
// Components consume the hook via context so we never double-open the
// socket — Crossword + Cloze both mount a `CoachOverlay` that subscribes
// here, and any future screen can do the same without thinking about
// connection state.

export type CoachStatus = 'connecting' | 'open' | 'closed' | 'idle';

interface CoachContextValue {
  status: CoachStatus;
  events: CoachEvent[];
  send: (msg: CoachClientMessage) => void;
  /** Clear the cached event log (e.g. between puzzle sessions). */
  clear: () => void;
}

const CoachContext = createContext<CoachContextValue | null>(null);

const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const PING_INTERVAL_MS = 25_000;
const MAX_EVENTS = 50;

function deriveWsUrl(base: string, path = '/coach'): string {
  if (base.startsWith('https://')) return `wss://${base.slice(8)}${path}`;
  if (base.startsWith('http://')) return `ws://${base.slice(7)}${path}`;
  return `${base}${path}`;
}

export function CoachProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<CoachStatus>('idle');
  const [events, setEvents] = useState<CoachEvent[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelayRef = useRef(RECONNECT_MIN_MS);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const closedByUserRef = useRef(false);

  const url = useMemo(() => deriveWsUrl(API_BASE_URL), []);

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // ignore close errors
      }
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current) return;
    setStatus('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      if (__DEV__) console.warn('[coach] WebSocket construction failed:', err);
      setStatus('closed');
      scheduleReconnect();
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectDelayRef.current = RECONNECT_MIN_MS;
      setStatus('open');
      // Heartbeat — keeps the connection alive across mobile network
      // suspensions and lets us notice silent drops via close handler.
      if (pingTimerRef.current) clearInterval(pingTimerRef.current);
      pingTimerRef.current = setInterval(() => {
        if (ws.readyState === ws.OPEN) {
          try {
            ws.send(JSON.stringify({ type: 'ping' } satisfies CoachClientMessage));
          } catch {
            // socket teardown will trigger onclose below
          }
        }
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = (raw) => {
      try {
        const ev = JSON.parse(String(raw.data)) as CoachEvent;
        setEvents((prev) => {
          const next = [...prev, ev];
          return next.length > MAX_EVENTS ? next.slice(next.length - MAX_EVENTS) : next;
        });
      } catch {
        if (__DEV__) console.warn('[coach] dropped unparseable frame');
      }
    };

    ws.onerror = () => {
      // Surface as a closed state; the actual reconnect happens in onclose.
      setStatus('closed');
    };

    ws.onclose = () => {
      wsRef.current = null;
      if (pingTimerRef.current) {
        clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }
      setStatus('closed');
      if (!closedByUserRef.current) scheduleReconnect();
    };
  }, [url]);

  const scheduleReconnect = useCallback(() => {
    if (closedByUserRef.current) return;
    if (reconnectTimerRef.current) return;
    const delay = reconnectDelayRef.current;
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      reconnectDelayRef.current = Math.min(
        RECONNECT_MAX_MS,
        Math.round(reconnectDelayRef.current * 2),
      );
      connect();
    }, delay);
  }, [connect]);

  useEffect(() => {
    closedByUserRef.current = false;
    connect();
    return () => {
      closedByUserRef.current = true;
      cleanup();
    };
  }, [connect, cleanup]);

  const send = useCallback((msg: CoachClientMessage) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== ws.OPEN) {
      if (__DEV__) console.warn('[coach] send while socket not open — dropping');
      return;
    }
    try {
      ws.send(JSON.stringify(msg));
    } catch (err) {
      if (__DEV__) console.warn('[coach] send failed:', err);
    }
  }, []);

  const clear = useCallback(() => setEvents([]), []);

  const value = useMemo<CoachContextValue>(
    () => ({ status, events, send, clear }),
    [status, events, send, clear],
  );

  return <CoachContext.Provider value={value}>{children}</CoachContext.Provider>;
}

export function useCoach(): CoachContextValue {
  const ctx = useContext(CoachContext);
  if (!ctx) {
    // Allow components to call useCoach even if the provider isn't mounted
    // (e.g. in isolated unit tests). Returns a no-op shape so callers can
    // still safely render a hint button that just does nothing.
    return {
      status: 'idle',
      events: [],
      send: () => undefined,
      clear: () => undefined,
    };
  }
  return ctx;
}
