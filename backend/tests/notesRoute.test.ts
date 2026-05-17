/**
 * HTTP-level tests for /notes. We boot a real Express app on an ephemeral port and hit
 * it with bun's native `fetch`. No supertest dependency, no store mocks — the store is
 * part of what we're verifying.
 */
import { mkdirSync, rmSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

const testDataDir = path.join(tmpdir(), `pachu-notes-route-${randomBytes(8).toString('hex')}`);
process.env.PACHU_DATA_DIR = testDataDir;
mkdirSync(testDataDir, { recursive: true });

const store = await import('../src/store/index.js');
const { notesRouter } = await import('../src/routes/notes.js');

let server: http.Server;
let baseUrl = '';

beforeAll(async () => {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/notes', notesRouter());

  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('failed to bind ephemeral port');
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  try {
    store.closeDatabase();
  } catch {
    // Best-effort, same as store.test.ts.
  }
  rmSync(testDataDir, { recursive: true, force: true });
});

beforeEach(() => {
  const db = store.getDatabase();
  db.run('DELETE FROM review_events');
  db.run('DELETE FROM sessions');
  db.run('DELETE FROM terms');
  db.run('DELETE FROM notes_files');
});

describe('POST /notes/ingest', () => {
  it('201s, returns IngestResponse with a zero-state Space', async () => {
    const res = await fetch(`${baseUrl}/notes/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Lecture 1', content: 'hello 世界' }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { space?: Record<string, unknown> };
    expect(body.space).toBeDefined();
    const space = body.space as Record<string, unknown>;
    expect(space.id).toBeTypeOf('string');
    expect(space.title).toBe('Lecture 1');
    expect(space.byteLength).toBe(Buffer.byteLength('hello 世界', 'utf8'));
    expect(space.summary).toMatchObject({
      termCount: 0,
      dueCount: 0,
      newCount: 0,
      stableCount: 0,
      dueToday: 0,
      playedTodayKinds: [],
      streakDays: 0,
    });
  });

  it('400 when title is missing or empty', async () => {
    const res = await fetch(`${baseUrl}/notes/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '   ', content: 'body' }),
    });
    expect(res.status).toBe(400);
  });

  it('400 when content is missing', async () => {
    const res = await fetch(`${baseUrl}/notes/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'x' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /notes/:id', () => {
  it('round-trips raw text', async () => {
    const ingestRes = await fetch(`${baseUrl}/notes/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 't', content: 'the body' }),
    });
    const { space } = (await ingestRes.json()) as { space: { id: string } };
    const res = await fetch(`${baseUrl}/notes/${space.id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rawText: string };
    expect(body.rawText).toBe('the body');
  });

  it('404s for unknown id', async () => {
    const res = await fetch(`${baseUrl}/notes/ffffffff-ffff-ffff-ffff-ffffffffffff`);
    expect(res.status).toBe(404);
  });
});
