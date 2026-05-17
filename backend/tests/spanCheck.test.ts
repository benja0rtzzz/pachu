import { describe, expect, test } from 'bun:test';
import { spanContains, verifySpan } from '../src/llm/verify/spanCheck.js';

describe('verifySpan (anti-hallucination tier 1)', () => {
  const notes = `
Hiragana is the rounded one, used for grammar bits and Japanese words.
Konnichiwa is the daytime hello, around midday to early evening.
The "wa" particle marks the topic of a sentence.
  `.trim();

  test('accepts a literal substring', () => {
    expect(verifySpan('Hiragana is the rounded one', notes)).toBe(true);
  });

  test('accepts a single word that appears', () => {
    expect(verifySpan('Konnichiwa', notes)).toBe(true);
  });

  test('is case-insensitive by default', () => {
    expect(verifySpan('hiragana', notes)).toBe(true);
    expect(verifySpan('HIRAGANA IS THE ROUNDED ONE', notes)).toBe(true);
  });

  test('honors caseSensitive when requested', () => {
    expect(verifySpan('hiragana', notes, { caseSensitive: true })).toBe(false);
    expect(verifySpan('Hiragana', notes, { caseSensitive: true })).toBe(true);
  });

  test('collapses whitespace by default (handles LLM-rewrapped sentences)', () => {
    const span = 'Hiragana   is the\nrounded one';
    expect(verifySpan(span, notes)).toBe(true);
  });

  test('rejects fabricated content', () => {
    expect(verifySpan('Hiragana is the angular one', notes)).toBe(false);
    expect(verifySpan('Pachinko is a particle marker', notes)).toBe(false);
  });

  test('handles smart-quote variants via NFKC normalization', () => {
    const sourceWithCurly = 'The \u201Cwa\u201D particle marks the topic of a sentence.';
    const spanWithStraight = 'The "wa" particle marks the topic';
    expect(verifySpan(spanWithStraight, sourceWithCurly)).toBe(true);
  });

  test('rejects empty inputs', () => {
    expect(verifySpan('', notes)).toBe(false);
    expect(verifySpan('hiragana', '')).toBe(false);
  });
});

describe('spanContains (styleAnchor-must-mention-term check)', () => {
  test('passes when sentence contains the term', () => {
    const sentence = 'Atrial fibrillation is the most common sustained arrhythmia.';
    expect(spanContains(sentence, 'atrial fibrillation')).toBe(true);
    expect(spanContains(sentence, 'arrhythmia')).toBe(true);
  });

  test('fails when sentence does not contain the term', () => {
    const sentence = 'Atrial fibrillation is the most common sustained arrhythmia.';
    expect(spanContains(sentence, 'pericarditis')).toBe(false);
  });
});
