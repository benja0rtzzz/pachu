import http from 'node:http';
import express from 'express';
import { config } from './config.js';
import { OllamaAdapter } from './llm/ollama.js';
import { healthRouter } from './routes/health.js';
import { openDatabase } from './store/db.js';
import { attachCoachWs } from './ws/coach.js';

async function main() {
  openDatabase();
  const startedAt = Date.now();
  const llm = new OllamaAdapter();

  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    next();
  });
  app.options('*', (_req, res) => res.sendStatus(204));

  app.use('/health', healthRouter({ llm, startedAt }));

  app.get('/', (_req, res) => {
    res.json({ service: 'pachu-backend', try: ['/health', '/coach (WS)'] });
  });

  const server = http.createServer(app);
  attachCoachWs({ server, path: '/coach', llm });

  server.listen(config.port, config.host, () => {
    const reachable = `http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`;
    console.log(`[pachu-backend] listening on ${reachable}`);
    console.log(`[pachu-backend] LLM = ${config.llm.baseUrl} (${config.llm.model})`);
  });
}

main().catch((err) => {
  console.error('[pachu-backend] fatal:', err);
  process.exit(1);
});
