/**
 * Term Picker tests. Seeds notes + terms, drives FSRS reviews to produce a known mix of
 * due/weak/stable cards, and asserts the picker's bucketing and ordering.
 */
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'bun:test';

const testDataDir = path.join(
  tmpdir(),
  `pachu-term-picker-${randomBytes(8).toString('hex')}`,
);
process.env.PACHU_DATA_DIR = testDataDir;
mkdirSync(testDataDir, { recursive: true });

const store = await import('../src/store/index.js');
const fsrsMod = await import('../src/memory/fsrs.js');
const picker = await import('../src/memory/termPicker.js');

function clearAllTables(): void {
  const db = store.getDatabase();
  db.run('DELETE FROM review_events');
  db.run('DELETE FROM sessions');
  db.run('DELETE FROM terms');
  db.run('DELETE FROM notes_files');
}

function seedSpace(termSpecs: string[]): { spaceId: string; termIds: Record<string, string> } {
  const note = store.createNotesFile({ title: 't', rawText: 'body' });
  const rows = store.insertTerms(
    note.id,
    termSpecs.map((name) => ({
      term: name,
      definition: `def-${name}`,
      sourceSpan: name,
      styleAnchor: `style ${name}`,
    })),
  );
  const ids: Record<string, string> = {};
  for (let i = 0; i < termSpecs.length; i += 1) {
    const r = rows[i];
    const key = termSpecs[i];
    if (!r || !key) throw new Error('seedSpace: missing row');
    ids[key] = r.id;
  }
  return { spaceId: note.id, termIds: ids };
}

describe('pickTerms', () => {
  beforeEach(() => clearAllTables());

  afterAll(() => {
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

  it('returns [] for an empty space', () => {
    const note = store.createNotesFile({ title: 'empty', rawText: 'x' });
    expect(picker.pickTerms(note.id, { count: 10 })).toEqual([]);
  });

  it('count=0 returns []', () => {
    const { spaceId } = seedSpace(['a', 'b']);
    expect(picker.pickTerms(spaceId, { count: 0 })).toEqual([]);
  });

  it('unreviewed terms are bucketed as due', () => {
    const { spaceId } = seedSpace(['a', 'b', 'c']);
    const picks = picker.pickTerms(spaceId, { count: 10 });
    expect(picks).toHaveLength(3);
    for (const p of picks) {
      expect(p.bucket).toBe('due');
      expect(p.snapshot.unreviewed).toBe(true);
    }
  });

  it('orders due bucket before weak before stable', () => {
    const { spaceId, termIds } = seedSpace(['due', 'weak', 'stable']);
    const baseline = new Date('2026-05-16T12:00:00.000Z');

    // weak: review once → low stability, future due date.
    fsrsMod.reviewTerm(termIds.weak as string, 3, baseline);
    // stable: review many times with Easy + advance time → high stability, future due.
    let now = baseline;
    for (let i = 0; i < 6; i += 1) {
      fsrsMod.reviewTerm(termIds.stable as string, 4, now);
      now = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    }
    // due: leave unreviewed.

    // Pick "now" = a moment shortly after baseline; weak and stable should not yet be due.
    const pickAt = new Date(baseline.getTime() + 1000);
    const picks = picker.pickTerms(spaceId, { count: 10, now: pickAt });
    expect(picks.map((p) => p.term.term)).toEqual(['due', 'weak', 'stable']);
    expect(picks.map((p) => p.bucket)).toEqual(['due', 'weak', 'stable']);
  });

  it('truncates to the requested count, preserving priority', () => {
    const { spaceId, termIds } = seedSpace(['a', 'b', 'stable1', 'stable2']);
    // Drive stable1 + stable2 past the threshold.
    let now = new Date('2026-05-16T12:00:00.000Z');
    for (let i = 0; i < 6; i += 1) {
      fsrsMod.reviewTerm(termIds.stable1 as string, 4, now);
      fsrsMod.reviewTerm(termIds.stable2 as string, 4, now);
      now = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    }
    const pickAt = new Date('2026-05-16T12:00:01.000Z');
    const picks = picker.pickTerms(spaceId, { count: 2, now: pickAt });
    expect(picks).toHaveLength(2);
    expect(picks.every((p) => p.bucket === 'due')).toBe(true);
  });

  it('orders the due bucket by most-overdue first; unreviewed beats reviewed-but-due', () => {
    const { spaceId, termIds } = seedSpace(['fresh', 'lapsed']);
    // Review "lapsed" with Again, then advance the clock so its due time is in the past.
    const t0 = new Date('2026-05-16T12:00:00.000Z');
    fsrsMod.reviewTerm(termIds.lapsed as string, 1, t0);
    // Pick at +1 day so the Again-card (next review within minutes) is overdue.
    const pickAt = new Date(t0.getTime() + 24 * 60 * 60 * 1000);
    const picks = picker.pickTerms(spaceId, { count: 10, now: pickAt });
    expect(picks.map((p) => p.term.term)).toEqual(['fresh', 'lapsed']);
  });
});
