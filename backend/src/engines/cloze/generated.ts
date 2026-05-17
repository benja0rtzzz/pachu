import type { ClozeItem, Term } from '@pachu/shared';
import { MASK_TOKEN } from '@pachu/shared';
import type { LlmAdapter } from '../../llm/adapter.js';
import { generateClozeSentence } from '../../llm/prompts/clozeSentence.js';
import { buildAnchoredCloze } from './anchored.js';
import { extractSourceChunk } from './splitter.js';

/**
 * Attempt to generate a cloze sentence whose register mimics the term's `styleAnchor`.
 *
 * If the grounding verifier rejects the LLM output (fabricated proper nouns, dates, or
 * numbers absent from the source chunk), the function silently falls back to anchored
 * mode — it never surfaces a hallucinated sentence to the caller.
 *
 * This implements the second half of the cloze hybrid-mode contract from PLAN.md:
 *   - generated mode for terms with stability ≥ 7 days (decided upstream by stabilityRouter)
 *   - silent fallback to anchored on any verifier failure
 *
 * Standalone utility: the `clozeEngine` in `index.ts` calls `generateClozeSentence`
 * directly (with the full try/catch it needs as a PuzzleEngine); this module exists for
 * callers that want the generated-with-fallback behaviour as a single async function
 * without the engine scaffolding.
 */
export async function buildGeneratedItem(
  term: Term,
  rawNotes: string,
  llm: LlmAdapter,
  maskToken = MASK_TOKEN,
): Promise<ClozeItem> {
  const sourceChunk = extractSourceChunk(rawNotes, term.sourceSpan);

  const result = await generateClozeSentence({
    llm,
    term: term.term,
    sourceChunk,
    styleAnchor: term.styleAnchor,
    maskToken,
  });

  if (result.passedVerification) {
    return {
      termId: term.id,
      sentence: result.sentence,
      answer: term.term,
      mode: 'generated',
      sourceChunk,
    };
  }

  // Grounding failed — fall back silently. The anchored sentence is always safe.
  const anchored = buildAnchoredCloze(term, rawNotes);
  return {
    termId: term.id,
    sentence: anchored.sentence,
    answer: term.term,
    mode: 'anchored',
    sourceChunk: anchored.sourceChunk,
  };
}
