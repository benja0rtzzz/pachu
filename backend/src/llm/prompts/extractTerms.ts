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
}

export interface RejectedCandidate {
  candidate: TermCandidate;
  reason: 'sourceSpan-not-in-notes' | 'styleAnchor-not-in-notes' | 'styleAnchor-missing-term' | 'malformed';
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
- "term": the term itself, as it appears in the notes (a single word or short phrase, with no surrounding punctuation).
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

Rules to follow strictly:
1. Every "source_span" and "style_anchor" must be a literal substring of the notes. Do not edit punctuation. Do not change quotes. Do not add or remove words.
2. If you cannot find a sentence in the notes that literally contains the term, omit that term.
3. Do not invent terms that are not discussed in the notes.
4. Aim for around ${maxTerms} terms; fewer is fine if the notes are short.

Output ONLY valid JSON of the shape: {"terms": [{"term": "...", "definition": "...", "source_span": "...", "style_anchor": "..."}, ...]}.

Notes:
"""
${notes}
"""`;
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

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return [];
  }

  const arr: unknown =
    Array.isArray(json) ? json :
    json && typeof json === 'object' && 'terms' in json && Array.isArray((json as { terms: unknown[] }).terms)
      ? (json as { terms: unknown[] }).terms
      : [];

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
export async function extractTerms(opts: ExtractTermsOptions): Promise<ExtractTermsResult> {
  const maxTerms = opts.maxTerms ?? 20;
  const prompt = buildExtractPrompt(opts.notes, maxTerms);

  const raw = await opts.llm.chat(
    [
      { role: 'system', content: 'You output JSON only. No prose, no explanations.' },
      { role: 'user', content: prompt },
    ],
    { maxTokens: 4096 }
  );

  const candidates = parseCandidates(raw);
  const accepted: TermCandidate[] = [];
  const rejected: RejectedCandidate[] = [];

  const seenTerms = new Set<string>();

  for (const c of candidates) {
    if (!c.term || !c.sourceSpan || !c.styleAnchor) {
      rejected.push({ candidate: c, reason: 'malformed' });
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
  }

  return { accepted, rejected, rawOutput: raw };
}
