import type {
  ExtractClientMessage,
  ExtractEvent,
  ExtractStage,
  Space,
} from '@pachu/shared';
import { API_BASE_URL, ApiError } from './client';

function deriveWsUrl(base: string, path = '/extract'): string {
  if (base.startsWith('https://')) return `wss://${base.slice(8)}${path}`;
  if (base.startsWith('http://')) return `ws://${base.slice(7)}${path}`;
  return `${base}${path}`;
}

export interface ExtractStageInfo {
  stage: ExtractStage;
  current?: number;
  total?: number;
}

export interface ExtractDone {
  space: Space;
  acceptedCount: number;
  rejectedCount: number;
}

/**
 * Run term extraction over the `/extract` WebSocket, streaming real stage
 * progress to `onStage`. Resolves with the refreshed Space on `done`; rejects
 * with an `ApiError` (carrying the HTTP-equivalent status) on `error` so
 * callers can branch exactly like the REST path (409 → open anyway, etc).
 */
export function runExtraction(
  spaceId: string,
  onStage: (info: ExtractStageInfo) => void,
): Promise<ExtractDone> {
  return new Promise<ExtractDone>((resolve, reject) => {
    let ws: WebSocket;
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
      try {
        ws.close();
      } catch {
        // ignore
      }
    };

    try {
      ws = new WebSocket(deriveWsUrl(API_BASE_URL));
    } catch (err) {
      reject(new ApiError(0, (err as Error).message, null));
      return;
    }

    ws.onopen = () => {
      ws.send(
        JSON.stringify({ type: 'start', spaceId } satisfies ExtractClientMessage),
      );
    };

    ws.onmessage = (raw) => {
      let ev: ExtractEvent;
      try {
        ev = JSON.parse(String(raw.data)) as ExtractEvent;
      } catch {
        return;
      }
      if (ev.type === 'stage') {
        onStage({ stage: ev.stage, current: ev.current, total: ev.total });
      } else if (ev.type === 'done') {
        finish(() =>
          resolve({
            space: ev.space,
            acceptedCount: ev.acceptedCount,
            rejectedCount: ev.rejectedCount,
          }),
        );
      } else if (ev.type === 'error') {
        finish(() => reject(new ApiError(ev.status, ev.message, null)));
      }
    };

    ws.onerror = () => {
      finish(() =>
        reject(new ApiError(0, 'Lost connection to the extractor', null)),
      );
    };

    ws.onclose = () => {
      finish(() =>
        reject(new ApiError(0, 'Extractor closed before finishing', null)),
      );
    };
  });
}
