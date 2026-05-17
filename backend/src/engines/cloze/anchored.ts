/**
 * Anchored-mode cloze: take a verbatim sentence from the user's notes, replace the term
 * with `MASK_TOKEN`, return.
 *
 * Selection order for the sentence:
 *   1. `term.styleAnchor` if it actually contains the term (the common case).
 *   2. First sentence in `rawText` that contains the term (extractor edge cases).
 *   3. `term.sourceSpan` itself — the literal substring guaranteed by tier-1 anti-hall.
 *      This is the absolute fallback; sometimes a single phrase, not a full sentence.
 *
 * Why a function and not part of the engine file: keeps the (well-tested) masking logic
 * trivially unit-testable without dragging the LLM adapter into the test setup.
 */
import { MASK_TOKEN, type Term } from '@pachu/shared';
import {
  findSentenceContaining,
  sentenceContainsTerm,
} from './sentenceSplit.js';

export interface AnchoredClozeResult {
  sentence: string;
  /** The source span we ultimately used; surfaced for diagnostics. */
  sourceChunk: string;
}

export function buildAnchoredCloze(term: Term, rawText: string): AnchoredClozeResult {
  const chosen =
    (sentenceContainsTerm(term.styleAnchor, term.term) ? term.styleAnchor : null) ??
    findSentenceContaining(rawText, term.term) ??
    term.sourceSpan;

  return {
    sentence: maskTerm(chosen, term.term),
    sourceChunk: chosen,
  };
}

/**
 * Replace every occurrence of `term` in `sentence` with MASK_TOKEN, case-insensitively.
 * Non-ASCII terms (CJK, accented) use a plain global replace because \b doesn't help
 * outside ASCII word chars; ASCII terms use a word-boundary-aware regex so e.g. masking
 * "in" doesn't shred "inflation".
 */
export function maskTerm(sentence: string, term: string): string {
  const t = term.trim();
  if (!t) return sentence;
  if (/[^\x00-\x7F]/.test(t)) {
    return globalReplaceCaseInsensitive(sentence, t, MASK_TOKEN);
  }
  const re = new RegExp(`(^|[^a-z0-9_])${escapeRegex(t)}(?=[^a-z0-9_]|$)`, 'gi');
  return sentence.replace(re, (_match, pre: string) => `${pre}${MASK_TOKEN}`);
}

function globalReplaceCaseInsensitive(
  haystack: string,
  needle: string,
  replacement: string,
): string {
  // Cheap manual loop; JS lacks a built-in case-insensitive replace for plain strings.
  let out = '';
  let i = 0;
  const lowerHay = haystack.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  while (i < haystack.length) {
    const found = lowerHay.indexOf(lowerNeedle, i);
    if (found === -1) {
      out += haystack.slice(i);
      break;
    }
    out += haystack.slice(i, found) + replacement;
    i = found + needle.length;
  }
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
