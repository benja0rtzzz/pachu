/**
 * Unit tests for the SpaceSummary computation. Drives the store directly so the
 * summary is exercised against real SQLite, not mocks. The store + memory modules
 * are imported AFTER PACHU_DATA_DIR is set to keep each test file isolated.
 */
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'bun:test';

const testDataDir = path.join(tmpdir(), `pachu-summary-${randomBytes(8).toString('hex')}`);
process.env.PACHU_DATA_DIR = testDataDir;
mkdirSync(testDataDir, { recursive: true });

const store = await import('../src/store/index.js');
const { computeSpaceSummary } = await import('../src/memory/spaceSummary.js');
const fsrsMod = await import('../src/memory/fsrs.js');

function reset(): void {
  const db = store.getDatabase();
  db.run('DELETE FROM review_events');
  db.run('DELETE FROM sessions');
  db.run('DELETE FROM terms');
  db.run('DELETE FROM notes_files');
}

function seedNotes(title = 't'): string {
  return store.createNotesFile({ title, rawText: 'body' }).id;
}

describe('computeSpaceSummary', () => {
  beforeEach(reset);

  afterAll(() => {
    try {
      store.closeDatabase();
    } catch {
      // Best-effort.
    }
    rmSync(testDataDir, { recursive: true, force: true });
  });

  it('empty space yields all-zero summary', () => {
    const id = seedNotes();
    const s = computeSpaceSummary(id);
    expect(s.termCount).toBe(0);
    expect(s.dueCount).toBe(0);
    expect(s.newCount).toBe(0);
    expect(s.stableCount).toBe(0);
    expect(s.dueToday).toBe(0);
    expect(s.playedTodayKinds).toEqual([]);
    expect(s.streakDays).toBe(0);
    expect(s.lastReviewedAt).toBeUndefined();
    expect(s.lastPuzzleKind).toBeUndefined();
  });

  it('unreviewed terms count as new + due + dueToday', () => {
    const id = seedNotes();
    store.insertTerms(id, [
      { term: 'a', definition: 'd', sourceSpan: 'a', styleAnchor: 'a' },
      { term: 'b', definition: 'd', sourceSpan: 'b', styleAnchor: 'b' },
    ]);
    const s = computeSpaceSummary(id);
    expect(s.termCount).toBe(2);
    expect(s.newCount).toBe(2);
    expect(s.dueCount).toBe(2);
    expect(s.dueToday).toBe(2);
    expect(s.stableCount).toBe(0);
  });

  it('after a Good review: not due now, newCount drops, lastReviewedAt set', () => {
    const id = seedNotes();
    const [term] = store.insertTerms(id, [
      { term: 'k', definition: 'd', sourceSpan: 'k', styleAnchor: 'k' },
    ]);
    if (!term) throw new Error('seed failed');
    fsrsMod.reviewTerm(term.id, 3);
    const s = computeSpaceSummary(id);
    expect(s.termCount).toBe(1);
    expect(s.newCount).toBe(0);
    expect(s.dueCount).toBe(0);
    expect(typeof s.lastReviewedAt).toBe('string');
  });

  it('stableCount counts terms with stability >= threshold', () => {
    const id = seedNotes();
    const [term] = store.insertTerms(id, [
      { term: 'k', definition: 'd', sourceSpan: 'k', styleAnchor: 'k' },
    ]);
    if (!term) throw new Error('seed failed');
    // Hand-craft a card with stability above the threshold to test the bucket
    // without depending on FSRS taking many Goods to stabilize.
    const farFuture = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const fakeCard = {
      due: farFuture,
      stability: fsrsMod.STABILITY_THRESHOLD_DAYS + 1,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 30,
      reps: 5,
      lapses: 0,
      state: 2,
    };
    store.upsertFsrsCardJson(term.id, JSON.stringify(fakeCard));
    const s = computeSpaceSummary(id);
    expect(s.stableCount).toBe(1);
    expect(s.dueCount).toBe(0);
  });

  it('playedTodayKinds and lastPuzzleKind reflect ended sessions in the window', () => {
    const id = seedNotes();
    const sess = store.createSession({ notesFileId: id, puzzleKind: 'cloze' });
    store.endSession(sess.id);
    const s = computeSpaceSummary(id);
    expect(s.playedTodayKinds).toEqual(['cloze']);
    expect(s.lastPuzzleKind).toBe('cloze');
  });

  it('streakDays counts contiguous local days with an ended session (today only)', () => {
    const id = seedNotes();
    const sess = store.createSession({ notesFileId: id, puzzleKind: 'flashcards' });
    store.endSession(sess.id);
    const s = computeSpaceSummary(id);
    expect(s.streakDays).toBe(1);
  });

  it('streak stays at 0 if today has no session and yesterday is empty too', () => {
    const id = seedNotes();
    // No sessions at all.
    const s = computeSpaceSummary(id);
    expect(s.streakDays).toBe(0);
  });

  it('corrupt fsrs_card_json is skipped, not crashing the route', () => {
    const id = seedNotes();
    const [term] = store.insertTerms(id, [
      { term: 'k', definition: 'd', sourceSpan: 'k', styleAnchor: 'k' },
    ]);
    if (!term) throw new Error('seed failed');
    store.upsertFsrsCardJson(term.id, '{ this is not json');
    const s = computeSpaceSummary(id);
    expect(s.termCount).toBe(1);
    // Term has a (corrupt) blob so it's not counted as new; it's also not counted
    // as due/stable because we can't parse it. The summary stays consistent.
    expect(s.newCount).toBe(0);
    expect(s.dueCount).toBe(0);
    expect(s.stableCount).toBe(0);
  });
});
