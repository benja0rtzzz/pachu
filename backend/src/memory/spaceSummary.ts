/**
 * Compute a `SpaceSummary` for a notes file.
 *
 * One JS pass over the term cards (loaded via `listFsrsCardsByNotesFile`) gives us
 * `termCount`, `newCount`, `dueCount`, `dueToday`, and `stableCount` without per-term
 * round-trips. Session-derived fields (`lastPuzzleKind`, `playedTodayKinds`, `streakDays`)
 * come from the sessions repo; `lastReviewedAt` from `review_events`.
 *
 * Calendar boundaries use the server's local timezone — the backend has no client tz, and
 * for the single-user laptop demo "server local" == "what the user sees". When we one day
 * support remote access this becomes a `?tz=` query param; not worth pulling forward.
 */
import type { PuzzleKind, SpaceSummary } from '@pachu/shared';
import { STABILITY_THRESHOLD_DAYS } from './fsrs.js';
import {
  getLastEndedSession,
  listEndedKindsBetween,
  listEndedSessionLocalDates,
} from '../store/repos/sessions.js';
import { getLastReviewedAt } from '../store/repos/reviews.js';
import {
  countTermsByNotesFile,
  listFsrsCardsByNotesFile,
} from '../store/repos/terms.js';

function startOfLocalDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Walk `endedDays` (descending local-date strings) back from today and count contiguous
 * days. If the user has not yet finished a puzzle today, the streak starts at yesterday
 * — the streak only breaks when a calendar day passes without any session being finished.
 */
function computeStreak(endedDays: string[], now: Date): number {
  const set = new Set(endedDays);
  let cursor = startOfLocalDay(now);
  if (!set.has(formatLocalDate(cursor))) {
    cursor = addDays(cursor, -1);
  }
  let streak = 0;
  while (set.has(formatLocalDate(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

interface MinimalCard {
  due: string;
  stability: number;
}

export function computeSpaceSummary(
  notesFileId: string,
  now: Date = new Date(),
): SpaceSummary {
  const termCount = countTermsByNotesFile(notesFileId);
  const cards = listFsrsCardsByNotesFile(notesFileId);

  const startToday = startOfLocalDay(now);
  const startTomorrow = addDays(startToday, 1);
  const tomorrowMs = startTomorrow.getTime();
  const nowMs = now.getTime();

  let newCount = 0;
  let dueCount = 0;
  let dueToday = 0;
  let stableCount = 0;

  for (const { cardJson } of cards) {
    if (!cardJson) {
      // Unreviewed terms are due now AND due today (the term picker will surface them).
      newCount += 1;
      dueCount += 1;
      dueToday += 1;
      continue;
    }
    let card: MinimalCard;
    try {
      card = JSON.parse(cardJson) as MinimalCard;
    } catch {
      // Treat a corrupted blob as "unknown" — don't crash the route; skip from stats.
      continue;
    }
    const dueMs = new Date(card.due).getTime();
    if (Number.isFinite(dueMs)) {
      if (dueMs <= nowMs) dueCount += 1;
      if (dueMs < tomorrowMs) dueToday += 1;
    }
    if (card.stability >= STABILITY_THRESHOLD_DAYS) stableCount += 1;
  }

  const lastSession = getLastEndedSession(notesFileId);
  const lastReviewedAt = getLastReviewedAt(notesFileId);
  const playedTodayKinds: PuzzleKind[] = listEndedKindsBetween(
    notesFileId,
    startToday.toISOString(),
    startTomorrow.toISOString(),
  );
  const streakDays = computeStreak(listEndedSessionLocalDates(notesFileId), now);

  return {
    termCount,
    dueCount,
    newCount,
    stableCount,
    lastReviewedAt: lastReviewedAt ?? undefined,
    lastPuzzleKind: lastSession?.puzzleKind,
    dueToday,
    playedTodayKinds,
    streakDays,
  };
}
