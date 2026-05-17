/**
 * Grounding verification — anti-hallucination tier 2.
 *
 * For generated cloze sentences (and any other LLM-written content where we want to
 * guarantee no new facts), this verifier extracts the "factual" entities from the
 * generated text — capitalized words (proper nouns), digits, and date-shaped tokens —
 * and confirms every one of them appears in the source chunk.
 *
 * If any entity is "ungrounded" (i.e. not in the source), the engine treats this as a
 * verification failure and silently falls back to anchored mode. The verifier never
 * returns a generated sentence to the user; either it's clean or we don't use it.
 *
 * This is a heuristic, not a proof. It catches the common hallucination shapes (invented
 * names, dates, numerical claims) that gemma4:26b tends to produce when temperature
 * climbs. It will miss claims expressed only in lowercase prose (e.g. "the most common
 * sustained arrhythmia in elderly patients" when the source says "the most common
 * sustained arrhythmia"). For those, the styleAnchor mimicry pressure does most of the
 * heavy lifting; this verifier is the safety net for the common failure modes.
 */

const STOP_CAPS = new Set([
  // English pronouns / articles / determiners that are almost always at sentence start
  // and carry no factual load. We exclude them from entity extraction so a casual source
  // like "I think wa marks the topic" doesn't fail to ground common words.
  'A', 'An', 'And', 'As', 'At', 'Be', 'But', 'By',
  'For', 'From', 'He', 'Her', 'His', 'How',
  'I', 'If', 'In', 'Is', 'It', 'Its',
  'My', 'No', 'Not', 'Of', 'On', 'Or', 'Our',
  'She', 'So', 'That', 'The', 'Their', 'Them', 'These', 'They', 'This', 'Those', 'To',
  'We', 'What', 'When', 'Where', 'Which', 'While', 'Who', 'Why', 'With',
  'Yes', 'You', 'Your',
]);

export interface GroundingResult {
  ok: boolean;
  /** Entities found in the generated text but not in the source. Empty when ok=true. */
  ungrounded: string[];
}

/**
 * Extract candidate "factual" tokens from a sentence.
 * Conservative: capitalized words length ≥ 2 (excluding stop-words) + numeric tokens.
 */
export function extractEntities(text: string): string[] {
  const out = new Set<string>();
  // Strip square-bracketed placeholders ([MASK], [BLANK], [...]) so the cloze hole is
  // never treated as a fabricated abbreviation.
  const t = text.normalize('NFKC').replace(/\[[^\]]*\]/g, ' ');

  // Capitalized words: optionally with internal lowercase letters and apostrophes.
  // e.g. "Atrial", "Sir", "USA" (all-caps), "O'Brien".
  for (const m of t.matchAll(/\b[A-Z][A-Za-z][A-Za-z'\u2019]*\b/g)) {
    const tok = m[0];
    if (STOP_CAPS.has(tok)) continue;
    out.add(tok);
  }

  // Pure-uppercase abbreviations of length 2+ (ECG, CHA2DS2-VASc, USA).
  // Note: matchAll above already captures these because [A-Z][A-Za-z]+ matches.
  // We add a second pass for tokens with embedded digits (e.g. CHA2DS2).
  for (const m of t.matchAll(/\b[A-Z]{2,}[A-Z0-9-]*\b/g)) {
    out.add(m[0]);
  }

  // Numeric tokens: integers and decimals (e.g. 1862, 3.14, 65).
  for (const m of t.matchAll(/\b\d+(?:\.\d+)?\b/g)) {
    out.add(m[0]);
  }

  // Ordinals (1st, 22nd, 3rd, 4th). `\b...\b` works here because letters are word chars.
  for (const m of t.matchAll(/\b\d+(?:st|nd|rd|th)\b/gi)) {
    out.add(m[0]);
  }

  // Percentages — `%` is non-word so we can't rely on a trailing `\b`.
  for (const m of t.matchAll(/\b\d+(?:\.\d+)?%/g)) {
    out.add(m[0]);
  }

  // Years are caught by the numeric pattern; explicit month names are caught by the
  // capitalized-word pattern. We don't need a separate date pass.

  return [...out];
}

/**
 * Verify that every entity in the generated text appears in the source chunk
 * (case-insensitive substring check after NFKC normalization).
 */
export function verifyGrounding(generated: string, source: string): GroundingResult {
  const entities = extractEntities(generated);
  if (entities.length === 0) return { ok: true, ungrounded: [] };

  const norm = (s: string) => s.normalize('NFKC').toLowerCase();
  const sourceNorm = norm(source);

  const ungrounded = entities.filter((e) => !sourceNorm.includes(norm(e)));
  return { ok: ungrounded.length === 0, ungrounded };
}
