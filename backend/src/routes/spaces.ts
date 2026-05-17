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
import type { Space } from '@pachu/shared';
import { computeSpaceSummary } from '../memory/spaceSummary.js';
import {
  deleteNotesFile,
  getNotesFile,
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

export function spacesRouter(): Router {
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

  return r;
}
