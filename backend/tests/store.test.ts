/**
 * Store integration tests. `PACHU_DATA_DIR` must be set before any import of `config` / `store`.
 */
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'bun:test';
import { randomBytes } from 'node:crypto';

const testDataDir = path.join(tmpdir(), `pachu-store-bun-test-${randomBytes(8).toString('hex')}`);
process.env.PACHU_DATA_DIR = testDataDir;
mkdirSync(testDataDir, { recursive: true });

const store = await import('../src/store/index.js');

function clearAllTables(): void {
  const db = store.getDatabase();
  db.run('DELETE FROM review_events');
  db.run('DELETE FROM sessions');
  db.run('DELETE FROM terms');
  db.run('DELETE FROM notes_files');
}

describe('store', () => {
  beforeEach(() => {
    clearAllTables();
  });

  afterAll(() => {
    try {
      store.closeDatabase();
    } catch {
      // Best-effort: Bun's SQLite + WAL can report SQLITE_BUSY on close in tests.
    }
    rmSync(testDataDir, { recursive: true, force: true });
  });

  it('createNotesFile stores UTF-8 byte length and round-trips raw text', () => {
    const rawText = 'hello 世界';
    const nf = store.createNotesFile({ title: 'Lecture 1', rawText });
    expect(nf.byteLength).toBe(Buffer.byteLength(rawText, 'utf8'));
    expect(nf.title).toBe('Lecture 1');
    expect(nf.rawText).toBe(rawText);

    const again = store.getNotesFileWithText(nf.id);
    expect(again?.rawText).toBe(rawText);
    expect(again?.byteLength).toBe(nf.byteLength);
  });

  it('listNotesFiles returns metadata without exposing raw_text', () => {
    store.createNotesFile({ title: 'A', rawText: 'x' });
    const list = store.listNotesFiles();
    expect(list).toHaveLength(1);
    expect(list[0]?.title).toBe('A');
    expect('rawText' in (list[0] as object)).toBe(false);
  });

  it('insertTerms adds multiple terms for one notes file', () => {
    const n = store.createNotesFile({ title: 't', rawText: 'note' });
    const inserted = store.insertTerms(n.id, [
      { term: 'a', definition: 'd1', sourceSpan: 'a', styleAnchor: 'a b' },
      { term: 'b', definition: 'd2', sourceSpan: 'b', styleAnchor: 'b' },
    ]);
    expect(inserted).toHaveLength(2);
    const terms = store.listTermsByNotesFile(n.id);
    expect(terms.map((t) => t.term).sort()).toEqual(['a', 'b']);
  });

  it('insertTerms throws for unknown notes_file_id', () => {
    expect(() =>
      store.insertTerms('ffffffff-ffff-ffff-ffff-ffffffffffff', [
        { term: 'orphan', definition: 'd', sourceSpan: 'x', styleAnchor: 'x' },
      ]),
    ).toThrow();
  });

  it('FSRS JSON columns on terms: null until set, then round-trip', () => {
    const n = store.createNotesFile({ title: 't', rawText: 'n' });
    const [term] = store.insertTerms(n.id, [
      { term: 'k', definition: 'd', sourceSpan: 'k', styleAnchor: 'k' },
    ]);
    expect(store.getFsrsCardJson(term.id)).toBeNull();

    const payload = '{"due":"2026-01-01T00:00:00.000Z","stability":3.14}';
    store.upsertFsrsCardJson(term.id, payload);
    expect(store.getFsrsCardJson(term.id)).toBe(payload);
  });

  it('review_events and sessions', () => {
    const n = store.createNotesFile({ title: 't', rawText: 'body' });
    const [term] = store.insertTerms(n.id, [
      { term: 'x', definition: 'd', sourceSpan: 'x', styleAnchor: 'x' },
    ]);

    const sess = store.createSession({ notesFileId: n.id, puzzleKind: 'cloze' });
    expect(sess.id.length).toBeGreaterThan(0);

    const rid = store.appendReviewEvent({
      termId: term.id,
      sessionId: sess.id,
      rating: 3,
      ms: 1200,
      hintsUsed: 0,
    });
    expect(rid).toBeGreaterThan(0);

    store.endSession(sess.id);
    const db = store.getDatabase();
    const ended = db
      .query('SELECT ended_at FROM sessions WHERE id = ?')
      .get(sess.id) as { ended_at: string | null };
    expect(ended.ended_at).not.toBeNull();
  });

  it('ON DELETE CASCADE from notes_files removes terms', () => {
    const n = store.createNotesFile({ title: 't', rawText: 'abc' });
    const [term] = store.insertTerms(n.id, [
      { term: 't1', definition: 'd', sourceSpan: 't1', styleAnchor: 't1' },
    ]);
    store.upsertFsrsCardJson(term.id, '{}');

    const db = store.getDatabase();
    db.run('DELETE FROM notes_files WHERE id = ?', [n.id]);

    const t = db.query('SELECT id FROM terms WHERE id = ?').get(term.id);
    expect(t).toBeNull();
  });
});
