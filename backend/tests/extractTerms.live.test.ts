import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, test } from 'bun:test';
import { OllamaAdapter } from '../src/llm/ollama.js';
import { extractTerms } from '../src/llm/prompts/extractTerms.js';
import { spanContains, verifySpan } from '../src/llm/verify/spanCheck.js';

/**
 * Live LLM smoke test for term extraction. Opt-in via LLM_LIVE=1.
 *
 * Runs the extractor against every file in docs/demo-notes/ and asserts that the LLM
 * produced at least one verified candidate per file, that every accepted candidate
 * passes both source-span and styleAnchor verification, and that the styleAnchor
 * literally contains the term. The console output reports accept/reject counts and
 * the rejection reasons — useful for tuning the prompt against a specific model.
 *
 *   LLM_LIVE=1 bun test backend/tests/extractTerms.live.test.ts
 *
 * To narrow to a single note file, use:
 *
 *   LLM_LIVE=1 bun test backend/tests/extractTerms.live.test.ts -t japanese
 */
const LIVE = process.env.LLM_LIVE === '1';
const NOTES_DIR = path.resolve(import.meta.dir, '..', '..', 'docs', 'demo-notes');

/**
 * The corpus of demo notes. Each was hand-written to stress a different axis:
 *   - register (casual / formal / clinical / kid-simple)
 *   - structure (prose / bullets / definitions / code blocks)
 *   - factual density (proper nouns + dates / numerical claims / vocabulary)
 *
 * `minAccepted` is a soft lower bound used as the test assertion. We keep it modest
 * because the model is small (gemma4:e2b) and prompt regressions are visible as
 * counts dropping noticeably below the bound.
 */
const NOTE_FILES: { file: string; label: string; minAccepted: number }[] = [
  { file: 'japanese-101.md', label: 'casual learning register', minAccepted: 8 },
  { file: 'calc-2.md', label: 'formal academic register', minAccepted: 8 },
  { file: 'cardio-clinical.md', label: 'terse clinical register', minAccepted: 8 },
  { file: 'history-cold-war.md', label: 'dates + proper-noun stress test', minAccepted: 8 },
  { file: 'typescript-generics.md', label: 'code blocks + jargon', minAccepted: 6 },
  { file: 'solar-system-kids.md', label: 'kid-simple register', minAccepted: 6 },
];

describe.skipIf(!LIVE)('extractTerms — live LLM against demo notes', () => {
  test('reaches Ollama before doing anything else', async () => {
    const llm = new OllamaAdapter();
    expect(await llm.ping()).toBe(true);
  });

  for (const { file, label, minAccepted } of NOTE_FILES) {
    test(`${file} (${label})`, async () => {
      const llm = new OllamaAdapter();
      const notes = await readFile(path.join(NOTES_DIR, file), 'utf8');
      const result = await extractTerms({ llm, notes, maxTerms: 20 });

      const reasons = result.rejected.map((r) => r.reason);
      const reasonCounts = reasons.reduce<Record<string, number>>((acc, r) => {
        acc[r] = (acc[r] ?? 0) + 1;
        return acc;
      }, {});

      console.log(
        `[${file}] accepted=${result.accepted.length} rejected=${result.rejected.length} reasons=${JSON.stringify(reasonCounts)}`
      );

      expect(result.accepted.length).toBeGreaterThanOrEqual(minAccepted);

      for (const c of result.accepted) {
        expect(c.term.length).toBeGreaterThan(0);
        expect(verifySpan(c.sourceSpan, notes)).toBe(true);
        expect(verifySpan(c.styleAnchor, notes)).toBe(true);
        expect(spanContains(c.styleAnchor, c.term)).toBe(true);
      }
    }, 180_000);
  }
});
