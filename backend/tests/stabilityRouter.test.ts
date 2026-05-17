/**
 * Stability Router tests. Pure-function `clozeMode` tests don't touch the store; the
 * FSRS-aware `clozeModeForTerm` test seeds a real term and reviews it enough to push
 * stability past the threshold, mirroring how the cloze engine will use it.
 */
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'bun:test';

const testDataDir = path.join(
  tmpdir(),
  `pachu-stability-router-${randomBytes(8).toString('hex')}`,
);
process.env.PACHU_DATA_DIR = testDataDir;
mkdirSync(testDataDir, { recursive: true });

const store = await import('../src/store/index.js');
const fsrsMod = await import('../src/memory/fsrs.js');
const router = await import('../src/memory/stabilityRouter.js');

function clearAllTables(): void {
  const db = store.getDatabase();
  db.run('DELETE FROM review_events');
  db.run('DELETE FROM sessions');
  db.run('DELETE FROM terms');
  db.run('DELETE FROM notes_files');
}

function seedTerm(): string {
  const note = store.createNotesFile({ title: 't', rawText: 'body' });
  const [t] = store.insertTerms(note.id, [
    { term: 'x', definition: 'd', sourceSpan: 'x', styleAnchor: 'x' },
  ]);
  if (!t) throw new Error('seedTerm failed');
  return t.id;
}

describe('clozeMode (pure)', () => {
  it('below threshold → anchored', () => {
    expect(router.clozeMode(0)).toBe('anchored');
    expect(router.clozeMode(fsrsMod.STABILITY_THRESHOLD_DAYS - 0.0001)).toBe('anchored');
  });

  it('at or above threshold → generated', () => {
    expect(router.clozeMode(fsrsMod.STABILITY_THRESHOLD_DAYS)).toBe('generated');
    expect(router.clozeMode(fsrsMod.STABILITY_THRESHOLD_DAYS + 100)).toBe('generated');
  });
});

describe('clozeModeForTerm (FSRS-aware)', () => {
  beforeEach(() => clearAllTables());

  afterAll(() => {
    try {
      store.closeDatabase();
    } catch {
      // Best-effort, same as other test files.
    }
    try {
      rmSync(testDataDir, { recursive: true, force: true });
    } catch {
      // Windows EBUSY race on the WAL file — OS will clean the tempdir later.
    }
  });

  it('unreviewed term → anchored (stability=0)', () => {
    const id = seedTerm();
    expect(router.clozeModeForTerm(id)).toBe('anchored');
  });

  it('repeated Easy reviews eventually flip the term to generated mode', () => {
    const id = seedTerm();
    // Drive stability up by repeatedly grading Easy across several review days.
    let now = new Date('2026-05-16T12:00:00.000Z');
    for (let i = 0; i < 6; i += 1) {
      fsrsMod.reviewTerm(id, 4, now);
      // Advance time so the next repeat sees a longer elapsed interval.
      now = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    }
    expect(fsrsMod.getStabilityDays(id)).toBeGreaterThanOrEqual(
      fsrsMod.STABILITY_THRESHOLD_DAYS,
    );
    expect(router.clozeModeForTerm(id)).toBe('generated');
  });
});
