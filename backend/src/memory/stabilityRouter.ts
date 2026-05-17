/**
 * Stability Router: per-term `anchored | generated` decision for the Cloze engine.
 *
 * The rule is intentionally trivial — a card whose FSRS stability has crossed the
 * configured threshold has been seen often enough that the verbatim source sentence is no
 * longer useful pedagogy; the LLM gets to write a fresh sentence in the user's register.
 * Brand-new terms (stability = 0) always anchor.
 *
 * Wrapping this in its own module rather than inlining at the call site documents the
 * decision boundary (this is the *only* place the router lives) and keeps the cloze
 * engine free of FSRS imports.
 */
import { STABILITY_THRESHOLD_DAYS, getStabilityDays } from './fsrs.js';

export type ClozeMode = 'anchored' | 'generated';

/**
 * Pick anchored vs generated for a single term, given a stability value in days. Pure;
 * the FSRS-aware variant is `clozeModeForTerm` below.
 */
export function clozeMode(stabilityDays: number): ClozeMode {
  return stabilityDays >= STABILITY_THRESHOLD_DAYS ? 'generated' : 'anchored';
}

/**
 * FSRS-aware variant: load the term's stability and decide. The grounding verifier
 * inside the cloze engine may still demote a 'generated' decision back to 'anchored' if
 * the generated sentence fails the check — that's the silent fallback, not this layer.
 */
export function clozeModeForTerm(termId: string): ClozeMode {
  return clozeMode(getStabilityDays(termId));
}
