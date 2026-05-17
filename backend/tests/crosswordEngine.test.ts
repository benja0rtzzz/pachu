/**
 * Crossword engine tests. The engine wraps `crossword-layout-generator` (no types of its
 * own; we declared a local d.ts). These tests exercise:
 *   - LLM clue path: clueStylist returns a clue, engine uses it
 *   - LLM-throws path: engine falls back to the term's definition
 *   - validate() catches corrupt outputs (out-of-bounds entries)
 *
 * The fake LLM ensures we don't reach Ollama. Layout output is real, so we need the
 * `crossword-layout-generator` package installed (`bun install` from repo root).
 */
import { describe, expect, it } from 'bun:test';
import type { CrosswordPuzzle, Term } from '@pachu/shared';
import type { LlmAdapter } from '../src/llm/adapter.js';
import { crosswordEngine } from '../src/engines/crossword.js';

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

function throwingLlm(): LlmAdapter {
  return {
    provider: 'fake',
    model: 'fake',
    async ping() {
      return false;
    },
    async chat() {
      throw new Error('boom');
    },
  };
}

function term(name: string, def: string, anchor: string): Term {
  return {
    id: `id-${name}`,
    notesFileId: 'space-1',
    term: name,
    definition: def,
    sourceSpan: name,
    styleAnchor: anchor,
  };
}

// crossword-layout-generator needs words with overlapping letters to place anything.
// "apple", "ape", "leaf" share letters so a tiny layout is reliable across versions.
const SEED_TERMS: Term[] = [
  term('apple', 'red fruit', 'An apple is a red fruit you can eat.'),
  term('ape', 'great ape', 'An ape is a primate you might see at the zoo.'),
  term('leaf', 'tree leaf', 'A leaf is the green part of a tree.'),
];

describe('crosswordEngine.generate', () => {
  it('produces a puzzle with the right spaceId and a placed entry', async () => {
    const out = await crosswordEngine.generate({
      spaceId: 'space-1',
      terms: SEED_TERMS,
      llm: fakeLlm('A red fruit'),
      puzzleId: 'p1',
    });
    expect(out.kind).toBe('crossword');
    expect(out.id).toBe('p1');
    expect(out.spaceId).toBe('space-1');
    expect(out.entries.length).toBeGreaterThan(0);
    for (const e of out.entries) {
      expect(['across', 'down']).toContain(e.orientation);
      expect(e.startX).toBeGreaterThanOrEqual(0);
      expect(e.startY).toBeGreaterThanOrEqual(0);
      expect(e.termId.startsWith('id-')).toBe(true);
    }
    expect(crosswordEngine.validate(out)).toBe(true);
  });

  it('falls back to the definition when the clue LLM throws', async () => {
    const out = await crosswordEngine.generate({
      spaceId: 'space-1',
      terms: SEED_TERMS,
      llm: throwingLlm(),
    });
    expect(out.entries.length).toBeGreaterThan(0);
    // Every placed entry's clue must equal its term's definition (the fallback path).
    for (const e of out.entries) {
      const t = SEED_TERMS.find((x) => x.term === e.term);
      if (!t) continue;
      expect(e.clue).toBe(t.definition);
    }
  });
});

describe('crosswordEngine.validate', () => {
  it('rejects entries that overflow the grid', () => {
    const bad: CrosswordPuzzle = {
      kind: 'crossword',
      id: 'p',
      spaceId: 's',
      width: 3,
      height: 3,
      entries: [
        {
          term: 'apple',
          termId: 'id-apple',
          clue: 'fruit',
          startX: 0,
          startY: 0,
          orientation: 'across',
        },
      ],
    };
    expect(crosswordEngine.validate(bad)).toBe(false);
  });

  it('rejects an empty entries array', () => {
    expect(
      crosswordEngine.validate({
        kind: 'crossword',
        id: 'p',
        spaceId: 's',
        width: 3,
        height: 3,
        entries: [],
      }),
    ).toBe(false);
  });
});
