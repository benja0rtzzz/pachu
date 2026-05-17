/**
 * FSRS wrapper tests. Like `store.test.ts`, `PACHU_DATA_DIR` must be set before any
 * import of `config` / `store` / `memory`.
 */
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'bun:test';

const testDataDir = path.join(tmpdir(), `pachu-fsrs-bun-test-${randomBytes(8).toString('hex')}`);
process.env.PACHU_DATA_DIR = testDataDir;
mkdirSync(testDataDir, { recursive: true });

const store = await import('../src/store/index.js');
const fsrsMod = await import('../src/memory/fsrs.js');

function seedTerm(): string {
  const note = store.createNotesFile({ title: 't', rawText: 'body' });
  const [term] = store.insertTerms(note.id, [
    { term: 'x', definition: 'd', sourceSpan: 'x', styleAnchor: 'x' },
  ]);
  if (!term) throw new Error('seedTerm: insertTerms returned no rows');
  return term.id;
}

function clearAllTables(): void {
  const db = store.getDatabase();
  db.run('DELETE FROM review_events');
  db.run('DELETE FROM sessions');
  db.run('DELETE FROM terms');
  db.run('DELETE FROM notes_files');
}

describe('memory/fsrs', () => {
  beforeEach(() => {
    clearAllTables();
  });

  afterAll(() => {
    try {
      store.closeDatabase();
    } catch {
      // Best-effort, same as store.test.ts.
    }
    rmSync(testDataDir, { recursive: true, force: true });
  });

  it('unreviewed term: isDue=true, stability=0, no row written', () => {
    const id = seedTerm();
    expect(fsrsMod.isDue(id)).toBe(true);
    expect(fsrsMod.getStabilityDays(id)).toBe(0);
    expect(store.getFsrsCardJson(id)).toBeNull();
  });

  it('reviewTerm with Good persists a card and sets a future due date', () => {
    const id = seedTerm();
    const now = new Date('2026-05-16T12:00:00.000Z');
    const card = fsrsMod.reviewTerm(id, 3, now);
    expect(card.reps).toBeGreaterThan(0);
    expect(card.due.getTime()).toBeGreaterThan(now.getTime());

    const json = store.getFsrsCardJson(id);
    expect(json).not.toBeNull();
    expect(fsrsMod.getStabilityDays(id)).toBeGreaterThan(0);
    expect(fsrsMod.isDue(id, now)).toBe(false);
  });

  it('Again (rating=1) keeps the card due very soon', () => {
    const id = seedTerm();
    const now = new Date('2026-05-16T12:00:00.000Z');
    const card = fsrsMod.reviewTerm(id, 1, now);
    // FSRS schedules Again as Learning state and the next interval is in minutes,
    // so the card should still be due within the same calendar day.
    expect(card.due.getTime() - now.getTime()).toBeLessThan(24 * 60 * 60 * 1000);
  });

  it('Easy yields a longer due interval than Hard', () => {
    const a = seedTerm();
    const b = seedTerm();
    const now = new Date('2026-05-16T12:00:00.000Z');
    const hard = fsrsMod.reviewTerm(a, 2, now);
    const easy = fsrsMod.reviewTerm(b, 4, now);
    expect(easy.due.getTime()).toBeGreaterThan(hard.due.getTime());
  });

  it('card survives a JSON round-trip (Date fields revived)', () => {
    const id = seedTerm();
    const now = new Date('2026-05-16T12:00:00.000Z');
    fsrsMod.reviewTerm(id, 3, now);
    const loaded = fsrsMod.getCardForTerm(id);
    expect(loaded.due).toBeInstanceOf(Date);
    expect(Number.isFinite(loaded.due.getTime())).toBe(true);
    if (loaded.last_review !== undefined) {
      expect(loaded.last_review).toBeInstanceOf(Date);
    }
  });
});
