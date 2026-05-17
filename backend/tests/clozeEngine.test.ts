/**
 * Cloze engine tests. We exercise the four states the engine has to handle:
 *   - unreviewed term → anchored
 *   - reviewed-but-low-stability term → anchored
 *   - high-stability term + LLM returns a clean masked sentence → generated
 *   - high-stability term + LLM returns an UNGROUNDED sentence → silent fallback to anchored
 *
 * A fake LLM lets us control the per-call output without booting Ollama.
 */
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'bun:test';
import { MASK_TOKEN } from '@pachu/shared';
import type { LlmAdapter } from '../src/llm/adapter.js';

const testDataDir = path.join(
  tmpdir(),
  `pachu-cloze-engine-${randomBytes(8).toString('hex')}`,
);
process.env.PACHU_DATA_DIR = testDataDir;
mkdirSync(testDataDir, { recursive: true });

const store = await import('../src/store/index.js');
const fsrsMod = await import('../src/memory/fsrs.js');
const clozeMod = await import('../src/engines/cloze/index.js');
const anchored = await import('../src/engines/cloze/anchored.js');

function clearAllTables(): void {
  const db = store.getDatabase();
  db.run('DELETE FROM review_events');
  db.run('DELETE FROM sessions');
  db.run('DELETE FROM terms');
  db.run('DELETE FROM notes_files');
}

function fakeLlm(reply: string): LlmAdapter {
  return {
    provider: 'fake',
    model: 'fake',
    async ping() {
      return true;
    },
    async chat() {
      return reply;
    },
  };
}

function driveStable(termId: string): void {
  let now = new Date('2026-05-16T12:00:00.000Z');
  for (let i = 0; i < 6; i += 1) {
    fsrsMod.reviewTerm(termId, 4, now);
    now = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  }
}

const rawText =
  'Hiragana is the rounded one, used for grammar bits. Katakana is the angular one, used for loanwords.';

describe('maskTerm (unit)', () => {
  it('replaces a standalone word and preserves case-insensitive matches', () => {
    expect(anchored.maskTerm('Hiragana is rounded.', 'Hiragana')).toBe(`${MASK_TOKEN} is rounded.`);
    expect(anchored.maskTerm('hiragana is rounded.', 'Hiragana')).toBe(`${MASK_TOKEN} is rounded.`);
  });

  it('does not eat letters mid-word (the "in" problem)', () => {
    expect(anchored.maskTerm('Inflation is interesting.', 'in')).toBe('Inflation is interesting.');
  });

  it('handles CJK / non-ASCII terms by substring replace', () => {
    expect(anchored.maskTerm('心電図で診断する。', '心電図')).toBe(`${MASK_TOKEN}で診断する。`);
  });
});

describe('clozeEngine', () => {
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
      // Windows holds the SQLite WAL handle for a moment after close; the tempdir
      // gets cleaned up by the OS later. Don't fail the suite on cleanup races.
    }
  });

  it('unreviewed term → anchored, masks the term in the styleAnchor', async () => {
    const note = store.createNotesFile({ title: 'jp', rawText });
    const [term] = store.insertTerms(note.id, [
      {
        term: 'Hiragana',
        definition: 'rounded script',
        sourceSpan: 'Hiragana is the rounded one',
        styleAnchor: 'Hiragana is the rounded one, used for grammar bits.',
      },
    ]);
    if (!term) throw new Error('seed failed');

    const out = await clozeMod.clozeEngine.generate({
      spaceId: note.id,
      terms: [term],
      llm: fakeLlm('Should not be called for anchored mode.'),
      rawText,
      puzzleId: 'p1',
    });

    expect(out.kind).toBe('cloze');
    expect(out.spaceId).toBe(note.id);
    expect(out.items).toHaveLength(1);
    const [item] = out.items;
    if (!item) throw new Error('no item');
    expect(item.mode).toBe('anchored');
    expect(item.sentence).toContain(MASK_TOKEN);
    expect(item.sentence.toLowerCase()).not.toContain('hiragana');
    expect(clozeMod.clozeEngine.validate(out)).toBe(true);
  });

  it('high-stability term + clean grounded LLM output → generated mode', async () => {
    const note = store.createNotesFile({ title: 'jp', rawText });
    const [term] = store.insertTerms(note.id, [
      {
        term: 'Hiragana',
        definition: 'rounded script',
        sourceSpan: 'Hiragana is the rounded one',
        styleAnchor: 'Hiragana is the rounded one, used for grammar bits.',
      },
    ]);
    if (!term) throw new Error('seed failed');
    driveStable(term.id);

    // Generated sentence only uses lowercase grounded content + MASK; no proper nouns.
    const out = await clozeMod.clozeEngine.generate({
      spaceId: note.id,
      terms: [term],
      llm: fakeLlm(`${MASK_TOKEN} is the rounded one, used for grammar bits.`),
      rawText,
    });

    const [item] = out.items;
    if (!item) throw new Error('no item');
    expect(item.mode).toBe('generated');
    expect(item.sentence).toContain(MASK_TOKEN);
  });

  it('high-stability term + UNGROUNDED LLM output → silent fallback to anchored', async () => {
    const note = store.createNotesFile({ title: 'jp', rawText });
    const [term] = store.insertTerms(note.id, [
      {
        term: 'Hiragana',
        definition: 'rounded script',
        sourceSpan: 'Hiragana is the rounded one',
        styleAnchor: 'Hiragana is the rounded one, used for grammar bits.',
      },
    ]);
    if (!term) throw new Error('seed failed');
    driveStable(term.id);

    // "Heian" is a proper noun NOT in rawText — verifier must reject.
    const out = await clozeMod.clozeEngine.generate({
      spaceId: note.id,
      terms: [term],
      llm: fakeLlm(`${MASK_TOKEN} was invented in the Heian era.`),
      rawText,
    });

    const [item] = out.items;
    if (!item) throw new Error('no item');
    expect(item.mode).toBe('anchored');
    expect(item.sentence).toContain(MASK_TOKEN);
    // The fallback masked the styleAnchor, not the bad LLM output.
    expect(item.sentence.toLowerCase()).not.toContain('heian');
  });

  it('throws-on-chat LLM → silent fallback to anchored for that item', async () => {
    const note = store.createNotesFile({ title: 'jp', rawText });
    const [term] = store.insertTerms(note.id, [
      {
        term: 'Hiragana',
        definition: 'rounded script',
        sourceSpan: 'Hiragana is the rounded one',
        styleAnchor: 'Hiragana is the rounded one, used for grammar bits.',
      },
    ]);
    if (!term) throw new Error('seed failed');
    driveStable(term.id);

    const throwingLlm: LlmAdapter = {
      provider: 'fake',
      model: 'fake',
      async ping() {
        return false;
      },
      async chat() {
        throw new Error('boom');
      },
    };

    const out = await clozeMod.clozeEngine.generate({
      spaceId: note.id,
      terms: [term],
      llm: throwingLlm,
      rawText,
    });

    const [item] = out.items;
    if (!item) throw new Error('no item');
    expect(item.mode).toBe('anchored');
  });
});
