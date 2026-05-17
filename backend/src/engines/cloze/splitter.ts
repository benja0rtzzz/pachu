/**
 * Extract a window of text from raw notes centred on a `sourceSpan`.
 *
 * The resulting chunk is passed to `generateClozeSentence` as the grounding
 * source — it gives the LLM enough surrounding context to write a grounded
 * sentence while keeping the prompt tight.
 *
 * The search is case-insensitive so minor casing drifts between what the
 * span-verifier accepted and the raw bytes don't cause a miss.
 */
export function extractSourceChunk(
  rawNotes: string,
  sourceSpan: string,
  windowChars = 500,
): string {
  const notesLower = rawNotes.toLowerCase();
  const spanLower = sourceSpan.trim().toLowerCase();

  const idx = notesLower.indexOf(spanLower);

  // sourceSpan was already verified to be a substring of rawNotes; this branch
  // is a safety net for callers that pass unverified spans in tests.
  if (idx === -1) return sourceSpan;

  const start = Math.max(0, idx - windowChars);
  const end = Math.min(rawNotes.length, idx + spanLower.length + windowChars);
  return rawNotes.slice(start, end).trim();
}
