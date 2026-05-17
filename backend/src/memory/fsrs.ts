/**
 * FSRS wrapper. Thin, store-aware shim over `ts-fsrs`.
 *
 * Storage contract: a term's `Card` lives in `terms.fsrs_card_json` (see schema.sql and
 * the decisions log). This module is the only place that knows how to (de)serialize that
 * blob; nothing else in the codebase should peek into the JSON shape.
 *
 * Why we re-encode `JSON.stringify(card)`: `ts-fsrs`'s `Card` is plain data with `Date`
 * fields. `Date` has a default `toJSON` that emits ISO-8601, so stringify round-trips
 * cleanly; deserialize just revives the two date-shaped fields. This avoids hand-listing
 * each numeric field and so survives a future `ts-fsrs` minor that adds a field.
 *
 * The store call (`upsertFsrsCardJson`) is only made by `reviewTerm`; loading a fresh
 * card via `getCardForTerm` does NOT persist. We don't want to write a "default" card on
 * a read-only lookup (e.g. the term picker scanning all terms), only after a real review.
 */
import { createEmptyCard, fsrs, type Card, type Grade } from 'ts-fsrs';
import type { Rating } from '@pachu/shared';
import { config } from '../config.js';
import { getFsrsCardJson, upsertFsrsCardJson } from '../store/index.js';

/** Days threshold the stability router uses to flip anchored → generated cloze. */
export const STABILITY_THRESHOLD_DAYS = config.fsrs.stabilityThresholdDays;

const scheduler = fsrs();

function serializeCard(card: Card): string {
  // Date#toJSON emits ISO-8601, so JSON.stringify handles `due` / `last_review` natively.
  return JSON.stringify(card);
}

function reviveCard(json: string): Card {
  const obj = JSON.parse(json) as Record<string, unknown>;
  if (typeof obj.due === 'string') obj.due = new Date(obj.due);
  if (typeof obj.last_review === 'string') obj.last_review = new Date(obj.last_review);
  return obj as unknown as Card;
}

/**
 * Load a term's FSRS card, or synthesize a fresh one if the term has never been reviewed.
 * Pure read — does not write anything to the store. A new card is "due now" by FSRS
 * convention, which is what the term picker wants for unseen terms.
 */
export function getCardForTerm(termId: string, now: Date = new Date()): Card {
  const raw = getFsrsCardJson(termId);
  return raw ? reviveCard(raw) : createEmptyCard(now);
}

/**
 * Apply a 1..4 rating to a term and persist the updated card. Returns the new card.
 * `ts-fsrs.repeat` returns the next-state card for every possible rating; we keep only
 * the one matching the actual user rating.
 */
export function reviewTerm(
  termId: string,
  rating: Rating,
  now: Date = new Date(),
): Card {
  const card = getCardForTerm(termId, now);
  // `ts-fsrs.Rating` includes a `Manual` variant we don't use; `Grade` is the 1..4 subset.
  const next = scheduler.repeat(card, now)[rating as Grade].card;
  upsertFsrsCardJson(termId, serializeCard(next));
  return next;
}

/**
 * True iff the term is due for review at `now`. Unreviewed terms are always due (a fresh
 * card's `due` equals `now`), which is the behaviour the term picker relies on to surface
 * brand-new terms alongside genuinely-due ones.
 */
export function isDue(termId: string, now: Date = new Date()): boolean {
  const raw = getFsrsCardJson(termId);
  if (!raw) return true;
  return reviveCard(raw).due.getTime() <= now.getTime();
}

/**
 * Memory stability in days, or 0 if the term has never been reviewed. The stability
 * router compares this against `STABILITY_THRESHOLD_DAYS` to pick anchored vs generated.
 */
export function getStabilityDays(termId: string): number {
  const raw = getFsrsCardJson(termId);
  return raw ? reviveCard(raw).stability : 0;
}
