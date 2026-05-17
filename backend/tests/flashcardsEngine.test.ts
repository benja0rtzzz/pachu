/**
 * Flashcards engine tests. The engine is trivial — no LLM, no layout solver, no
 * generated content — so these tests are mostly insurance against a regression that
 * would silently break the simplest puzzle kind. We cover:
 *
 *   - generate(): item shape (front/back/termId), input order preserved, spaceId
 *     + puzzleId propagation, default id is a non-empty string
 *   - validate(): accepts a healthy puzzle, rejects the obvious malformed cases
 *
 * Person C consumes `front` / `back` directly; if either field stops being a plain
 * string we want a test to fail before the app silently renders "[object Object]".
 */
import { describe, expect, it } from 'bun:test';
import type { FlashcardsPuzzle, Term } from '@pachu/shared';
import { flashcardsEngine } from '../src/engines/flashcards.js';

function term(name: string, def: string, anchor?: string): Term {
  return {
    id: `id-${name}`,
    notesFileId: 'space-1',
    term: name,
    definition: def,
    sourceSpan: name,
    styleAnchor: anchor ?? `An example sentence mentioning ${name}.`,
  };
}

const SEED_TERMS: Term[] = [
  term('Hiragana', 'The rounded Japanese script.'),
  term('Konnichiwa', 'A daytime greeting in Japanese.'),
  term('Arigato', 'Thank you, in Japanese.'),
];

describe('flashcardsEngine.generate', () => {
  it('produces a puzzle with the right kind, spaceId, and one item per input term in order', async () => {
    const out = await flashcardsEngine.generate({
      spaceId: 'space-1',
      terms: SEED_TERMS,
      puzzleId: 'p1',
    });

    expect(out.kind).toBe('flashcards');
    expect(out.id).toBe('p1');
    expect(out.spaceId).toBe('space-1');
    expect(out.items).toHaveLength(SEED_TERMS.length);

    // Order is preserved — the term picker decides priority, the engine does not reshuffle.
    out.items.forEach((item, i) => {
      const src = SEED_TERMS[i]!;
      expect(item.termId).toBe(src.id);
      expect(item.front).toBe(src.term);
      expect(item.back).toBe(src.definition);
    });
  });

  it('uses a non-empty generated id when puzzleId is not provided', async () => {
    const out = await flashcardsEngine.generate({
      spaceId: 'space-1',
      terms: SEED_TERMS,
    });
    expect(typeof out.id).toBe('string');
    expect(out.id.length).toBeGreaterThan(0);
  });

  it('handles an empty terms array (validate will reject the result)', async () => {
    const out = await flashcardsEngine.generate({ spaceId: 'space-1', terms: [] });
    expect(out.items).toEqual([]);
    expect(flashcardsEngine.validate(out)).toBe(false);
  });
});

describe('flashcardsEngine.validate', () => {
  function healthy(): FlashcardsPuzzle {
    return {
      kind: 'flashcards',
      id: 'p',
      spaceId: 's',
      items: [{ termId: 't1', front: 'Front', back: 'Back' }],
    };
  }

  it('accepts a healthy puzzle', () => {
    expect(flashcardsEngine.validate(healthy())).toBe(true);
  });

  it('rejects a puzzle whose kind is not "flashcards"', () => {
    const wrongKind = { ...healthy(), kind: 'cloze' } as unknown as FlashcardsPuzzle;
    expect(flashcardsEngine.validate(wrongKind)).toBe(false);
  });

  it('rejects when items is empty', () => {
    expect(flashcardsEngine.validate({ ...healthy(), items: [] })).toBe(false);
  });

  it('rejects an item with missing termId', () => {
    const bad = healthy();
    bad.items[0]!.termId = '';
    expect(flashcardsEngine.validate(bad)).toBe(false);
  });

  it('rejects an item with missing front', () => {
    const bad = healthy();
    bad.items[0]!.front = '';
    expect(flashcardsEngine.validate(bad)).toBe(false);
  });

  it('rejects a puzzle missing id or spaceId', () => {
    expect(flashcardsEngine.validate({ ...healthy(), id: '' })).toBe(false);
    expect(flashcardsEngine.validate({ ...healthy(), spaceId: '' })).toBe(false);
  });
});
