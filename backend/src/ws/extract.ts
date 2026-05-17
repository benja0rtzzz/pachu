import type { IncomingMessage } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ExtractClientMessage, ExtractEvent } from '@pachu/shared';
import type { LlmAdapter } from '../llm/adapter.js';
import { runSpaceExtraction } from '../llm/pipeline/extractSpace.js';

/** Soft target; mirrors EXTRACT_MAX_TERMS in the REST route. */
const EXTRACT_MAX_TERMS = 34;

export function attachExtractWs(opts: {
  server: import('node:http').Server;
  llm: LlmAdapter;
  path?: string;
}): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });
  const path = opts.path ?? '/extract';

  opts.server.on('upgrade', (req: IncomingMessage, socket, head) => {
    if (!req.url) return socket.destroy();
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== path) return;
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws: WebSocket) => {
    let started = false;
    send(ws, { type: 'hello' });

    ws.on('message', (raw) => {
      let msg: ExtractClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ExtractClientMessage;
      } catch {
        return;
      }

      if (msg.type === 'ping') {
        send(ws, { type: 'pong' });
        return;
      }

      if (msg.type === 'start') {
        if (started) return; // one extraction per socket
        started = true;
        void runExtraction(ws, opts.llm, msg.spaceId);
      }
    });
  });

  return wss;
}

async function runExtraction(
  ws: WebSocket,
  llm: LlmAdapter,
  spaceId: string,
): Promise<void> {
  try {
    const result = await runSpaceExtraction({
      spaceId,
      llm,
      maxTerms: EXTRACT_MAX_TERMS,
      onStage: (ev) =>
        send(ws, {
          type: 'stage',
          stage: ev.stage,
          current: ev.current,
          total: ev.total,
        }),
    });

    if (result.ok) {
      send(ws, {
        type: 'done',
        space: result.space,
        acceptedCount: result.acceptedCount,
        rejectedCount: result.rejectedCount,
      });
    } else {
      send(ws, {
        type: 'error',
        status: result.status,
        message: result.error,
      });
    }
  } catch (err) {
    send(ws, {
      type: 'error',
      status: 500,
      message: err instanceof Error ? err.message : 'extraction failed',
    });
  } finally {
    // Give the frame a tick to flush before closing.
    setTimeout(() => {
      if (ws.readyState === ws.OPEN) ws.close();
    }, 50);
  }
}

function send(ws: WebSocket, ev: ExtractEvent) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(ev));
}
