import type { LlmAdapter } from '../adapter.js';

export interface GenerateClueOptions {
  llm: LlmAdapter;
  term: string;
  /** Brief explanation derived from the notes; the clue paraphrases this. */
  definition: string;
  /** The original sentence the term appeared in; drives register mimicry. */
  styleAnchor: string;
  /** Soft cap on clue length. Default 120 chars. */
  maxLen?: number;
}

export interface GenerateClueResult {
  clue: string;
  /** Whether the clue passed our basic sanity checks (length + no term-in-clue). */
  ok: boolean;
  raw: string;
}

const TERM_LEAK_PADDING = /[\s.,;:!?'"()-]/;

/**
 * Naive substring match adjusted to ignore embedded mentions of the term.
 * Used to reject clues that give away the answer.
 */
function clueMentionsTerm(clue: string, term: string): boolean {
  const c = clue.toLowerCase();
  const t = term.toLowerCase();
  if (!c.includes(t)) return false;
  // Reject only if the term appears as a standalone word, not as a coincidental substring
  // (e.g. "art" inside "particle"). We require the surrounding chars to be punctuation/space
  // or string boundary on both sides.
  let from = 0;
  while (from <= c.length - t.length) {
    const idx = c.indexOf(t, from);
    if (idx < 0) return false;
    const before = idx === 0 ? ' ' : c[idx - 1] ?? ' ';
    const afterIdx = idx + t.length;
    const after = afterIdx >= c.length ? ' ' : c[afterIdx] ?? ' ';
    if (TERM_LEAK_PADDING.test(before) && TERM_LEAK_PADDING.test(after)) return true;
    from = idx + 1;
  }
  return false;
}

function buildCluePrompt(
  term: string,
  definition: string,
  styleAnchor: string,
  maxLen: number
): string {
  return `Write ONE concise crossword clue for the term "${term}". The clue is a short hint — under ${maxLen} characters — that points to the answer without saying it.

EXAMPLE — for term "Hiragana", definition "rounded Japanese script for grammar particles", style anchor "Hiragana is the rounded one, used for grammar bits and Japanese words.":

CORRECT clues (any of these would work):
- The rounded one, used for grammar
- Curvy script for Japanese particles
- Where you write tabemasu

INCORRECT clues:
- The Hiragana script for grammar         ← contains the term itself
- Japanese writing                          ← too vague, several scripts fit
- A long-winded explanation of how Hiragana evolved from cursive Chinese characters used by Heian-era court women, eventually becoming...   ← too long

Rules:
1. Match the register, vocabulary level, and tone of this example sentence from the user's notes:
   "${styleAnchor}"
2. NEVER include the term "${term}" anywhere in the clue.
3. Stay faithful to this definition (paraphrase — do not just copy it):
   "${definition}"
4. Be concise. One clue, one line, under ${maxLen} characters.

Return ONLY the clue text. No quotes, no labels, no explanation.`;
}

function cleanClue(raw: string): string {
  let s = raw.trim();
  const fence = s.match(/```(?:\w+)?\s*([\s\S]*?)```/);
  if (fence?.[1]) s = fence[1].trim();
  // Drop "Clue:" / "Answer:" prefixes some models add.
  s = s.replace(/^(?:clue|answer|crossword clue)\s*[:\-]\s*/i, '');
  s = s.replace(/^["'\u201C\u2018]+/, '').replace(/["'\u201D\u2019]+$/, '').trim();
  // First line only.
  s = (s.split(/\r?\n/)[0] ?? s).trim();
  return s;
}

/**
 * Generate a crossword clue for a term in the register of the user's notes.
 *
 * Sanity checks (not full grounding — crossword clues are intentionally creative):
 *  - The clue must not contain the term as a standalone word.
 *  - The clue must be non-empty and not absurdly long.
 */
export async function generateCrosswordClue(
  opts: GenerateClueOptions
): Promise<GenerateClueResult> {
  const maxLen = opts.maxLen ?? 120;
  const prompt = buildCluePrompt(opts.term, opts.definition, opts.styleAnchor, maxLen);

  const raw = await opts.llm.chat(
    [
      {
        role: 'system',
        content:
          'You are a crossword clue writer. You produce one clue at a time, never with quotes around it, never repeating the answer.',
      },
      { role: 'user', content: prompt },
    ],
    { maxTokens: 80 }
  );

  const clue = cleanClue(raw);
  const ok =
    clue.length > 0 &&
    clue.length <= maxLen + 40 && // soft tolerance
    !clueMentionsTerm(clue, opts.term);

  return { clue, ok, raw };
}
