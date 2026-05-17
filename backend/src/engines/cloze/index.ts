/**
 * Cloze engine — hybrid mode.
 *
 *   per-term stability < threshold  → anchored mode (verbatim sentence from notes, masked)
 *   per-term stability ≥ threshold  → generated mode (LLM mimics styleAnchor, grounded)
 *
 * On any of these failure conditions the engine silently falls back to anchored mode for
 * that single item, never to the user:
 *   - LLM call throws or returns empty text
 *   - generated sentence is missing the mask token
 *   - grounding verifier rejects an entity (proper noun / digit / date) that is not in
 *     the source chunk
 *
 * Silent fallback is the contract — the demo never surfaces a hallucinated sentence. The
 * `previousMode` field on each `ClozeItem` is left undefined here; persisting per-term
 * mode history is a future enhancement (would need a new table or term column). The
 * field exists on the wire shape so callers can adopt it without a wire change later.
 */
import { randomUUID } from 'node:crypto';
import { MASK_TOKEN, type ClozeItem, type ClozePuzzle, type Term } from '@pachu/shared';
import type { LlmAdapter } from '../../llm/adapter.js';
import { generateClozeSentence } from '../../llm/prompts/clozeSentence.js';
import { clozeModeForTerm, type ClozeMode } from '../../memory/stabilityRouter.js';
import type { PuzzleEngine } from '../types.js';
import { buildAnchoredCloze } from './anchored.js';

export interface ClozeEngineInput {
  spaceId: string;
  terms: Term[];
  llm: LlmAdapter;
  /** Raw notes text. Used for grounding the generated mode + anchored fallback search. */
  rawText: string;
  /** Override the generated id (mostly for tests). Defaults to `randomUUID()`. */
  puzzleId?: string;
}

async function buildClozeItem(
  term: Term,
  rawText: string,
  llm: LlmAdapter,
  desiredMode: ClozeMode,
): Promise<ClozeItem> {
  if (desiredMode === 'generated') {
    try {
      const gen = await generateClozeSentence({
        llm,
        term: term.term,
        sourceChunk: rawText,
        styleAnchor: term.styleAnchor,
        maskToken: MASK_TOKEN,
      });
      if (gen.passedVerification && gen.sentence.includes(MASK_TOKEN)) {
        return {
          termId: term.id,
          sentence: gen.sentence,
          answer: term.term,
          mode: 'generated',
          sourceChunk: rawText,
        };
      }
    } catch {
      // Fall through to anchored — verifier silence is the rule for the demo.
    }
  }

  const anchored = buildAnchoredCloze(term, rawText);
  return {
    termId: term.id,
    sentence: anchored.sentence,
    answer: term.term,
    mode: 'anchored',
    sourceChunk: anchored.sourceChunk,
  };
}

export const clozeEngine: PuzzleEngine<ClozeEngineInput, ClozePuzzle> = {
  id: 'cloze',

  async generate(input) {
    const items: ClozeItem[] = [];
    for (const term of input.terms) {
      const mode = clozeModeForTerm(term.id);
      const item = await buildClozeItem(term, input.rawText, input.llm, mode);
      items.push(item);
    }

    return {
      kind: 'cloze',
      id: input.puzzleId ?? randomUUID(),
      spaceId: input.spaceId,
      items,
    };
  },

  validate(puzzle) {
    if (puzzle.kind !== 'cloze') return false;
    if (!puzzle.id || !puzzle.spaceId) return false;
    if (puzzle.items.length === 0) return false;
    for (const item of puzzle.items) {
      if (!item.termId || !item.answer) return false;
      if (!item.sentence.includes(MASK_TOKEN)) return false;
      if (item.mode !== 'anchored' && item.mode !== 'generated') return false;
    }
    return true;
  },
};
