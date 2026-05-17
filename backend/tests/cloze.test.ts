/**
 * Cloze engine unit tests — no store dependency.
 *
 * Tests for `clozeEngine.generate()` and `clozeEngine.validate()` live in
 * `clozeEngine.test.ts` which provides its own isolated DB setup (same pattern
 * as store.test.ts) to avoid singleton conflicts when running the full suite.
 */
import { describe, expect, test } from 'bun:test';
import { MASK_TOKEN, type Term } from '@pachu/shared';
import type { LlmAdapter } from '../src/llm/adapter.js';
import {
  buildAnchoredCloze,
  maskTerm,
} from '../src/engines/cloze/anchored.js';
import {
  splitSentences,
  sentenceContainsTerm,
  findSentenceContaining,
} from '../src/engines/cloze/sentenceSplit.js';
import { extractSourceChunk } from '../src/engines/cloze/splitter.js';
import { buildGeneratedItem } from '../src/engines/cloze/generated.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const RAW_NOTES = [
  'Hiragana is the rounded script, used for grammar and Japanese words.',
  'Katakana is the angular script, mainly used for foreign loanwords.',
  '',
  'The te-form is a verb conjugation used to connect clauses and make requests.',
  'C++ is a systems-level language with manual memory management.',
].join('\n');

function makeTerm(overrides: Partial<Term> = {}): Term {
  return {
    id: 'term-1',
    notesFileId: 'nf-1',
    term: 'Hiragana',
    definition: 'The rounded Japanese script.',
    sourceSpan: 'Hiragana is the rounded script, used for grammar and Japanese words.',
    styleAnchor: 'Hiragana is the rounded script, used for grammar and Japanese words.',
    ...overrides,
  };
}

function makeLlm(response: string): LlmAdapter {
  return {
    provider: 'mock',
    model: 'mock',
    ping: async () => true,
    chat: async () => response,
  };
}

// ---------------------------------------------------------------------------
// extractSourceChunk (splitter.ts)
// ---------------------------------------------------------------------------

describe('extractSourceChunk', () => {
  test('returns a window centred on the sourceSpan', () => {
    const span = 'Hiragana is the rounded script, used for grammar and Japanese words.';
    const chunk = extractSourceChunk(RAW_NOTES, span, 100);
    expect(chunk).toContain(span);
  });

  test('does not exceed the raw notes length', () => {
    const chunk = extractSourceChunk(RAW_NOTES, RAW_NOTES.slice(0, 20), 99999);
    expect(chunk.length).toBeLessThanOrEqual(RAW_NOTES.length);
  });

  test('falls back to the span itself when span is not in notes', () => {
    const span = 'This phrase is not in the notes at all.';
    expect(extractSourceChunk(RAW_NOTES, span, 100)).toBe(span);
  });

  test('larger window returns more context', () => {
    const span = 'Katakana is the angular script, mainly used for foreign loanwords.';
    const small = extractSourceChunk(RAW_NOTES, span, 10);
    const large = extractSourceChunk(RAW_NOTES, span, 200);
    expect(large.length).toBeGreaterThanOrEqual(small.length);
  });
});

// ---------------------------------------------------------------------------
// sentenceSplit.ts
// ---------------------------------------------------------------------------

describe('splitSentences', () => {
  test('splits on period-space', () => {
    const sentences = splitSentences('Hiragana is rounded. Katakana is angular.');
    expect(sentences).toHaveLength(2);
    expect(sentences[0]).toBe('Hiragana is rounded.');
  });

  test('splits on newline', () => {
    const sentences = splitSentences('Line one.\nLine two.');
    expect(sentences.length).toBeGreaterThanOrEqual(2);
  });

  test('drops empty segments', () => {
    const sentences = splitSentences('Hello.\n\nWorld.');
    expect(sentences.every((s) => s.trim().length > 0)).toBe(true);
  });
});

describe('sentenceContainsTerm', () => {
  test('matches term present in sentence', () => {
    expect(sentenceContainsTerm('Hiragana is the rounded script.', 'Hiragana')).toBe(true);
  });

  test('is case-insensitive', () => {
    expect(sentenceContainsTerm('Hiragana is the rounded script.', 'hiragana')).toBe(true);
  });

  test('does not match term as a substring of a longer word', () => {
    // "in" inside "inflation" should not match "in" as a term.
    expect(sentenceContainsTerm('Inflation affects purchasing power.', 'in')).toBe(false);
  });

  test('returns false for empty term', () => {
    expect(sentenceContainsTerm('Some sentence.', '')).toBe(false);
  });
});

describe('findSentenceContaining', () => {
  test('returns first sentence that contains the term', () => {
    const result = findSentenceContaining(RAW_NOTES, 'Katakana');
    expect(result).not.toBeNull();
    expect(result?.toLowerCase()).toContain('katakana');
  });

  test('returns null when term not found', () => {
    expect(findSentenceContaining(RAW_NOTES, 'konnichiwa')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// maskTerm (anchored.ts)
// ---------------------------------------------------------------------------

describe('maskTerm', () => {
  test('masks a simple ASCII term', () => {
    const result = maskTerm('Hiragana is the rounded script.', 'Hiragana');
    expect(result).toContain(MASK_TOKEN);
    expect(result).not.toContain('Hiragana');
  });

  test('is case-insensitive', () => {
    expect(maskTerm('hiragana is rounded.', 'Hiragana')).toContain(MASK_TOKEN);
  });

  test('does not shred a longer word that contains the term', () => {
    // "in" should NOT be masked inside "Inflation".
    const result = maskTerm('Inflation affects purchasing power.', 'in');
    expect(result).not.toContain(MASK_TOKEN);
  });

  test('masks special regex characters in the term safely', () => {
    const result = maskTerm('C++ is a systems-level language.', 'C++');
    expect(result).toContain(MASK_TOKEN);
    expect(result).not.toContain('C++');
  });

  test('masks all occurrences (not just first)', () => {
    const result = maskTerm(
      'te-form connects clauses; te-form is used for requests.',
      'te-form',
    );
    expect(result.split(MASK_TOKEN).length - 1).toBe(2);
  });

  test('returns original sentence unchanged for empty term', () => {
    const s = 'Some sentence.';
    expect(maskTerm(s, '')).toBe(s);
  });
});

// ---------------------------------------------------------------------------
// buildAnchoredCloze (anchored.ts)
// ---------------------------------------------------------------------------

describe('buildAnchoredCloze', () => {
  test('masks the term in the styleAnchor (primary path)', () => {
    const item = buildAnchoredCloze(makeTerm(), RAW_NOTES);
    expect(item.sentence).toContain(MASK_TOKEN);
    expect(item.sentence).not.toContain('Hiragana');
    expect(item.sourceChunk).toBeTruthy();
  });

  test('falls back to a sentence from rawText when styleAnchor lacks the term', () => {
    // styleAnchor deliberately does not contain the term.
    const term = makeTerm({
      styleAnchor: 'This anchor does not mention the term at all.',
    });
    const item = buildAnchoredCloze(term, RAW_NOTES);
    // Should still produce a masked sentence using the rawText scan.
    expect(item.sentence).toContain(MASK_TOKEN);
  });

  test('falls back to sourceSpan when neither styleAnchor nor rawText have a sentence', () => {
    const term = makeTerm({
      styleAnchor: 'No mention here.',
      sourceSpan: 'Hiragana is the rounded script.',
    });
    const item = buildAnchoredCloze(term, 'unrelated text with no hiragana');
    // sourceSpan IS the fallback, and it contains the term.
    expect(item.sentence).toContain(MASK_TOKEN);
  });
});

// ---------------------------------------------------------------------------
// buildGeneratedItem (generated.ts)
// ---------------------------------------------------------------------------

describe('buildGeneratedItem', () => {
  test('returns a generated ClozeItem when LLM output passes grounding', async () => {
    const sentence = `${MASK_TOKEN} is written using rounded characters for grammar.`;
    const item = await buildGeneratedItem(makeTerm(), RAW_NOTES, makeLlm(sentence));
    expect(item.mode).toBe('generated');
    expect(item.sentence).toContain(MASK_TOKEN);
  });

  test('falls back to anchored when LLM output has no mask token', async () => {
    // No MASK_TOKEN → passedVerification = false → silent anchored fallback.
    const item = await buildGeneratedItem(
      makeTerm(),
      RAW_NOTES,
      makeLlm('Hiragana is written using rounded characters.'),
    );
    expect(item.mode).toBe('anchored');
  });

  test('falls back to anchored when grounding verifier rejects ungrounded entities', async () => {
    // "Napoleon" is not in RAW_NOTES → grounding fails.
    const item = await buildGeneratedItem(
      makeTerm(),
      RAW_NOTES,
      makeLlm(`${MASK_TOKEN} was invented by Napoleon in 1800.`),
    );
    expect(item.mode).toBe('anchored');
  });

  test('sourceChunk contains the sourceSpan (extractSourceChunk was used)', async () => {
    const sentence = `${MASK_TOKEN} is written using rounded characters for grammar.`;
    const item = await buildGeneratedItem(makeTerm(), RAW_NOTES, makeLlm(sentence));
    // The windowed chunk must contain the span the term was drawn from.
    expect(item.sourceChunk).toContain(
      'Hiragana is the rounded script, used for grammar and Japanese words.',
    );
    // It must not be rawText passed through verbatim (the window is trimmed at edges).
    expect(item.sourceChunk.length).toBeLessThanOrEqual(RAW_NOTES.length);
  });
});

// clozeEngine.validate and clozeEngine.generate tests → see clozeEngine.test.ts
