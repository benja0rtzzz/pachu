/**
 * Puzzles routes. Two endpoints:
 *
 *   POST /puzzles/generate          → pick terms, run an engine, return a Puzzle.
 *   POST /puzzles/:id/finish        → apply per-term Reviews, end the session, return
 *                                     a refreshed Space + next-due timestamp.
 *
 * Design choices worth flagging:
 *
 *   - **`puzzle.id === session.id`.** A puzzle has no row of its own; we identify a
 *     run by the session row created at generate time. `/finish` then accepts either
 *     `:id` (the session id from the URL) or the body's `puzzleId` — but they MUST
 *     match. This avoids a separate puzzles table while still letting the route
 *     reject stale / fabricated ids.
 *
 *   - **No puzzle persistence.** The engine output is sent to the client and
 *     forgotten. `/finish` only needs the term-by-term Reviews the client sends back;
 *     the FSRS state lives on the term row, not the puzzle.
 *
 *   - **Silent fallback is the rule for cloze.** The engine never throws on
 *     verifier failure; routes never see ungrounded sentences leak through.
 *
 *   - **`targetCount` defaults are kind-specific.** Crossword has a small soft cap
 *     so the layout solver doesn't choke; cloze/flashcards default higher.
 */
import { Router } from 'express';
import type {
  ClozePuzzle,
  CrosswordPuzzle,
  FlashcardsPuzzle,
  GeneratePuzzleRequest,
  Puzzle,
  PuzzleKind,
  Rating,
  SessionFinishRequest,
  SessionFinishResponse,
  Space,
} from '@pachu/shared';
import { crosswordEngine } from '../engines/crossword.js';
import { clozeEngine } from '../engines/cloze/index.js';
import { flashcardsEngine } from '../engines/flashcards.js';
import type { LlmAdapter } from '../llm/adapter.js';
import { computeSpaceSummary } from '../memory/spaceSummary.js';
import { reviewTerm } from '../memory/fsrs.js';
import { pickTerms } from '../memory/termPicker.js';
import {
  appendReviewEvent,
  createSession,
  endSession,
  getNotesFile,
  getNotesFileWithText,
  getSession,
  getTermById,
  listFsrsCardsByNotesFile,
} from '../store/index.js';

const TARGET_COUNT_DEFAULTS: Record<PuzzleKind, number> = {
  crossword: 8,
  cloze: 8,
  flashcards: 12,
};

/** Soft cap. Higher requests are clamped silently so a malicious caller can't OOM us. */
const TARGET_COUNT_CEILING = 25;

function isPuzzleKind(v: unknown): v is PuzzleKind {
  return v === 'crossword' || v === 'cloze' || v === 'flashcards';
}

function isRating(v: unknown): v is Rating {
  return v === 1 || v === 2 || v === 3 || v === 4;
}

/**
 * Find the earliest `due` timestamp across all terms in a space, or undefined when the
 * space has no reviewed terms yet (unreviewed cards are due-now, so "next due" reads as
 * undefined to signal "nothing scheduled in the future").
 */
function computeNextDueAt(notesFileId: string): string | undefined {
  let earliest = Infinity;
  for (const row of listFsrsCardsByNotesFile(notesFileId)) {
    if (!row.cardJson) continue;
    try {
      const card = JSON.parse(row.cardJson) as { due?: string };
      if (!card.due) continue;
      const t = new Date(card.due).getTime();
      if (Number.isFinite(t) && t < earliest) earliest = t;
    } catch {
      // Skip corrupted rows; spaceSummary handles them the same way.
    }
  }
  return Number.isFinite(earliest) ? new Date(earliest).toISOString() : undefined;
}

function toSpace(notesFileId: string): Space | undefined {
  const meta = getNotesFile(notesFileId);
  if (!meta) return undefined;
  return { ...meta, summary: computeSpaceSummary(notesFileId) };
}

export function puzzlesRouter(opts: { llm: LlmAdapter }): Router {
  const r = Router();

  r.post('/generate', async (req, res) => {
    const body = (req.body ?? {}) as Partial<GeneratePuzzleRequest>;
    if (!isPuzzleKind(body.kind)) {
      res.status(400).json({ error: 'kind must be one of crossword|cloze|flashcards' });
      return;
    }
    const kind: PuzzleKind = body.kind;
    const spaceId = typeof body.spaceId === 'string' ? body.spaceId.trim() : '';
    if (!spaceId) {
      res.status(400).json({ error: 'spaceId is required' });
      return;
    }

    const notes = getNotesFileWithText(spaceId);
    if (!notes) {
      res.status(404).json({ error: 'space not found' });
      return;
    }

    const requested =
      typeof body.targetCount === 'number' && Number.isFinite(body.targetCount)
        ? body.targetCount
        : TARGET_COUNT_DEFAULTS[kind];
    const targetCount = Math.min(Math.max(1, Math.floor(requested)), TARGET_COUNT_CEILING);

    const picks = pickTerms(spaceId, { count: targetCount });
    if (picks.length === 0) {
      res.status(422).json({
        error: 'no terms available in this space yet — ingest notes and extract terms first',
      });
      return;
    }

    const session = createSession({ notesFileId: spaceId, puzzleKind: kind });

    try {
      let puzzle: Puzzle;
      if (kind === 'crossword') {
        const out: CrosswordPuzzle = await crosswordEngine.generate({
          spaceId,
          terms: picks.map((p) => p.term),
          llm: opts.llm,
          puzzleId: session.id,
        });
        if (!crosswordEngine.validate(out)) {
          endSession(session.id);
          res.status(422).json({ error: 'crossword layout failed to place any entries' });
          return;
        }
        puzzle = out;
      } else if (kind === 'cloze') {
        const out: ClozePuzzle = await clozeEngine.generate({
          spaceId,
          terms: picks.map((p) => p.term),
          llm: opts.llm,
          rawText: notes.rawText,
          puzzleId: session.id,
        });
        if (!clozeEngine.validate(out)) {
          endSession(session.id);
          res.status(422).json({ error: 'cloze engine produced an invalid puzzle' });
          return;
        }
        puzzle = out;
      } else {
        const out: FlashcardsPuzzle = await flashcardsEngine.generate({
          spaceId,
          terms: picks.map((p) => p.term),
          puzzleId: session.id,
        });
        if (!flashcardsEngine.validate(out)) {
          endSession(session.id);
          res.status(422).json({ error: 'flashcards engine produced an invalid puzzle' });
          return;
        }
        puzzle = out;
      }

      res.json(puzzle);
    } catch (err) {
      // Engine threw (e.g. LLM unreachable for crossword clue generation). End the
      // session so the row doesn't dangle as "in-flight" forever, then surface a 502.
      endSession(session.id);
      const message = err instanceof Error ? err.message : 'engine failure';
      res.status(502).json({ error: message });
    }
  });

  r.post('/:id/finish', (req, res) => {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'id required' });
      return;
    }

    const body = (req.body ?? {}) as Partial<SessionFinishRequest>;
    const puzzleId = typeof body.puzzleId === 'string' ? body.puzzleId : '';
    if (puzzleId && puzzleId !== id) {
      res.status(400).json({ error: 'puzzleId in body does not match :id in URL' });
      return;
    }
    if (!Array.isArray(body.reviews)) {
      res.status(400).json({ error: 'reviews must be an array' });
      return;
    }

    const session = getSession(id);
    if (!session) {
      res.status(404).json({ error: 'session not found' });
      return;
    }
    if (session.endedAt) {
      res.status(409).json({ error: 'session already finished' });
      return;
    }

    const now = new Date();
    let accepted = 0;
    for (const review of body.reviews) {
      if (!review || typeof review !== 'object') continue;
      const r = review as Partial<{ termId: string; rating: Rating; ms: number; hintsUsed: number }>;
      const termId = typeof r.termId === 'string' ? r.termId : '';
      if (!termId || !isRating(r.rating)) continue;
      const term = getTermById(termId);
      // Cross-space contamination guard: only accept reviews for terms in this space.
      if (!term || term.notesFileId !== session.notesFileId) continue;
      const ms = typeof r.ms === 'number' && Number.isFinite(r.ms) ? Math.max(0, r.ms) : 0;
      const hintsUsed =
        typeof r.hintsUsed === 'number' && Number.isFinite(r.hintsUsed)
          ? Math.max(0, Math.floor(r.hintsUsed))
          : 0;

      appendReviewEvent({ termId, sessionId: session.id, rating: r.rating, ms, hintsUsed });
      reviewTerm(termId, r.rating, now);
      accepted += 1;
    }

    endSession(session.id);

    const response: SessionFinishResponse = {
      acceptedCount: accepted,
      nextDueAt: computeNextDueAt(session.notesFileId),
      space: toSpace(session.notesFileId),
    };
    res.json(response);
  });

  return r;
}
