/**
 * Puzzle event → FSRS rating (1=Again, 2=Hard, 3=Good, 4=Easy).
 *
 * Pure functions only — no DB, no LLM, no time. The orchestrator collects the per-term
 * outcome from the puzzle UI, then `reviewTerm` (memory/fsrs.ts) takes the rating and
 * advances the card.
 *
 * The mapping is deliberately strict: 4 (Easy) requires a fast, hint-free, single-attempt
 * solve, otherwise we settle for 3 (Good). 1 (Again) is reserved for objective failures
 * (revealed crossword answer, incorrect cloze). Hint usage demotes towards 2 (Hard) so
 * stability growth stays honest — the user didn't really know the term.
 *
 * Why not let the user pick 1..4 directly for crossword/cloze? The Flashcards screen does
 * that (so `mapFlashcards` is the identity), but crossword + cloze are puzzle-shaped: the
 * UI doesn't surface a 1..4 picker. We derive a rating from observed solver behaviour.
 */
import type { Rating } from '@pachu/shared';

export interface CrosswordOutcome {
  /** Number of coach hints the user used while solving this clue. */
  hintsUsed: number;
  /** True if the user gave up and revealed the answer. */
  revealed: boolean;
  /** Time spent on this clue, in milliseconds. */
  ms: number;
}

export interface ClozeOutcome {
  /** True if the user's final submission matched the verified answer. */
  correct: boolean;
  /** Number of submission attempts (>=1; first attempt counts). */
  attempts: number;
  /** Number of coach hints the user used while answering this item. */
  hintsUsed: number;
}

/**
 * Threshold for "fast" crossword solves. 30s is the rule of thumb from PLAN.md; below
 * that, with no hints, an entry gets the Easy bump. Above it, Good is the ceiling.
 */
const CROSSWORD_FAST_MS = 30_000;

export function mapCrossword(e: CrosswordOutcome): Rating {
  if (e.revealed) return 1;
  if (e.hintsUsed >= 2) return 2;
  if (e.ms < CROSSWORD_FAST_MS && e.hintsUsed === 0) return 4;
  return 3;
}

export function mapCloze(e: ClozeOutcome): Rating {
  if (!e.correct) return 1;
  if (e.attempts > 1 || e.hintsUsed > 0) return 2;
  return 4;
}

/**
 * Flashcards: the user already chose the rating in the UI. This identity wrapper exists
 * so call sites don't need a special case — every puzzle kind goes through a `map*`.
 */
export function mapFlashcards(rating: Rating): Rating {
  return rating;
}
