import {
  extractTerms,
  type ExtractTermsResult,
  type RejectedCandidate,
  type TermCandidate,
} from '../prompts/extractTerms.js';
import type { LlmAdapter } from '../adapter.js';

export interface IngestNotesOptions {
  llm: LlmAdapter;
  rawText: string;
  /** Soft max terms per chunk passed to the LLM. Default: 15. */
  maxTermsPerChunk?: number;
  /**
   * Max chars before splitting at paragraph boundaries. Default: 4000.
   * Most demo notes fit in one chunk; the splitter exists for real-world uploads.
   */
  chunkSize?: number;
}

export interface IngestNotesChunkDiagnostics {
  chunkIndex: number;
  chunkLength: number;
  accepted: number;
  rejected: number;
  /** Raw LLM output for this chunk — useful when nothing parses. */
  rawOutput: string;
  /** Every rejected candidate with the reason, for debugging prompt regressions. */
  rejectedCandidates: RejectedCandidate[];
}

export interface IngestNotesResult {
  /**
   * Verified, deduplicated candidates ready to pass directly to `insertTerms`.
   * No IDs or notesFileId are attached — those are the store layer's concern.
   */
  terms: TermCandidate[];
  chunks: IngestNotesChunkDiagnostics[];
  totalRejected: number;
}

/**
 * Split notes into chunks of at most `chunkSize` chars, always breaking at paragraph
 * boundaries so a single concept is never cut mid-sentence.
 * Returns a single-element array when the text fits in one chunk.
 */
export function splitIntoChunks(text: string, chunkSize: number): string[] {
  if (text.length <= chunkSize) return [text];

  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    const joined = current ? `${current}\n\n${para}` : para;
    if (joined.length > chunkSize && current) {
      chunks.push(current.trim());
      current = para;
    } else {
      current = joined;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [text];
}

/**
 * Orchestrate LLM term extraction over potentially long notes.
 *
 * Responsibilities:
 *   1. Split notes at paragraph boundaries when they exceed `chunkSize`.
 *   2. Call `extractTerms` (with its built-in anti-hallucination verifier) per chunk.
 *   3. Deduplicate across chunks so the same term doesn't appear twice.
 *
 * The caller (notes route / `POST /notes/ingest`) owns persistence:
 * it calls `createNotesFile` first, then `ingestNotes`, then `insertTerms`.
 * This keeps the LLM pipeline layer free of store imports.
 */
export async function ingestNotes(opts: IngestNotesOptions): Promise<IngestNotesResult> {
  const chunkSize = opts.chunkSize ?? 4000;
  const maxTermsPerChunk = opts.maxTermsPerChunk ?? 15;

  const chunks = splitIntoChunks(opts.rawText, chunkSize);
  const diagnostics: IngestNotesChunkDiagnostics[] = [];
  const seenTerms = new Set<string>();
  const allTerms: TermCandidate[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    const result: ExtractTermsResult = await extractTerms({
      llm: opts.llm,
      notes: chunk,
      maxTerms: maxTermsPerChunk,
    });

    for (const candidate of result.accepted) {
      const key = candidate.term.toLowerCase();
      if (!seenTerms.has(key)) {
        seenTerms.add(key);
        allTerms.push(candidate);
      }
    }

    diagnostics.push({
      chunkIndex: i,
      chunkLength: chunk.length,
      accepted: result.accepted.length,
      rejected: result.rejected.length,
      rawOutput: result.rawOutput,
      rejectedCandidates: result.rejected,
    });
  }

  return {
    terms: allTerms,
    chunks: diagnostics,
    totalRejected: diagnostics.reduce((sum, d) => sum + d.rejected, 0),
  };
}
