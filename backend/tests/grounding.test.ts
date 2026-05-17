import { describe, expect, test } from 'bun:test';
import { extractEntities, verifyGrounding } from '../src/llm/verify/grounding.js';

describe('extractEntities', () => {
  test('captures capitalized proper nouns', () => {
    const out = extractEntities('Atrial fibrillation is named after a Pasteur observation.');
    expect(out).toContain('Atrial');
    expect(out).toContain('Pasteur');
  });

  test('skips common English stop-words at sentence start', () => {
    const out = extractEntities('The patient was stable.');
    expect(out).not.toContain('The');
  });

  test('captures all-caps abbreviations', () => {
    const out = extractEntities('ECG showed irregularly irregular RR intervals.');
    expect(out).toContain('ECG');
    expect(out).toContain('RR');
  });

  test('captures numeric tokens including ordinals and percentages', () => {
    const out = extractEntities('In 1862, 35% of patients met 1st-line criteria.');
    expect(out).toContain('1862');
    expect(out).toContain('35%');
    expect(out).toContain('1st');
  });

  test('captures abbreviations with embedded digits (CHA2DS2-VASc)', () => {
    const out = extractEntities('Stroke risk is stratified by CHA2DS2-VASc.');
    const joined = out.join(' ');
    expect(joined).toContain('CHA2DS2');
  });
});

describe('verifyGrounding (anti-hallucination tier 2)', () => {
  const source = `
Atrial fibrillation is the most common sustained arrhythmia.
ECG shows absent P waves, a fibrillatory baseline, and irregular RR intervals.
Stroke risk is stratified by CHA2DS2-VASc.
  `.trim();

  test('passes when generated sentence introduces no new entities', () => {
    const generated = 'A patient with [MASK] often presents with irregular RR intervals.';
    const r = verifyGrounding(generated, source);
    expect(r.ok).toBe(true);
    expect(r.ungrounded).toEqual([]);
  });

  test('fails on a fabricated proper noun', () => {
    const generated = 'Pasteur first described [MASK] in his 1862 paper.';
    const r = verifyGrounding(generated, source);
    expect(r.ok).toBe(false);
    expect(r.ungrounded).toContain('Pasteur');
    expect(r.ungrounded).toContain('1862');
  });

  test('fails on a fabricated number that is not in the source', () => {
    const generated = 'About 73% of patients with [MASK] are over 65 years old.';
    const r = verifyGrounding(generated, source);
    expect(r.ok).toBe(false);
    expect(r.ungrounded.some((e) => e.includes('73'))).toBe(true);
  });

  test('passes when an abbreviation is grounded in the source', () => {
    const generated = 'The ECG of a patient with [MASK] shows absent P waves.';
    const r = verifyGrounding(generated, source);
    expect(r.ok).toBe(true);
  });

  test('passes for plain prose with no factual entities', () => {
    const generated = 'A patient with [MASK] usually feels their heart racing.';
    const r = verifyGrounding(generated, source);
    expect(r.ok).toBe(true);
  });
});
