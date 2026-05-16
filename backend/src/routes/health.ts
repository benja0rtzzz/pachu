import { Router } from 'express';
import type { HealthResponse } from '@pachu/shared';
import { VERSION } from '../config.js';
import type { LlmAdapter } from '../llm/adapter.js';

export function healthRouter(deps: { llm: LlmAdapter; startedAt: number }): Router {
  const r = Router();
  r.get('/', async (_req, res) => {
    const reachable = await deps.llm.ping();
    const body: HealthResponse = {
      ok: true,
      service: 'pachu-backend',
      version: VERSION,
      uptimeMs: Date.now() - deps.startedAt,
      llm: { reachable, provider: 'ollama', model: deps.llm.model },
    };
    res.json(body);
  });
  return r;
}
