/**
 * HTTP-level tests for POST /spaces/:id/extract. Stubs the LLM adapter so the route can
 * be exercised without Ollama running — Person B's prompts already have their own live
 * smoke tests (`extractTerms.live.test.ts`) gated behind LLM_LIVE=1.
 *
 * What we're proving here is route behavior, not extractor quality:
 *   - happy path: persists accepted candidates, returns refreshed Space + counts
 *   - 404 when the space doesn't exist
 *   - 409 when terms already exist (no silent re-extraction)
 *   - 422 when the LLM produces zero accepted candidates (no force-fitting)
 *   - 502 when the LLM throws (Ollama unreachable)
 */
import { mkdirSync, rmSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

const testDataDir = path.join(tmpdir(), `pachu-extract-route-${randomBytes(8).toString('hex')}`);
process.env.PACHU_DATA_DIR = testDataDir;
mkdirSync(testDataDir, { recursive: true });

const store = await import('../src/store/index.js');
const { notesRouter } = await import('../src/routes/notes.js');
const { spacesRouter } = await import('../src/routes/spaces.js');
type LlmAdapter = import('../src/llm/adapter.js').LlmAdapter;

const NOTES_BODY =
  'Hiragana is the rounded one, used for grammar bits and Japanese words. ' +
  'Konnichiwa is the daytime hello. Arigato means thank you.';

function makeStubLlm(chatImpl: () => Promise<string>): LlmAdapter {
  return {
    provider: 'stub',
    model: 'stub',
    async ping() { return true; },
    chat: chatImpl,
  };
}

let server: http.Server;
let baseUrl = '';
let currentLlm: LlmAdapter;

beforeAll(async () => {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/notes', notesRouter());
  // The router holds a reference to its llm at construction time, so we indirect through
  // `currentLlm` to let each test swap in a fresh stub before hitting the route.
  app.use('/spaces', spacesRouter({
    llm: {
      provider: 'stub',
      model: 'stub',
      ping: () => Promise.resolve(true),
      chat: (msgs, opts) => currentLlm.chat(msgs, opts),
    },
  }));

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

async function ingest(title: string, content = NOTES_BODY): Promise<{ id: string }> {
  const res = await fetch(`${baseUrl}/notes/ingest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title, content }),
  });
  const body = (await res.json()) as { space: { id: string } };
  return body.space;
}

describe('POST /spaces/:id/extract', () => {
  it('persists accepted candidates and returns acceptedCount + refreshed Space', async () => {
    const { id } = await ingest('Japanese 101');
    currentLlm = makeStubLlm(async () =>
      JSON.stringify({
        terms: [
          {
            term: 'Hiragana',
            definition: 'The rounded Japanese script.',
            source_span: 'Hiragana is the rounded one, used for grammar bits and Japanese words.',
            style_anchor: 'Hiragana is the rounded one, used for grammar bits and Japanese words.',
          },
          {
            term: 'Konnichiwa',
            definition: 'A daytime greeting in Japanese.',
            source_span: 'Konnichiwa is the daytime hello.',
            style_anchor: 'Konnichiwa is the daytime hello.',
          },
        ],
      }),
    );

    const res = await fetch(`${baseUrl}/spaces/${id}/extract`, { method: 'POST' });
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      space: { id: string; summary: { termCount: number } };
      acceptedCount: number;
      rejectedCount: number;
    };
    expect(body.acceptedCount).toBe(2);
    expect(body.rejectedCount).toBe(0);
    expect(body.space.id).toBe(id);
    expect(body.space.summary.termCount).toBe(2);

    // Persisted in the store too.
    expect(store.countTermsByNotesFile(id)).toBe(2);
  });

  it('counts hallucinated candidates as rejected without persisting them', async () => {
    const { id } = await ingest('Japanese 101');
    currentLlm = makeStubLlm(async () =>
      JSON.stringify({
        terms: [
          {
            term: 'Hiragana',
            definition: 'The rounded Japanese script.',
            source_span: 'Hiragana is the rounded one, used for grammar bits and Japanese words.',
            style_anchor: 'Hiragana is the rounded one, used for grammar bits and Japanese words.',
          },
          {
            // styleAnchor is paraphrased — verifier will drop this one.
            term: 'Konnichiwa',
            definition: 'A daytime greeting.',
            source_span: 'Konnichiwa is the daytime hello.',
            style_anchor: 'Konnichiwa is what you say in the afternoon.',
          },
        ],
      }),
    );

    const res = await fetch(`${baseUrl}/spaces/${id}/extract`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { acceptedCount: number; rejectedCount: number };
    expect(body.acceptedCount).toBe(1);
    expect(body.rejectedCount).toBe(1);
    expect(store.countTermsByNotesFile(id)).toBe(1);
  });

  it('404s when the space does not exist', async () => {
    currentLlm = makeStubLlm(async () => '{"terms":[]}');
    const res = await fetch(
      `${baseUrl}/spaces/ffffffff-ffff-ffff-ffff-ffffffffffff/extract`,
      { method: 'POST' },
    );
    expect(res.status).toBe(404);
  });

  it('409s when terms have already been extracted (no silent re-extraction)', async () => {
    const { id } = await ingest('Japanese 101');
    store.insertTerms(id, [
      { term: 't', definition: 'd', sourceSpan: 't', styleAnchor: 't' },
    ]);

    currentLlm = makeStubLlm(async () => '{"terms":[]}');
    const res = await fetch(`${baseUrl}/spaces/${id}/extract`, { method: 'POST' });
    expect(res.status).toBe(409);
    // Should not have added anything on top of the seed term.
    expect(store.countTermsByNotesFile(id)).toBe(1);
  });

  it('422s when the LLM produces zero accepted candidates — does not force-fit', async () => {
    const { id } = await ingest('Threadbare', 'Hello world.');
    currentLlm = makeStubLlm(async () =>
      // Every candidate has a sourceSpan that isn't in the notes — all should be rejected.
      JSON.stringify({
        terms: [
          {
            term: 'Photosynthesis',
            definition: 'Plant magic.',
            source_span: 'Photosynthesis converts sunlight to sugar.',
            style_anchor: 'Photosynthesis converts sunlight to sugar.',
          },
        ],
      }),
    );

    const res = await fetch(`${baseUrl}/spaces/${id}/extract`, { method: 'POST' });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; rejectedCount: number };
    expect(body.error).toContain('not enough information');
    expect(body.rejectedCount).toBeGreaterThan(0);
    expect(store.countTermsByNotesFile(id)).toBe(0);
  });

  it('502s when the LLM throws (Ollama unreachable)', async () => {
    const { id } = await ingest('Japanese 101');
    currentLlm = makeStubLlm(async () => {
      throw new Error('ECONNREFUSED');
    });

    const res = await fetch(`${baseUrl}/spaces/${id}/extract`, { method: 'POST' });
    expect(res.status).toBe(502);
    expect(store.countTermsByNotesFile(id)).toBe(0);
  });
});
