/**
 * Notes routes. `POST /notes/ingest` creates a `Space` from raw text.
 *
 * The ingest endpoint is intentionally LLM-free for now — it stores `{title, content}`
 * and returns an `IngestResponse` whose `space.summary` is a zero-state summary (no
 * terms yet). Term extraction will be wired into the same handler later (Person B's
 * `extractTerms` prompt + verifier) without changing the wire contract.
 *
 * `GET /notes/:id` returns the raw body alongside metadata — used internally by the
 * extraction pipeline and for debugging. The canonical user-facing listing lives on
 * `GET /spaces`; the deprecated `GET /notes` listing has been removed.
 */
import { Router } from 'express';
import type { IngestResponse, Space } from '@pachu/shared';
import {
  createNotesFile,
  getNotesFileWithText,
} from '../store/index.js';
import { computeSpaceSummary } from '../memory/spaceSummary.js';

const MAX_CONTENT_BYTES = 2 * 1024 * 1024;

export function notesRouter(): Router {
  const r = Router();

  r.post('/ingest', (req, res) => {
    const body = req.body as { title?: unknown; content?: unknown } | undefined;
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    const content = typeof body?.content === 'string' ? body.content : '';

    if (!title) {
      res.status(400).json({ error: 'title is required (non-empty string)' });
      return;
    }
    if (!content) {
      res.status(400).json({ error: 'content is required (non-empty string)' });
      return;
    }
    if (Buffer.byteLength(content, 'utf8') > MAX_CONTENT_BYTES) {
      res.status(413).json({ error: `content exceeds ${MAX_CONTENT_BYTES} bytes` });
      return;
    }

    const note = createNotesFile({ title, rawText: content });
    const space: Space = {
      id: note.id,
      title: note.title,
      createdAt: note.createdAt,
      byteLength: note.byteLength,
      summary: computeSpaceSummary(note.id),
    };
    const responseBody: IngestResponse = { space };
    res.status(201).json(responseBody);
  });

  r.get('/:id', (req, res) => {
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
    res.json(note);
  });

  return r;
}
