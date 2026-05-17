import type { IngestRequest, IngestResponse } from '@pachu/shared';
import { apiFetch } from './client';

/**
 * Create a new `Space` from raw notes. The backend ingest endpoint is
 * LLM-free — it just persists `{title, content}` and returns a zero-term
 * Space. Term extraction is a separate explicit call (see
 * `extractSpaceTerms` in `./spaces.ts`); the NotesImport screen chains
 * the two so a successful "Create space" tap lands in a fully-populated
 * space.
 */
export async function ingestNotes(body: IngestRequest): Promise<IngestResponse> {
  return apiFetch<IngestResponse>('/notes/ingest', {
    method: 'POST',
    body,
  });
}
