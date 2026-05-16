import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { CoachClientMessage, CoachEvent } from '@pachu/shared';

/**
 * Minimal /coach WS endpoint. Accepts ping/mistake/hint_request messages and echoes structured
 * events. Real coaching logic (LLM hint generation, mistake reasoning) will plug in here later.
 */
export function attachCoachWs(opts: {
  server: import('node:http').Server;
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
      } else if (msg.type === 'hint_request') {
        send(ws, {
          type: 'hint',
          termId: msg.termId,
          tier: msg.tier,
          text: '(coach not yet wired to LLM — this is a placeholder hint)',
        });
      }
    });
  });

  return wss;
}

function send(ws: WebSocket, ev: CoachEvent) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(ev));
}
