/**
 * Pure-function tests for ratingMapper. No store/LLM/time involved.
 */
import { describe, expect, it } from 'bun:test';
import { mapCloze, mapCrossword, mapFlashcards } from '../src/memory/ratingMapper.js';

describe('mapCrossword', () => {
  it('revealed answer → 1 (Again) regardless of hints/ms', () => {
    expect(mapCrossword({ revealed: true, hintsUsed: 0, ms: 1000 })).toBe(1);
    expect(mapCrossword({ revealed: true, hintsUsed: 5, ms: 999_999 })).toBe(1);
  });

  it('two or more hints → 2 (Hard)', () => {
    expect(mapCrossword({ revealed: false, hintsUsed: 2, ms: 5000 })).toBe(2);
    expect(mapCrossword({ revealed: false, hintsUsed: 3, ms: 5000 })).toBe(2);
  });

  it('fast (<30s) and zero hints → 4 (Easy)', () => {
    expect(mapCrossword({ revealed: false, hintsUsed: 0, ms: 12_000 })).toBe(4);
    expect(mapCrossword({ revealed: false, hintsUsed: 0, ms: 29_999 })).toBe(4);
  });

  it('exactly 30s with zero hints → 3 (Good); the cutoff is strict <', () => {
    expect(mapCrossword({ revealed: false, hintsUsed: 0, ms: 30_000 })).toBe(3);
  });

  it('one hint demotes Easy to Good', () => {
    expect(mapCrossword({ revealed: false, hintsUsed: 1, ms: 5000 })).toBe(3);
  });

  it('slow but unaided still gets 3 (Good)', () => {
    expect(mapCrossword({ revealed: false, hintsUsed: 0, ms: 90_000 })).toBe(3);
  });
});

describe('mapCloze', () => {
  it('incorrect → 1 (Again)', () => {
    expect(mapCloze({ correct: false, attempts: 1, hintsUsed: 0 })).toBe(1);
    expect(mapCloze({ correct: false, attempts: 5, hintsUsed: 3 })).toBe(1);
  });

  it('correct on first try with no hints → 4 (Easy)', () => {
    expect(mapCloze({ correct: true, attempts: 1, hintsUsed: 0 })).toBe(4);
  });

  it('correct but needed multiple attempts → 2 (Hard)', () => {
    expect(mapCloze({ correct: true, attempts: 2, hintsUsed: 0 })).toBe(2);
  });

  it('correct but used a hint → 2 (Hard)', () => {
    expect(mapCloze({ correct: true, attempts: 1, hintsUsed: 1 })).toBe(2);
  });
});

describe('mapFlashcards', () => {
  it('is the identity (user already picked the rating)', () => {
    expect(mapFlashcards(1)).toBe(1);
    expect(mapFlashcards(2)).toBe(2);
    expect(mapFlashcards(3)).toBe(3);
    expect(mapFlashcards(4)).toBe(4);
  });
});
