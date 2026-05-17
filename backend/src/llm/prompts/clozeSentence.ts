import type { LlmAdapter } from '../adapter.js';
import { verifyGrounding } from '../verify/grounding.js';

export interface GenerateClozeOptions {
  llm: LlmAdapter;
  term: string;
  sourceChunk: string;
  /** Original sentence the term appeared in. Drives register mimicry. */
  styleAnchor: string;
  /** Default: '[MASK]'. The token used to hide the answer. */
  maskToken?: string;
}

export interface GenerateClozeResult {
  /** The generated sentence with the mask token in place of the term. */
  sentence: string;
  /** Whether the grounding verifier accepted the sentence. */
  passedVerification: boolean;
  /** Entities the verifier flagged as ungrounded. Empty when passedVerification=true. */
  ungrounded: string[];
  /** Raw LLM output, for diagnostics. */
  raw: string;
}

/**
 * Build the source-mimicry cloze prompt. The LLM is constrained to:
 *   1. Replace the term with the mask token.
 *   2. Match the register, formality, and length of the user's own example sentence.
 *   3. Not introduce facts (proper nouns, dates, numbers) absent from the source chunk.
 *
 * Constraints in the prompt are advisory; the actual contract is enforced in code by
 * verifyGrounding(). On failure the caller falls back to anchored mode.
 */
function buildClozePrompt(
  term: string,
  sourceChunk: string,
  styleAnchor: string,
  maskToken: string
): string {
  return `Write ONE sentence that tests whether a reader knows the meaning of "${term}". Replace the term with ${maskToken}. Do not include the term anywhere else in the sentence.

EXAMPLE — for term "atrial fibrillation" with style anchor "Atrial fibrillation is the most common sustained arrhythmia." and source chunk mentioning "ECG" and "RR intervals":

CORRECT output:
${maskToken} typically presents on ECG with absent P waves and irregular RR intervals.

INCORRECT outputs (will be REJECTED):
- ${maskToken} was first described by Sir Thomas Lewis in 1909.   ← adds Sir Thomas Lewis and 1909, NOT in source chunk
- About 33 percent of patients with ${maskToken} are over 70.    ← adds "33 percent" and "70", NOT in source chunk
- Atrial fibrillation typically presents with irregular pulse.    ← uses the term itself instead of ${maskToken}

Rules to follow strictly:
1. Match the vocabulary level, formality, sentence length, and tone of this example sentence from the user's own notes:
   "${styleAnchor}"
2. Do NOT introduce any proper nouns, dates, numbers, or specific claims that are not present in this source chunk:
   """
   ${sourceChunk}
   """
3. The masked answer MUST be exactly ${maskToken}. Do not write the term itself.

Return ONLY the single sentence. No quotes, no labels, no explanation.`;
}

/**
 * Trim the LLM output to a single clean sentence.
 *  - Strips wrapping quotes / backticks.
 *  - Keeps only the first sentence-like fragment if the model rambled.
 */
function cleanSentence(raw: string): string {
  let s = raw.trim();
  // Drop fenced code blocks if present.
  const fence = s.match(/```(?:\w+)?\s*([\s\S]*?)```/);
  if (fence?.[1]) s = fence[1].trim();
  // Strip wrapping quotes.
  s = s.replace(/^["'\u201C\u2018]+/, '').replace(/["'\u201D\u2019]+$/, '').trim();
  // If the model returned multiple sentences, keep the first one.
  // Very rough: split on sentence-ending punctuation followed by whitespace + capital.
  const split = s.match(/^[\s\S]*?[.!?](?=\s+[A-Z]|\s*$)/);
  if (split?.[0]) s = split[0].trim();
  return s;
}

/**
 * Generate a cloze sentence whose register mimics the term's styleAnchor and whose
 * factual content is grounded in sourceChunk. Returns whether grounding passed; the
 * caller (Cloze engine) falls back to anchored mode on failure.
 */
export async function generateClozeSentence(
  opts: GenerateClozeOptions
): Promise<GenerateClozeResult> {
  const mask = opts.maskToken ?? '[MASK]';
  const prompt = buildClozePrompt(opts.term, opts.sourceChunk, opts.styleAnchor, mask);

  const raw = await opts.llm.chat(
    [
      {
        role: 'system',
        content:
          'You are a careful writing tool. You produce one sentence at a time, in the requested style, with no explanation.',
      },
      { role: 'user', content: prompt },
    ],
    { maxTokens: 160 }
  );

  const sentence = cleanSentence(raw);
  const grounding = verifyGrounding(sentence, opts.sourceChunk);

  return {
    sentence,
    passedVerification: grounding.ok && sentence.includes(mask),
    ungrounded: grounding.ungrounded,
    raw,
  };
}
