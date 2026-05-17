/**
 * Source-span verification — anti-hallucination tier 1.
 *
 * The LLM is allowed to identify terms in the user's notes, but everything it returns
 * must be grounded: the term, its source-span, and the style anchor must all be literal
 * substrings of the original notes. This check is enforced in code, never in the prompt.
 *
 * "Literal" here is intentionally lenient on cosmetic differences (Unicode form,
 * whitespace, case) but strict on content. Smart-quote substitution or a collapsed
 * newline shouldn't reject a span; a fabricated word should.
 */

export interface SpanCheckOptions {
  /** Default: false. Set true to require exact case match. */
  caseSensitive?: boolean;
  /** Default: true. Collapse runs of whitespace to a single space and trim ends. */
  collapseWhitespace?: boolean;
  /** Default: true. Apply Unicode NFKC normalization (handles smart quotes, ligatures, etc.). */
  unicodeNormalize?: boolean;
}

function normalize(s: string, opts: SpanCheckOptions): string {
  let r = s;
  if (opts.unicodeNormalize !== false) {
    r = r
      .normalize('NFKC')
      // NFKC does not fold smart punctuation. LLMs and clipboards produce these constantly,
      // so we lower them to ASCII equivalents to avoid spurious rejections.
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      .replace(/[\u2013\u2014\u2015]/g, '-')
      .replace(/\u2026/g, '...');
  }
  if (opts.collapseWhitespace !== false) r = r.replace(/\s+/g, ' ').trim();
  if (!opts.caseSensitive) r = r.toLowerCase();
  return r;
}

/**
 * Returns true iff `span` appears as a substring of `source` after lenient normalization.
 * The single most important predicate in the codebase: this is the gate that keeps the
 * LLM from inventing terms.
 */
export function verifySpan(
  span: string,
  source: string,
  opts: SpanCheckOptions = {}
): boolean {
  if (!span || !source) return false;
  return normalize(source, opts).includes(normalize(span, opts));
}

/**
 * Returns true iff `span` contains `needle` after lenient normalization.
 * Used to confirm a styleAnchor sentence actually contains the term it's meant to anchor.
 */
export function spanContains(
  span: string,
  needle: string,
  opts: SpanCheckOptions = {}
): boolean {
  return verifySpan(needle, span, opts);
}
