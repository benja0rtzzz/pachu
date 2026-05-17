import { describe, expect, test } from 'bun:test';
import { OllamaAdapter } from '../src/llm/ollama.js';
import { generateClozeSentence } from '../src/llm/prompts/clozeSentence.js';

/**
 * Live LLM smoke test for cloze generation. Opt-in via LLM_LIVE=1.
 *
 *   LLM_LIVE=1 bun test backend/tests/clozeSentence.live.test.ts
 */
const LIVE = process.env.LLM_LIVE === '1';

describe.skipIf(!LIVE)('generateClozeSentence — live LLM', () => {
  test('produces a [MASK]ed sentence grounded in the source chunk (cardio register)', async () => {
    const llm = new OllamaAdapter();
    const sourceChunk = `Atrial fibrillation is the most common sustained arrhythmia. Disorganized atrial electrical activity replaces coordinated contraction; the ventricular response is characteristically irregularly irregular. ECG shows absent P waves, a fibrillatory baseline, and irregular RR intervals.`;
    const styleAnchor = 'Atrial fibrillation is the most common sustained arrhythmia.';
    const result = await generateClozeSentence({
      llm,
      term: 'atrial fibrillation',
      sourceChunk,
      styleAnchor,
    });

    console.log('cardio cloze:', JSON.stringify(result, null, 2));

    expect(result.sentence.length).toBeGreaterThan(0);
    expect(result.sentence).toContain('[MASK]');
    expect(result.sentence.toLowerCase()).not.toContain('atrial fibrillation');
    // Grounding may legitimately fail on temperature 0.6 — we just want to know.
    if (!result.passedVerification) {
      console.log('grounding failed — ungrounded:', result.ungrounded);
    }
  }, 120_000);

  test('produces a [MASK]ed sentence grounded in the source chunk (japanese register)', async () => {
    const llm = new OllamaAdapter();
    const sourceChunk = `So I finally figured out the difference between the writing systems. Hiragana is the rounded one, used for grammar bits and Japanese words. Katakana is the angular one, used mostly for foreign loanwords like coffee.`;
    const styleAnchor = 'Hiragana is the rounded one, used for grammar bits and Japanese words.';
    const result = await generateClozeSentence({
      llm,
      term: 'hiragana',
      sourceChunk,
      styleAnchor,
    });

    console.log('japanese cloze:', JSON.stringify(result, null, 2));

    expect(result.sentence.length).toBeGreaterThan(0);
    expect(result.sentence).toContain('[MASK]');
    expect(result.sentence.toLowerCase()).not.toContain('hiragana');
  }, 120_000);
});
