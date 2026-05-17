/**
 * Term Picker: select N terms for a puzzle session, ranked by what the user most needs
 * to see right now.
 *
 * Ranking (deterministic, descending priority):
 *   1. Due terms — already overdue or due-now. Unreviewed terms are due-now by FSRS
 *      convention, so this bucket also surfaces brand-new content. Within the bucket,
 *      we order by the most overdue first (ascending `due`).
 *   2. Weak-but-not-due terms — `stability < STABILITY_THRESHOLD_DAYS`. These haven't
 *      consolidated yet and benefit from extra reps before they slide into Hard territory.
 *      Ordered by ascending stability (weakest first).
 *   3. Stable terms — fall-through, ordered by ascending `due` so the soonest-upcoming
 *      review surfaces first.
 *
 * Why not pure-FSRS? `ts-fsrs` schedules a single term but does not pick a study set; that
 * selection is a product decision. We keep the selection logic here so the rest of the
 * codebase (engines, routes) can stay deterministic and FSRS-agnostic.
 *
 * Pure with respect to side effects — no writes. Reads `terms.fsrs_card_json` and
 * `terms.*` once per call.
 */
import type { Term } from '@pachu/shared';
import { STABILITY_THRESHOLD_DAYS } from './fsrs.js';
import {
  listFsrsCardsByNotesFile,
  listTermsByNotesFile,
} from '../store/repos/terms.js';

interface CardSnapshot {
  /** Milliseconds since epoch for the FSRS card's `due`. `-Infinity` for unreviewed. */
  dueMs: number;
  /** FSRS stability in days. `0` for unreviewed. */
  stability: number;
  /** True iff this term has no persisted FSRS card yet. */
  unreviewed: boolean;
}

const UNREVIEWED: CardSnapshot = { dueMs: -Infinity, stability: 0, unreviewed: true };

function parseSnapshot(cardJson: string | null): CardSnapshot {
  if (!cardJson) return UNREVIEWED;
  try {
    const obj = JSON.parse(cardJson) as { due?: string; stability?: number };
    const dueMs = obj.due ? new Date(obj.due).getTime() : Number.NaN;
    return {
      dueMs: Number.isFinite(dueMs) ? dueMs : -Infinity,
      stability: typeof obj.stability === 'number' ? obj.stability : 0,
      unreviewed: false,
    };
  } catch {
    // Corrupted blob: treat as unreviewed so the term still becomes eligible.
    return UNREVIEWED;
  }
}

export interface PickedTerm {
  term: Term;
  bucket: 'due' | 'weak' | 'stable';
  /** Snapshot used for ordering; exposed for diagnostics and tests. */
  snapshot: CardSnapshot;
}

export interface PickTermsOptions {
  /** Soft cap on the number of terms to return. */
  count: number;
  now?: Date;
}

/**
 * Pick up to `count` terms for the given notes file (i.e. a Space). The result is
 * truncated, never padded with synthetic rows: a brand-new space with three terms returns
 * three picks even if `count` is 20. Callers can degrade the request gracefully.
 */
export function pickTerms(
  notesFileId: string,
  opts: PickTermsOptions,
): PickedTerm[] {
  const count = Math.max(0, Math.floor(opts.count));
  if (count === 0) return [];

  const now = (opts.now ?? new Date()).getTime();
  const terms = listTermsByNotesFile(notesFileId);
  if (terms.length === 0) return [];

  const cards = new Map<string, CardSnapshot>();
  for (const row of listFsrsCardsByNotesFile(notesFileId)) {
    cards.set(row.termId, parseSnapshot(row.cardJson));
  }

  const due: PickedTerm[] = [];
  const weak: PickedTerm[] = [];
  const stable: PickedTerm[] = [];

  for (const term of terms) {
    const snap = cards.get(term.id) ?? UNREVIEWED;
    if (snap.unreviewed || snap.dueMs <= now) {
      due.push({ term, bucket: 'due', snapshot: snap });
    } else if (snap.stability < STABILITY_THRESHOLD_DAYS) {
      weak.push({ term, bucket: 'weak', snapshot: snap });
    } else {
      stable.push({ term, bucket: 'stable', snapshot: snap });
    }
  }

  // Due: most-overdue first; unreviewed (dueMs = -Infinity) lands at the very top so a
  // user with both new and overdue content sees the new terms first.
  due.sort((a, b) => a.snapshot.dueMs - b.snapshot.dueMs);
  // Weak: weakest stability first.
  weak.sort((a, b) => a.snapshot.stability - b.snapshot.stability);
  // Stable: soonest upcoming due first.
  stable.sort((a, b) => a.snapshot.dueMs - b.snapshot.dueMs);

  return [...due, ...weak, ...stable].slice(0, count);
}
