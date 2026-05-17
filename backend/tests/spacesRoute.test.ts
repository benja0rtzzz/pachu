/**
 * HTTP-level tests for /spaces. Ephemeral-port Express + bun's native fetch.
 */
import { mkdirSync, rmSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

const testDataDir = path.join(tmpdir(), `pachu-spaces-route-${randomBytes(8).toString('hex')}`);
process.env.PACHU_DATA_DIR = testDataDir;
mkdirSync(testDataDir, { recursive: true });

const store = await import('../src/store/index.js');
const { notesRouter } = await import('../src/routes/notes.js');
const { spacesRouter } = await import('../src/routes/spaces.js');

let server: http.Server;
let baseUrl = '';

beforeAll(async () => {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/notes', notesRouter());
  app.use('/spaces', spacesRouter());

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
    // Best-effort.
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

async function ingest(title: string, content = 'body'): Promise<{ id: string; title: string }> {
  const res = await fetch(`${baseUrl}/notes/ingest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title, content }),
  });
  const body = (await res.json()) as { space: { id: string; title: string } };
  return body.space;
}

describe('GET /spaces', () => {
  it('returns { spaces: [] } when empty', async () => {
    const res = await fetch(`${baseUrl}/spaces`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { spaces: unknown[] };
    expect(body.spaces).toEqual([]);
  });

  it('returns each ingested space with a populated summary shape', async () => {
    await ingest('A');
    await ingest('B');
    const res = await fetch(`${baseUrl}/spaces`);
    const body = (await res.json()) as {
      spaces: Array<{ title: string; summary: Record<string, unknown> }>;
    };
    expect(body.spaces.map((s) => s.title).sort()).toEqual(['A', 'B']);
    for (const s of body.spaces) {
      expect(s.summary).toHaveProperty('termCount');
      expect(s.summary).toHaveProperty('dueCount');
      expect(s.summary).toHaveProperty('streakDays');
      expect(s.summary).toHaveProperty('playedTodayKinds');
    }
  });
});

describe('GET /spaces/:id', () => {
  it('returns the matching Space', async () => {
    const created = await ingest('Solo');
    const res = await fetch(`${baseUrl}/spaces/${created.id}`);
    expect(res.status).toBe(200);
    const space = (await res.json()) as { id: string; title: string };
    expect(space.id).toBe(created.id);
    expect(space.title).toBe('Solo');
  });

  it('404s for unknown id', async () => {
    const res = await fetch(`${baseUrl}/spaces/ffffffff-ffff-ffff-ffff-ffffffffffff`);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /spaces/:id', () => {
  it('renames a space', async () => {
    const created = await ingest('Old Title');
    const res = await fetch(`${baseUrl}/spaces/${created.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'New Title' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { title: string };
    expect(body.title).toBe('New Title');

    const getRes = await fetch(`${baseUrl}/spaces/${created.id}`);
    const fetched = (await getRes.json()) as { title: string };
    expect(fetched.title).toBe('New Title');
  });

  it('400 when title is missing/empty', async () => {
    const created = await ingest('x');
    const res = await fetch(`${baseUrl}/spaces/${created.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '   ' }),
    });
    expect(res.status).toBe(400);
  });

  it('404 when the space does not exist', async () => {
    const res = await fetch(`${baseUrl}/spaces/ffffffff-ffff-ffff-ffff-ffffffffffff`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'whatever' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /spaces/:id', () => {
  it('204s, then the space is gone (and terms cascade)', async () => {
    const created = await ingest('To Delete');
    // Seed a term so we can prove cascade deletion runs.
    store.insertTerms(created.id, [
      { term: 't', definition: 'd', sourceSpan: 't', styleAnchor: 't' },
    ]);

    const res = await fetch(`${baseUrl}/spaces/${created.id}`, { method: 'DELETE' });
    expect(res.status).toBe(204);

    const followup = await fetch(`${baseUrl}/spaces/${created.id}`);
    expect(followup.status).toBe(404);

    const db = store.getDatabase();
    const remaining = db
      .query('SELECT COUNT(*) AS n FROM terms WHERE notes_file_id = ?')
      .get(created.id) as { n: number };
    expect(remaining.n).toBe(0);
  });

  it('404 for unknown id', async () => {
    const res = await fetch(`${baseUrl}/spaces/ffffffff-ffff-ffff-ffff-ffffffffffff`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(404);
  });
});
