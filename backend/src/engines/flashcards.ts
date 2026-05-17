/**
 * Flashcards engine. Term → front (the term itself), back (its definition).
 *
 * Trivial by design: flashcards are the "direct FSRS review" surface; no LLM call, no
 * register mimicry. The orchestrator picks terms via the term picker, this engine
 * formats them, and the app exposes Again/Hard/Good/Easy directly to the user
 * (ratingMapper.mapFlashcards is the identity).
 */
import { randomUUID } from 'node:crypto';
import type { FlashcardsPuzzle, Term } from '@pachu/shared';
import type { PuzzleEngine } from './types.js';

export interface FlashcardsEngineInput {
  spaceId: string;
  terms: Term[];
  /** Override the generated id (mostly for tests). Defaults to `randomUUID()`. */
  puzzleId?: string;
}

export const flashcardsEngine: PuzzleEngine<FlashcardsEngineInput, FlashcardsPuzzle> = {
  id: 'flashcards',

  async generate(input) {
    return {
      kind: 'flashcards',
      id: input.puzzleId ?? randomUUID(),
      spaceId: input.spaceId,
      items: input.terms.map((t) => ({
        termId: t.id,
        front: t.term,
        back: t.definition,
      })),
    };
  },

  validate(puzzle) {
    if (puzzle.kind !== 'flashcards') return false;
    if (!puzzle.id || !puzzle.spaceId) return false;
    if (puzzle.items.length === 0) return false;
    for (const item of puzzle.items) {
      if (!item.termId || !item.front) return false;
    }
    return true;
  },
};
