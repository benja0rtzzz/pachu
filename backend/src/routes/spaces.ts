/**
 * Spaces routes. A `Space` is the user-facing object: notes metadata + computed
 * `SpaceSummary`. `Space.id === notes_files.id`; we don't add a separate `spaces` table.
 *
 * Endpoint shapes are pinned by `shared/src/types.ts` and documented in `docs/API.md`.
 * The summary is computed on every read — it's a few cheap SQL queries and one JS pass
 * over the per-term FSRS blobs, and avoiding a stale cache is worth more than the
 * microseconds we'd save.
 */
import { Router } from 'express';
import type { ExtractTermsResponse, Space } from '@pachu/shared';
import type { LlmAdapter } from '../llm/adapter.js';
import { extractTerms } from '../llm/prompts/extractTerms.js';
import { computeSpaceSummary } from '../memory/spaceSummary.js';
import {
  countTermsByNotesFile,
  deleteNotesFile,
  getNotesFile,
  getNotesFileWithText,
  insertTerms,
  listNotesFiles,
  updateNotesFileTitle,
} from '../store/index.js';

function toSpace(meta: {
  id: string;
  title: string;
  createdAt: string;
  byteLength: number;
}, now?: Date): Space {
  return { ...meta, summary: computeSpaceSummary(meta.id, now) };
}

/** Soft target for the extractor. Matches the default inside `extractTerms`. */
const EXTRACT_MAX_TERMS = 20;

export function spacesRouter(opts: { llm: LlmAdapter }): Router {
  const r = Router();

  r.get('/', (_req, res) => {
    const now = new Date();
    const spaces = listNotesFiles().map((n) => toSpace(n, now));
    res.json({ spaces });
  });

  r.get('/:id', (req, res) => {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'id required' });
      return;
    }
    const note = getNotesFile(id);
    if (!note) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.json(toSpace(note));
  });

  r.patch('/:id', (req, res) => {
    const id = req.params.id;
    const body = req.body as { title?: unknown } | undefined;
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    if (!id) {
      res.status(400).json({ error: 'id required' });
      return;
    }
    if (!title) {
      res.status(400).json({ error: 'title is required (non-empty string)' });
      return;
    }
    const ok = updateNotesFileTitle(id, title);
    if (!ok) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    const note = getNotesFile(id);
    if (!note) {
      // Race: the row was deleted between UPDATE and SELECT. Treat as 404.
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.json(toSpace(note));
  });

  r.delete('/:id', (req, res) => {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'id required' });
      return;
    }
    const ok = deleteNotesFile(id);
    if (!ok) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.status(204).send();
  });

  /**
   * Extract terms from a space's stored raw notes.
   *
   * The route is the single bridge between Person B's verified `extractTerms` prompt and
   * the term store. We deliberately do NOT force-fit: if the LLM produces zero candidates
   * that pass the tier-1 span verifier, we return 422 with the rejection count instead of
   * persisting noise. The decision log calls this out — "don't hallucinate or try to
   * force it" is sacred to the source-of-truth guarantee.
   *
   * Idempotency: re-extraction on top of existing terms is blocked with 409. The client
   * can `DELETE /spaces/:id` and re-ingest to retry. This is intentional for the
   * hackathon — we don't yet have a merge story for FSRS state across an old + new term
   * set, and silently inserting duplicates would corrupt the term picker.
   */
  r.post('/:id/extract', async (req, res) => {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'id required' });
      return;
    }

    const note = getNotesFileWithText(id);
    if (!note) {
      res.status(404).json({ error: 'not found' });
      return;
    }

    if (countTermsByNotesFile(id) > 0) {
      res.status(409).json({
        error: 'space already has extracted terms; delete the space and re-ingest to re-extract',
      });
      return;
    }

    let accepted: Awaited<ReturnType<typeof extractTerms>>['accepted'];
    let rejectedCount: number;
    try {
      const result = await extractTerms({
        llm: opts.llm,
        notes: note.rawText,
        maxTerms: EXTRACT_MAX_TERMS,
      });
      accepted = result.accepted;
      rejectedCount = result.rejected.length;
    } catch (err) {
      // Most often: LLM unreachable (Ollama down) or HTTP timeout. Surface as 502 so the
      // app can show "backend lost the LLM" instead of "your notes are bad".
      const message = err instanceof Error ? err.message : 'extractor failure';
      res.status(502).json({ error: message });
      return;
    }

    if (accepted.length === 0) {
      res.status(422).json({
        error:
          'not enough information in notes to extract terms — the LLM produced no candidates that passed verification. Try richer or longer notes.',
        rejectedCount,
      });
      return;
    }

    insertTerms(id, accepted);

    const space = toSpace(note);
    const body: ExtractTermsResponse = {
      space,
      acceptedCount: accepted.length,
      rejectedCount,
    };
    res.json(body);
  });

  return r;
}
