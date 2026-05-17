/**
 * Minimal sentence splitter for cloze "anchored mode" candidate sentences.
 *
 * Anchored mode wants ONE sentence from the user's notes that contains the term, with the
 * term masked. Most of the time `term.styleAnchor` is exactly that sentence (the term
 * extractor stores the original-context sentence there). This module is the safety net
 * for the edge cases where `styleAnchor` doesn't actually contain the term — e.g. the
 * extractor used a paragraph instead of a sentence, or the term appears in plural form in
 * the notes. We then scan `notes.rawText` for the first sentence that does include the
 * term and use that.
 *
 * The splitter is intentionally simple: split on `.`, `!`, `?`, `\n`, plus the Japanese
 * fullstop `。`. It does not try to be linguistically correct (no Mr./Dr. logic); the
 * cost of a slightly long "sentence" is far lower than the cost of an empty cloze.
 */
const SENTENCE_TERMINATORS = /(?<=[.!?。])\s+|\n+/;

export function splitSentences(text: string): string[] {
  return text
    .split(SENTENCE_TERMINATORS)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Case-insensitive substring search with word-boundary handling so "Hiragana" doesn't
 * match inside e.g. "Hiraganas" while still tolerating punctuation right after the term.
 * Falls back to a plain `includes` for terms that contain non-ASCII (e.g. CJK) where word
 * boundaries don't apply.
 */
export function sentenceContainsTerm(sentence: string, term: string): boolean {
  const t = term.trim();
  if (!t) return false;
  const s = sentence.toLowerCase();
  const needle = t.toLowerCase();
  // For non-ASCII terms (kanji, kana, accented letters) plain substring is the safe call;
  // \b doesn't behave usefully outside the ASCII word-char set.
  if (/[^\x00-\x7F]/.test(needle)) {
    return s.includes(needle);
  }
  const re = new RegExp(`(?:^|[^a-z0-9_])${escapeRegex(needle)}(?:[^a-z0-9_]|$)`, 'i');
  return re.test(sentence);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Find the first sentence in `text` that contains `term`, or null when none does.
 */
export function findSentenceContaining(text: string, term: string): string | null {
  for (const s of splitSentences(text)) {
    if (sentenceContainsTerm(s, term)) return s;
  }
  return null;
}
