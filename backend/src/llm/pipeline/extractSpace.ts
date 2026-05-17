/**
 * Shared term-extraction pipeline. The single source of truth behind BOTH the
 * REST route (`POST /spaces/:id/extract`) and the `/extract` WebSocket. Status
 * codes mirror the original route so callers branch identically.
 */
import type { ExtractStage, Space } from '@pachu/shared';
import type { LlmAdapter } from '../adapter.js';
import { extractTerms } from '../prompts/extractTerms.js';
import { computeSpaceSummary } from '../../memory/spaceSummary.js';
import {
  countTermsByNotesFile,
  getNotesFileWithText,
  insertTerms,
} from '../../store/index.js';

export type ExtractStageEvent = {
  stage: ExtractStage;
  current?: number;
  total?: number;
};

export type RunSpaceExtractionResult =
  | { ok: true; space: Space; acceptedCount: number; rejectedCount: number }
  | { ok: false; status: 404 | 409 | 422 | 502; error: string; rejectedCount?: number };

export interface RunSpaceExtractionOptions {
  spaceId: string;
  llm: LlmAdapter;
  maxTerms: number;
  /** Stage callback; safe to ignore (REST route passes nothing). */
  onStage?: (ev: ExtractStageEvent) => void;
}

export async function runSpaceExtraction(
  opts: RunSpaceExtractionOptions,
): Promise<RunSpaceExtractionResult> {
  const emit = (ev: ExtractStageEvent) => opts.onStage?.(ev);

  emit({ stage: 'preparing' });
  const note = getNotesFileWithText(opts.spaceId);
  if (!note) return { ok: false, status: 404, error: 'not found' };

  if (countTermsByNotesFile(opts.spaceId) > 0) {
    return {
      ok: false,
      status: 409,
      error:
        'space already has extracted terms; delete the space and re-ingest to re-extract',
    };
  }

  let accepted: Awaited<ReturnType<typeof extractTerms>>['accepted'];
  let rejectedCount: number;
  try {
    emit({ stage: 'calling-model' });
    const result = await extractTerms({
      llm: opts.llm,
      notes: note.rawText,
      maxTerms: opts.maxTerms,
      onVerifyProgress: (current, total) =>
        emit({ stage: 'verifying', current, total }),
    });
    accepted = result.accepted;
    rejectedCount = result.rejected.length;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'extractor failure';
    return { ok: false, status: 502, error: message };
  }

  if (accepted.length === 0) {
    return {
      ok: false,
      status: 422,
      error:
        'not enough information in notes to extract terms — the LLM produced no candidates that passed verification. Try richer or longer notes.',
      rejectedCount,
    };
  }

  emit({ stage: 'persisting' });
  insertTerms(opts.spaceId, accepted);

  const space: Space = {
    id: note.id,
    title: note.title,
    createdAt: note.createdAt,
    byteLength: note.byteLength,
    summary: computeSpaceSummary(note.id),
  };
  return { ok: true, space, acceptedCount: accepted.length, rejectedCount };
}
