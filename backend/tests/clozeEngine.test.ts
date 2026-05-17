/**
 * Tests for `clozeEngine.generate()` and `clozeEngine.validate()`.
 *
 * The shared SQLite instance is initialised by `tests/setup.ts` (the Bun preload file).
 * `generate` tests use fake in-memory Term objects — no DB writes required.
 * `clozeModeForTerm` queries FSRS state: for fake IDs (not in DB) the query returns
 * null → stability = 0 → 'anchored' mode. We only need the DB to be open for the
 * SELECT, not to have real rows.
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { MASK_TOKEN, type Term } from '@pachu/shared';
import type { LlmAdapter } from '../src/llm/adapter.js';
import { clozeEngine } from '../src/engines/cloze/index.js';
import { openDatabase } from '../src/store/db.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const RAW_NOTES = [
  'Hiragana is the rounded script, used for grammar and Japanese words.',
  'Katakana is the angular script, mainly used for foreign loanwords.',
  '',
  'The te-form is a verb conjugation used to connect clauses and make requests.',
].join('\n');

function makeLlm(response: string): LlmAdapter {
  return {
    provider: 'mock',
    model: 'mock',
    ping: async () => true,
    chat: async () => response,
  };
}

// ---------------------------------------------------------------------------
// clozeEngine.validate — no store needed
// ---------------------------------------------------------------------------

describe('clozeEngine.validate', () => {
  const validPuzzle = {
    kind: 'cloze' as const,
    id: 'p-1',
    spaceId: 'sp-1',
    items: [
      {
        termId: 't-1',
        sentence: `Some ${MASK_TOKEN} sentence.`,
        answer: 'term',
        mode: 'anchored' as const,
        sourceChunk: 'some chunk',
      },
    ],
  };

  test('accepts a valid cloze puzzle', () => {
    expect(clozeEngine.validate(validPuzzle)).toBe(true);
  });

  test('rejects wrong kind', () => {
    expect(clozeEngine.validate({ ...validPuzzle, kind: 'flashcards' as never })).toBe(false);
  });

  test('rejects missing id', () => {
    expect(clozeEngine.validate({ ...validPuzzle, id: '' })).toBe(false);
  });

  test('rejects missing spaceId', () => {
    expect(clozeEngine.validate({ ...validPuzzle, spaceId: '' })).toBe(false);
  });

  test('rejects empty items array', () => {
    expect(clozeEngine.validate({ ...validPuzzle, items: [] })).toBe(false);
  });

  test('rejects item whose sentence is missing the mask token', () => {
    const bad = {
      ...validPuzzle,
      items: [{ ...validPuzzle.items[0]!, sentence: 'Hiragana is the rounded script.' }],
    };
    expect(clozeEngine.validate(bad)).toBe(false);
  });

  test('rejects item with a missing answer', () => {
    const bad = { ...validPuzzle, items: [{ ...validPuzzle.items[0]!, answer: '' }] };
    expect(clozeEngine.validate(bad)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// clozeEngine.generate
// ---------------------------------------------------------------------------

/**
 * These tests use fake in-memory Term objects — no DB writes required.
 *
 * `clozeModeForTerm` queries `terms.fsrs_card_json` for stability. For fake IDs
 * (not in the DB), the query returns null → stability = 0 → 'anchored' mode always.
 *
 * `beforeAll` re-opens the DB singleton if `store.test.ts` (which runs in the same
 * Bun process under `--max-concurrency 1`) closed it in its own `afterAll`. The
 * `setup.ts` preload ensures `config.dataDir` points to a persistent workspace path
 * (`backend/data/test/`), so the `mkdirSync + new Database` in `openDatabase()` can
 * always recreate the file after a close.
 */
describe('clozeEngine.generate', () => {
  beforeAll(() => {
    // Re-open if store.test.ts's afterAll closed the singleton before our tests run.
    openDatabase();
  });

  function fakeTerm(overrides: Partial<Term> = {}): Term {
    return {
      id: randomBytes(16).toString('hex'), // fake — FSRS query returns null → anchored
      notesFileId: 'fake-nf',
      term: 'Hiragana',
      definition: 'The rounded Japanese script.',
      sourceSpan: 'Hiragana is the rounded script, used for grammar and Japanese words.',
      styleAnchor: 'Hiragana is the rounded script, used for grammar and Japanese words.',
      ...overrides,
    };
  }

  test('new terms (no FSRS card) always get anchored mode', async () => {
    const puzzle = await clozeEngine.generate({
      spaceId: 'space-1',
      terms: [fakeTerm()],
      rawText: RAW_NOTES,
      llm: makeLlm('should not be called for anchored'),
    });

    expect(puzzle.kind).toBe('cloze');
    expect(puzzle.items).toHaveLength(1);
    expect(puzzle.items[0]!.mode).toBe('anchored');
    expect(puzzle.items[0]!.sentence).toContain(MASK_TOKEN);
    expect(puzzle.items[0]!.answer).toBe('Hiragana');
    expect(clozeEngine.validate(puzzle)).toBe(true);
  });

  test('generates puzzle for multiple terms', async () => {
    const terms = [
      fakeTerm(),
      fakeTerm({
        term: 'Katakana',
        definition: 'The angular Japanese script.',
        sourceSpan: 'Katakana is the angular script, mainly used for foreign loanwords.',
        styleAnchor: 'Katakana is the angular script, mainly used for foreign loanwords.',
      }),
    ];

    const puzzle = await clozeEngine.generate({
      spaceId: 'space-2',
      terms,
      rawText: RAW_NOTES,
      llm: makeLlm(''),
    });

    expect(puzzle.items).toHaveLength(2);
    expect(puzzle.items.every((i) => i.sentence.includes(MASK_TOKEN))).toBe(true);
    expect(clozeEngine.validate(puzzle)).toBe(true);
  });

  test('uses the provided puzzleId', async () => {
    const puzzle = await clozeEngine.generate({
      spaceId: 'space-3',
      terms: [fakeTerm()],
      rawText: RAW_NOTES,
      llm: makeLlm(''),
      puzzleId: 'fixed-puzzle-id',
    });
    expect(puzzle.id).toBe('fixed-puzzle-id');
  });

  test('sourceChunk in each item is windowed, not the full notes', async () => {
    const longNotes = RAW_NOTES + '\n\n' + 'x'.repeat(2000);
    const puzzle = await clozeEngine.generate({
      spaceId: 'space-4',
      terms: [fakeTerm()],
      rawText: longNotes,
      llm: makeLlm(''),
    });
    expect(puzzle.items[0]!.sourceChunk.length).toBeLessThan(longNotes.length);
  });
});
