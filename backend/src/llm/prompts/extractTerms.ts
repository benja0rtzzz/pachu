import type { LlmAdapter } from '../adapter.js';
import { spanContains, verifySpan } from '../verify/spanCheck.js';

/**
 * A candidate term returned by the LLM, before verification.
 * The shape mirrors the eventual `Term` in shared/types.ts, minus the runtime ids
 * (which the orchestrator assigns after extraction).
 */
export interface TermCandidate {
  term: string;
  definition: string;
  sourceSpan: string;
  styleAnchor: string;
}

export interface ExtractTermsOptions {
  llm: LlmAdapter;
  notes: string;
  /** Soft target for the LLM; the verifier may drop some, so the actual count varies. */
  maxTerms?: number;
  /** Progress callback fired during candidate verification (1-based current). */
  onVerifyProgress?: (current: number, total: number) => void;
  /** Progress callback fired as the model streams, with running token count. */
  onModelProgress?: (tokens: number) => void;
}

export interface RejectedCandidate {
  candidate: TermCandidate;
  reason:
    | 'sourceSpan-not-in-notes'
    | 'styleAnchor-not-in-notes'
    | 'styleAnchor-missing-term'
    | 'term-too-long'
    | 'term-not-single-word'
    | 'malformed';
}

// A "term" is something you guess in one blank — not a heading or a sentence.
// The LLM frequently grabs an entire title (e.g. "Triton Experimental
// Development") which then makes a 29-letter cloze blank and an unreadable
// crossword. Trust code, not the prompt: hard-reject anything past these
// bounds regardless of what the model returned. 19-letter file names were
// still slipping through at 24, so the answer-length cap is now 12.
const MAX_TERM_LETTERS = 12;

// Puzzle answers must be ONE word — no spaces. A spaced answer renders a
// stray space cell in the cloze grid and makes crosswords unplaceable.
function termHasSpace(term: string): boolean {
  return /\s/.test(term.trim());
}

function termTooLong(term: string): boolean {
  const letters = term.replace(/[^\p{L}\p{N}]/gu, '');
  return letters.length > MAX_TERM_LETTERS;
}

export interface ExtractTermsResult {
  /** Candidates that passed every verification rule. Safe to persist. */
  accepted: TermCandidate[];
  /** Candidates that failed verification, with the reason. Useful for debugging the prompt. */
  rejected: RejectedCandidate[];
  /** Raw LLM output, for diagnostics when nothing parses. */
  rawOutput: string;
}

/**
 * Build the extractor prompt. The prompt is constraint-heavy on purpose — we still trust
 * code, not the prompt, but a clearer prompt yields fewer rejections downstream.
 *
 * Note: the prompt does NOT promise that violating these rules will be rejected. We tell
 * the model what we want, then verify in code. Telling the model "you will be punished"
 * is theatrical; the verifier is the actual gate.
 */
function buildExtractPrompt(notes: string, maxTerms: number): string {
  return `You are a study-aid extractor. Read the notes below and identify the most useful terms a student should learn.

For each term, return four fields:
- "term": the term itself, as it appears in the notes. It MUST be exactly ONE word — no spaces, about 12 characters or fewer. NEVER use a phrase, a document title, a heading, a full sentence, a file name, or a long proper-noun string — pick the single most specific concept word inside it instead.
- "definition": a brief explanation derived from the notes context (one or two sentences). Match the register of the notes.
- "source_span": a short fragment of the notes that contains or defines the term. This MUST be copy-pasted from the notes — same words, same punctuation, same capitalization.
- "style_anchor": ONE complete sentence from the notes that mentions the term, copy-pasted verbatim. The sentence MUST contain the term.

EXAMPLE — given these notes:
"""
Hiragana is the rounded one, used for grammar bits and Japanese words. Konnichiwa is the daytime hello.
"""

CORRECT output:
{
  "terms": [
    {
      "term": "Hiragana",
      "definition": "The rounded Japanese script, used for grammar bits and Japanese words.",
      "source_span": "Hiragana is the rounded one, used for grammar bits and Japanese words.",
      "style_anchor": "Hiragana is the rounded one, used for grammar bits and Japanese words."
    }
  ]
}

INCORRECT outputs that will be REJECTED by the verifier:
- "source_span": "Hiragana - the rounded one"           ← added a dash that isn't in the notes
- "source_span": "Hiragana, used for grammar"           ← added a comma; words rearranged
- "source_span": "Hiragana is rounded"                  ← words removed
- "style_anchor": "Hiragana is rounded and used for grammar"  ← paraphrased, not in notes
- "term": "Particle marker"                             ← compound term not literally in notes
- "term": "Triton Experimental Development (TRIED)"      ← that's a title/heading, far too long for one blank

Rules to follow strictly:
1. Every "source_span" and "style_anchor" must be a literal substring of the notes. Do not edit punctuation. Do not change quotes. Do not add or remove words.
2. If you cannot find a sentence in the notes that literally contains the term, omit that term.
3. Do not invent terms that are not discussed in the notes.
4. Aim for around ${maxTerms} terms; fewer is fine if the notes are short.
5. Each "term" MUST be a single word with no spaces (e.g. "mitochondria", not "the mitochondria organelle"; "photosynthesis", not "light reaction"). If a concept is only expressed as a phrase, pick the single most distinctive word from it. Multi-word terms are discarded.

Output ONLY valid JSON of the shape: {"terms": [{"term": "...", "definition": "...", "source_span": "...", "style_anchor": "..."}, ...]}.

Notes:
"""
${notes}
"""`;
}

/**
 * Recover flat `{...}` objects from a malformed/truncated blob. Term objects
 * have no nested braces, so a brace-free object regex grabs each complete one
 * and naturally drops the final truncated object. Used only when JSON.parse
 * fails (model ran past its token budget mid-array).
 */
function salvageObjects(text: string): unknown[] {
  const out: unknown[] = [];
  const re = /\{[^{}]*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    try {
      const obj: unknown = JSON.parse(m[0]);
      if (obj && typeof obj === 'object') out.push(obj);
    } catch {
      // skip garbled fragment
    }
  }
  return out;
}

/**
 * Parse the LLM's JSON output into TermCandidate[]. Tolerant of common shapes:
 * top-level array, {terms: [...]}, or a single object.
 */
function parseCandidates(raw: string): TermCandidate[] {
  let text = raw.trim();
  // Some models wrap JSON in fenced blocks even with format=json; strip just in case.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) text = fence[1].trim();

  let arr: unknown[];
  try {
    const json: unknown = JSON.parse(text);
    arr =
      Array.isArray(json) ? json :
      json && typeof json === 'object' && 'terms' in json && Array.isArray((json as { terms: unknown[] }).terms)
        ? (json as { terms: unknown[] }).terms
        : [];
  } catch {
    // Truncated/over-long output (model hit num_predict mid-array). Salvage
    // every complete top-level {...} object instead of dropping everything.
    arr = salvageObjects(text);
  }

  if (!Array.isArray(arr)) return [];

  const out: TermCandidate[] = [];
  for (const row of arr) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const term = typeof r.term === 'string' ? r.term.trim() : '';
    const definition = typeof r.definition === 'string' ? r.definition.trim() : '';
    const sourceSpan =
      typeof r.source_span === 'string' ? r.source_span.trim() :
      typeof r.sourceSpan === 'string' ? r.sourceSpan.trim() : '';
    const styleAnchor =
      typeof r.style_anchor === 'string' ? r.style_anchor.trim() :
      typeof r.styleAnchor === 'string' ? r.styleAnchor.trim() : '';
    if (!term || !sourceSpan || !styleAnchor) continue;
    out.push({ term, definition, sourceSpan, styleAnchor });
  }
  return out;
}

/**
 * Extract verified term candidates from notes using the LLM.
 *
 * Anti-hallucination contract (tier 1) is enforced here:
 *   - sourceSpan must be a literal substring of the notes.
 *   - styleAnchor must be a literal substring of the notes.
 *   - styleAnchor must literally contain the term (so it can drive register mimicry later).
 * Anything else is silently rejected; rejections are surfaced for diagnostics, not errors.
 */
/** Hard ceiling on accepted terms regardless of how many the LLM returns. */
const MAX_ACCEPTED_TERMS = 60;

export async function extractTerms(opts: ExtractTermsOptions): Promise<ExtractTermsResult> {
  const maxTerms = opts.maxTerms ?? 20;
  const prompt = buildExtractPrompt(opts.notes, maxTerms);

  const raw = await opts.llm.chat(
    [
      { role: 'system', content: 'You output JSON only. No prose, no explanations.' },
      { role: 'user', content: prompt },
    ],
    // ~34 terms × 4 fields (with verbatim sentences) overruns 4096 and the
    // JSON truncates; give it real headroom (salvageObjects covers the rest).
    { maxTokens: 12288, onProgress: opts.onModelProgress }
  );

  const candidates = parseCandidates(raw);
  const accepted: TermCandidate[] = [];
  const rejected: RejectedCandidate[] = [];

  const seenTerms = new Set<string>();

  const total = candidates.length;
  let verified = 0;
  for (const c of candidates) {
    opts.onVerifyProgress?.(++verified, total);
    if (!c.term || !c.sourceSpan || !c.styleAnchor) {
      rejected.push({ candidate: c, reason: 'malformed' });
      continue;
    }
    if (termHasSpace(c.term)) {
      rejected.push({ candidate: c, reason: 'term-not-single-word' });
      continue;
    }
    if (termTooLong(c.term)) {
      rejected.push({ candidate: c, reason: 'term-too-long' });
      continue;
    }
    if (!verifySpan(c.sourceSpan, opts.notes)) {
      rejected.push({ candidate: c, reason: 'sourceSpan-not-in-notes' });
      continue;
    }
    if (!verifySpan(c.styleAnchor, opts.notes)) {
      rejected.push({ candidate: c, reason: 'styleAnchor-not-in-notes' });
      continue;
    }
    if (!spanContains(c.styleAnchor, c.term)) {
      rejected.push({ candidate: c, reason: 'styleAnchor-missing-term' });
      continue;
    }
    const key = c.term.toLowerCase();
    if (seenTerms.has(key)) continue;
    seenTerms.add(key);
    accepted.push(c);
    if (accepted.length >= MAX_ACCEPTED_TERMS) break;
  }

  return { accepted, rejected, rawOutput: raw };
}
