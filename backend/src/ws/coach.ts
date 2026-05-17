import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { CoachClientMessage, CoachEvent, Hint } from '@pachu/shared';
import type { LlmAdapter } from '../llm/adapter.js';
import { generateCoachHints, computeStructuralHint } from '../llm/prompts/coach.js';
import { getTermById } from '../store/repos/terms.js';

export function attachCoachWs(opts: {
  server: import('node:http').Server;
  llm: LlmAdapter;
  path?: string;
}): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });
  const path = opts.path ?? '/coach';

  opts.server.on('upgrade', (req: IncomingMessage, socket, head) => {
    if (!req.url) return socket.destroy();
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== path) return;
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws: WebSocket) => {
    const sessionId = randomUUID();
    // Track the most recent mistake observation per term so tier-1 nudges have context.
    const observations = new Map<string, string>();

    send(ws, { type: 'hello', sessionId });

    ws.on('message', (raw) => {
      let msg: CoachClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as CoachClientMessage;
      } catch {
        return;
      }

      if (msg.type === 'ping') {
        send(ws, { type: 'pong' });
        return;
      }

      if (msg.type === 'mistake') {
        observations.set(msg.termId, msg.observation);
        return;
      }

      if (msg.type === 'hint_request') {
        void handleHintRequest(ws, opts.llm, msg.termId, msg.tier, observations.get(msg.termId));
      }
    });
  });

  return wss;
}

async function handleHintRequest(
  ws: WebSocket,
  llm: LlmAdapter,
  termId: string,
  tier: 1 | 2 | 3,
  observation: string | undefined,
): Promise<void> {
  const term = getTermById(termId);
  if (!term) return;

  // Two-tier scheme: tier 1 is the deterministic structural pattern (never
  // touches the LLM, can't leak the term); tier 2+ is the LLM contextual
  // nudge, falling back to the structural hint if the LLM is unreachable.
  const effectiveTier: 1 | 2 = tier <= 1 ? 1 : 2;

  let text: string;
  let kind: Hint['kind'];

  if (effectiveTier === 1) {
    text = computeStructuralHint(term.term);
    kind = 'pattern';
  } else {
    try {
      const hints = await generateCoachHints({
        llm,
        term: term.term,
        definition: term.definition,
        styleAnchor: term.styleAnchor,
        observation,
      });
      // The LLM nudge can come back empty (model returned only the term, which
      // the leak-guard strips, or whitespace). Never ship an empty hint card:
      // fall back to the verified definition, then the structural pattern.
      const nudge = hints.tier2.trim();
      text = nudge || term.definition.trim() || computeStructuralHint(term.term);
      kind = nudge ? 'nudge' : 'definition';
    } catch {
      // LLM unavailable — fall back to the deterministic structural hint.
      text = computeStructuralHint(term.term);
      kind = 'pattern';
    }
  }

  send(ws, { type: 'hint', hint: { termId, tier: effectiveTier, kind, text } });
}

function send(ws: WebSocket, ev: CoachEvent) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(ev));
}
