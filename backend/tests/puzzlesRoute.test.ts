/**
 * HTTP-level tests for /puzzles. We boot a real Express app on an ephemeral port and
 * hit it with bun's native `fetch` — same pattern as notesRoute.test.ts. The LLM is
 * replaced with a fake adapter so the engine paths don't try to reach Ollama.
 *
 * We deliberately do not exercise the crossword engine here — it depends on the
 * `crossword-layout-generator` npm package, which has its own coverage in
 * `crosswordEngine.test.ts`. The route-level tests focus on the orchestration
 * surface: validation, session lifecycle, and the FSRS-roundtrip on /finish.
 */
import { mkdirSync, rmSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import type {
  ClozePuzzle,
  FlashcardsPuzzle,
  Review,
  SessionFinishResponse,
} from '@pachu/shared';
import type { LlmAdapter } from '../src/llm/adapter.js';

const testDataDir = path.join(
  tmpdir(),
  `pachu-puzzles-route-${randomBytes(8).toString('hex')}`,
);
process.env.PACHU_DATA_DIR = testDataDir;
mkdirSync(testDataDir, { recursive: true });

const store = await import('../src/store/index.js');
const { puzzlesRouter } = await import('../src/routes/puzzles.js');

let server: http.Server;
let baseUrl = '';

const fakeLlm: LlmAdapter = {
  provider: 'fake',
  model: 'fake',
  async ping() {
    return true;
  },
  async chat() {
    return 'Fake clue';
  },
};

beforeAll(async () => {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/puzzles', puzzlesRouter({ llm: fakeLlm }));

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
  try {
    rmSync(testDataDir, { recursive: true, force: true });
  } catch {
    // Windows EBUSY race on the WAL file — OS will clean the tempdir later.
  }
});

beforeEach(() => {
  const db = store.getDatabase();
  db.run('DELETE FROM review_events');
  db.run('DELETE FROM sessions');
  db.run('DELETE FROM terms');
  db.run('DELETE FROM notes_files');
});

function seedSpace(termSpecs: string[]): { spaceId: string; termIds: string[] } {
  const note = store.createNotesFile({
    title: 't',
    rawText: termSpecs.join('. ') + '.',
  });
  const inserted = store.insertTerms(
    note.id,
    termSpecs.map((name) => ({
      term: name,
      definition: `definition of ${name}`,
      sourceSpan: name,
      styleAnchor: `${name} appears in this sentence as a noun.`,
    })),
  );
  return { spaceId: note.id, termIds: inserted.map((t) => t.id) };
}

describe('POST /puzzles/generate', () => {
  it('400 when kind missing or invalid', async () => {
    const res = await fetch(`${baseUrl}/puzzles/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'jumble', spaceId: 'x' }),
    });
    expect(res.status).toBe(400);
  });

  it('400 when spaceId missing', async () => {
    const res = await fetch(`${baseUrl}/puzzles/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'flashcards' }),
    });
    expect(res.status).toBe(400);
  });

  it('404 when space does not exist', async () => {
    const res = await fetch(`${baseUrl}/puzzles/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'flashcards',
        spaceId: '00000000-0000-0000-0000-000000000000',
      }),
    });
    expect(res.status).toBe(404);
  });

  it('422 when the space has no terms yet', async () => {
    const note = store.createNotesFile({ title: 'empty', rawText: 'body' });
    const res = await fetch(`${baseUrl}/puzzles/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'flashcards', spaceId: note.id }),
    });
    expect(res.status).toBe(422);
  });

  it('returns a flashcards puzzle with spaceId + items', async () => {
    const { spaceId } = seedSpace(['alpha', 'beta', 'gamma']);
    const res = await fetch(`${baseUrl}/puzzles/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'flashcards', spaceId, targetCount: 2 }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as FlashcardsPuzzle;
    expect(body.kind).toBe('flashcards');
    expect(body.spaceId).toBe(spaceId);
    expect(body.items).toHaveLength(2);
    expect(body.id).toBeTypeOf('string');
  });

  it('returns a cloze puzzle with anchored items for unreviewed terms', async () => {
    const { spaceId } = seedSpace(['alpha']);
    const res = await fetch(`${baseUrl}/puzzles/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'cloze', spaceId }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ClozePuzzle;
    expect(body.kind).toBe('cloze');
    expect(body.items).toHaveLength(1);
    const [item] = body.items;
    if (!item) throw new Error('no item');
    expect(item.mode).toBe('anchored');
    expect(item.sentence).toContain('[MASK]');
  });
});

describe('POST /puzzles/:id/finish', () => {
  it('404 when the session id is unknown', async () => {
    const res = await fetch(
      `${baseUrl}/puzzles/00000000-0000-0000-0000-000000000000/finish`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          puzzleId: '00000000-0000-0000-0000-000000000000',
          reviews: [],
          sessionStartedAt: new Date().toISOString(),
        }),
      },
    );
    expect(res.status).toBe(404);
  });

  it('400 when puzzleId in body does not match :id', async () => {
    const { spaceId } = seedSpace(['x']);
    const gen = await fetch(`${baseUrl}/puzzles/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'flashcards', spaceId }),
    });
    const puzzle = (await gen.json()) as { id: string };
    const res = await fetch(`${baseUrl}/puzzles/${puzzle.id}/finish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        puzzleId: '00000000-0000-0000-0000-000000000000',
        reviews: [],
        sessionStartedAt: new Date().toISOString(),
      }),
    });
    expect(res.status).toBe(400);
  });

  it('accepts valid reviews and refreshes the space summary', async () => {
    const { spaceId, termIds } = seedSpace(['alpha', 'beta']);
    const gen = await fetch(`${baseUrl}/puzzles/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'flashcards', spaceId }),
    });
    const puzzle = (await gen.json()) as { id: string };

    const reviews: Review[] = termIds.map((termId) => ({
      termId,
      rating: 3,
      ms: 4_000,
      hintsUsed: 0,
    }));
    const res = await fetch(`${baseUrl}/puzzles/${puzzle.id}/finish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        puzzleId: puzzle.id,
        reviews,
        sessionStartedAt: new Date().toISOString(),
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as SessionFinishResponse;
    expect(body.acceptedCount).toBe(2);
    expect(body.nextDueAt).toBeTypeOf('string');
    expect(body.space?.id).toBe(spaceId);
    // After Good reviews, no terms remain "new" — newCount should drop to 0.
    expect(body.space?.summary.newCount).toBe(0);
  });

  it('409 on double-finish for the same session', async () => {
    const { spaceId } = seedSpace(['x']);
    const gen = await fetch(`${baseUrl}/puzzles/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'flashcards', spaceId }),
    });
    const puzzle = (await gen.json()) as { id: string };
    const finishBody = JSON.stringify({
      puzzleId: puzzle.id,
      reviews: [],
      sessionStartedAt: new Date().toISOString(),
    });
    const first = await fetch(`${baseUrl}/puzzles/${puzzle.id}/finish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: finishBody,
    });
    expect(first.status).toBe(200);
    const second = await fetch(`${baseUrl}/puzzles/${puzzle.id}/finish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: finishBody,
    });
    expect(second.status).toBe(409);
  });

  it('silently rejects reviews for termIds outside this space', async () => {
    const a = seedSpace(['inSpace']);
    const b = seedSpace(['otherSpace']);
    const gen = await fetch(`${baseUrl}/puzzles/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'flashcards', spaceId: a.spaceId }),
    });
    const puzzle = (await gen.json()) as { id: string };
    const otherTerm = b.termIds[0];
    if (!otherTerm) throw new Error('no other term');
    const res = await fetch(`${baseUrl}/puzzles/${puzzle.id}/finish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        puzzleId: puzzle.id,
        reviews: [{ termId: otherTerm, rating: 3, ms: 1000, hintsUsed: 0 }],
        sessionStartedAt: new Date().toISOString(),
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as SessionFinishResponse;
    expect(body.acceptedCount).toBe(0);
  });
});
