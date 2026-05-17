import type { LlmAdapter } from '../adapter.js';

export interface CoachHintInput {
  llm: LlmAdapter;
  term: string;
  definition: string;
  styleAnchor: string;
  /** What the learner did. e.g. "filled MITOCHONDRIA where the answer was apoptosis". */
  observation?: string;
}

export interface CoachHints {
  /** Tier 1 — structural pattern. Computed deterministically from the term itself. */
  tier1: string;
  /** Tier 2 — contextual nudge. LLM-generated, register mimicked from styleAnchor;
   *  references something else from the note without revealing the term. */
  tier2: string;
}

/**
 * Compute a structural hint that doesn't reveal the answer:
 *   "9 letters, starts with A, ends with S, contains 1 word"
 *
 * This is deterministic on purpose — no LLM needed, no chance of leaking the term.
 */
export function computeStructuralHint(term: string): string {
  const trimmed = term.trim();
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  const letters = trimmed.replace(/\s+/g, '');
  const len = letters.length;
  const first = letters[0]?.toUpperCase() ?? '?';
  const last = letters[len - 1]?.toUpperCase() ?? '?';
  const wordWord = wordCount === 1 ? 'word' : 'words';
  return `${len} letters, starts with ${first}, ends with ${last}, ${wordCount} ${wordWord}.`;
}

function buildNudgePrompt(
  term: string,
  definition: string,
  styleAnchor: string,
  observation?: string
): string {
  return `The learner is stuck on a term. Write ONE short encouraging sentence that nudges them toward the answer without revealing it.

EXAMPLE — for term "Hiragana" (a script for grammar particles), style anchor "Hiragana is the rounded one, used for grammar bits and Japanese words.":

CORRECT nudges (any of these work):
- Think about which script you'd use to write the small words between nouns.
- The shape is rounded, not angular.
- It's the script you'd use for tabemasu, not for coffee.

INCORRECT nudges (will be auto-redacted):
- The answer is Hiragana.                          ← reveals the term
- Hint: Hi-rag-a-na.                                ← spells it out
- It starts with H and ends with A.                ← that's a structural hint, not a nudge

Rules to follow strictly:
1. Do NOT use the term "${term}" anywhere in your response.
2. Do NOT spell out part of the term or hint at letters.
3. Match the register, formality, and tone of this example from the learner's own notes:
   "${styleAnchor}"
4. The term means: ${definition}
${observation ? `5. The learner's recent attempt: ${observation}\n` : ''}
Return ONLY the nudge sentence. No quotes, no labels, no preamble.`;
}

function cleanNudge(raw: string, term: string): string {
  let s = raw.trim();
  const fence = s.match(/```(?:\w+)?\s*([\s\S]*?)```/);
  if (fence?.[1]) s = fence[1].trim();
  s = s.replace(/^["'\u201C\u2018]+/, '').replace(/["'\u201D\u2019]+$/, '').trim();
  s = (s.split(/\r?\n/)[0] ?? s).trim();

  // Cheap leak check — if the model put the term in the nudge, replace it with a placeholder
  // rather than risk surfacing the answer. The orchestrator can still escalate to tier 2/3.
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  s = s.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), '[the answer]');
  return s;
}

/**
 * Build a two-tier hint package for a stuck learner.
 * tier1 is the deterministic structural pattern (no LLM, can't leak the term);
 * tier2 is an LLM-generated, register-mimicked nudge that references other
 * context from the note. There is no definition-reveal tier — "Reveal" is the
 * escape hatch the puzzle screens own. Callers escalate tiers in response to
 * repeated `hint_request` events.
 */
export async function generateCoachHints(opts: CoachHintInput): Promise<CoachHints> {
  const prompt = buildNudgePrompt(opts.term, opts.definition, opts.styleAnchor, opts.observation);

  const raw = await opts.llm.chat(
    [
      {
        role: 'system',
        content:
          'You are a patient tutor. You give one short hint, never the answer, and you mirror the learner\'s notes in tone.',
      },
      { role: 'user', content: prompt },
    ],
    { maxTokens: 80 }
  );

  return {
    tier1: computeStructuralHint(opts.term),
    tier2: cleanNudge(raw, opts.term),
  };
}
