import { describe, expect, test } from 'bun:test';
import { computeStructuralHint } from '../src/llm/prompts/coach.js';

describe('computeStructuralHint', () => {
  test('single word', () => {
    expect(computeStructuralHint('apoptosis')).toBe(
      '9 letters, starts with A, ends with S, 1 word.'
    );
  });

  test('multi-word phrase', () => {
    expect(computeStructuralHint('atrial fibrillation')).toBe(
      '18 letters, starts with A, ends with N, 2 words.'
    );
  });

  test('handles trimming and casing', () => {
    expect(computeStructuralHint('  Hiragana  ')).toBe(
      '8 letters, starts with H, ends with A, 1 word.'
    );
  });

  test('hyphenated term counts hyphen as a letter character', () => {
    // We deliberately keep hyphens; the learner sees "te-form" as one token.
    expect(computeStructuralHint('te-form')).toBe(
      '7 letters, starts with T, ends with M, 1 word.'
    );
  });

  test('does not reveal the term itself anywhere in the output', () => {
    const term = 'mitochondria';
    const hint = computeStructuralHint(term);
    expect(hint.toLowerCase()).not.toContain(term.toLowerCase());
  });
});
