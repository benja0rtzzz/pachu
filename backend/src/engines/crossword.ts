/**
 * Crossword engine. Wraps the `crossword-layout-generator` npm package.
 *
 * Pipeline:
 *   1. For each chosen `Term`, ask Person B's `generateCrosswordClue` for a clue whose
 *      register mimics the term's `styleAnchor`. If the clue fails its sanity checks
 *      (term-in-clue, empty, absurdly long), we fall back to the term's definition so
 *      the layout stage always has something usable.
 *   2. Feed `{ answer, clue }` rows to `crossword-layout-generator`. The package places
 *      entries that fit; some inputs may come back unplaced (`orientation === 'none'`),
 *      which we drop — the puzzle uses only the placed subset.
 *   3. Reshape into the `CrosswordPuzzle` wire shape, converting the package's 1-based
 *      coordinates to 0-based.
 *
 * Inputs are pre-picked `Term[]` from the term picker; the engine doesn't touch FSRS
 * directly. This keeps the engine deterministic given the same terms + LLM responses,
 * which is what the route handler's tests rely on.
 */
import { randomUUID } from 'node:crypto';
import clg from 'crossword-layout-generator';
import type { CrosswordPuzzle, CrosswordEntry, Term } from '@pachu/shared';
import type { LlmAdapter } from '../llm/adapter.js';
import { generateCrosswordClue } from '../llm/prompts/clueStylist.js';
import type { PuzzleEngine } from './types.js';

export interface CrosswordEngineInput {
  spaceId: string;
  terms: Term[];
  llm: LlmAdapter;
  /** Override the generated id (mostly for tests). Defaults to `randomUUID()`. */
  puzzleId?: string;
}

// A crossword answer is one cell per letter, so a 110-letter "term" produced
// an unreadable grid. We feed the solver single-token answers in a sane
// length band and size the puzzle by *total letters* (~55 across all answers)
// so the average crossword is consistently solvable on a phone screen.
const MIN_ANSWER_LEN = 3;
const MAX_ANSWER_LEN = 14;
const MAX_ENTRIES = 14;
const TARGET_TOTAL_LETTERS = 65;
const MIN_ENTRIES_BEFORE_STOP = 4;

function letterLen(term: Term): number {
  const n = term.term.replace(/[^A-Za-z]/g, '').length;
  return n || term.term.trim().length;
}

function crosswordEligible(term: Term): boolean {
  const w = term.term.trim();
  if (/\s/.test(w)) return false; // single token only — no phrases
  if (!/^[A-Za-z][A-Za-z'-]*$/.test(w)) return false; // letters (plus -/') only
  const letters = w.replace(/[^A-Za-z]/g, '');
  return letters.length >= MIN_ANSWER_LEN && letters.length <= MAX_ANSWER_LEN;
}

/**
 * Pick answers so the summed letter count lands near TARGET_TOTAL_LETTERS
 * (~55) — that's the "55 flat average" target. Shortest-first so short words
 * interlock well and we can fit more of them before hitting the budget; we
 * require a few entries before stopping so a couple of long words can't end
 * the puzzle early. Falls back to raw terms if none are eligible.
 */
function selectCrosswordTerms(terms: Term[]): Term[] {
  const eligible = terms
    .filter(crosswordEligible)
    .sort((a, b) => letterLen(a) - letterLen(b));
  const pool =
    eligible.length > 0
      ? eligible
      : [...terms].sort((a, b) => letterLen(a) - letterLen(b));

  const chosen: Term[] = [];
  let total = 0;
  for (const t of pool) {
    if (chosen.length >= MAX_ENTRIES) break;
    const len = letterLen(t);
    if (
      total + len > TARGET_TOTAL_LETTERS &&
      chosen.length >= MIN_ENTRIES_BEFORE_STOP
    ) {
      break;
    }
    chosen.push(t);
    total += len;
  }
  if (chosen.length === 0 && pool.length > 0) chosen.push(pool[0]!);
  return chosen;
}

async function buildClueRows(
  terms: Term[],
  llm: LlmAdapter,
): Promise<Array<{ termId: string; answer: string; clue: string }>> {
  const rows: Array<{ termId: string; answer: string; clue: string }> = [];
  for (const term of terms) {
    let clue = term.definition;
    try {
      const result = await generateCrosswordClue({
        llm,
        term: term.term,
        definition: term.definition,
        styleAnchor: term.styleAnchor,
      });
      if (result.ok && result.clue.trim().length > 0) {
        clue = result.clue;
      }
    } catch {
      // LLM failure on a single clue is non-fatal: definition is a safe fallback.
    }
    rows.push({ termId: term.id, answer: term.term, clue });
  }
  return rows;
}

export const crosswordEngine: PuzzleEngine<CrosswordEngineInput, CrosswordPuzzle> = {
  id: 'crossword',

  async generate(input) {
    const rows = await buildClueRows(selectCrosswordTerms(input.terms), input.llm);

    // `crossword-layout-generator` mutates / inspects its input array but only by shape;
    // we pass a fresh objects-only array to be safe.
    const layout = clg.generateLayout(
      rows.map((r) => ({ clue: r.clue, answer: r.answer })),
    );

    // The package returns entries in input order; pair each result with its termId.
    // Unplaced entries (orientation 'none', start coords 0) are dropped — clients only
    // see the placed grid. If nothing fit, the orchestrator/route surfaces a 422.
    const entries: CrosswordEntry[] = [];
    for (let i = 0; i < layout.result.length; i += 1) {
      const r = layout.result[i];
      const row = rows[i];
      if (!r || !row) continue;
      const orientation = r.orientation;
      if (orientation !== 'across' && orientation !== 'down') continue;
      if (r.startx <= 0 || r.starty <= 0) continue;
      entries.push({
        term: row.answer,
        clue: row.clue,
        termId: row.termId,
        // Convert 1-based (clg) to 0-based (our wire shape) so the app can index arrays.
        startX: r.startx - 1,
        startY: r.starty - 1,
        orientation,
      });
    }

    return {
      kind: 'crossword',
      id: input.puzzleId ?? randomUUID(),
      spaceId: input.spaceId,
      width: layout.cols,
      height: layout.rows,
      entries,
    };
  },

  validate(puzzle) {
    if (puzzle.kind !== 'crossword') return false;
    if (!puzzle.id || !puzzle.spaceId) return false;
    if (puzzle.entries.length === 0) return false;
    if (puzzle.width <= 0 || puzzle.height <= 0) return false;
    for (const e of puzzle.entries) {
      if (e.startX < 0 || e.startY < 0) return false;
      if (e.startX >= puzzle.width || e.startY >= puzzle.height) return false;
      const span = e.term.length;
      if (e.orientation === 'across' && e.startX + span > puzzle.width) return false;
      if (e.orientation === 'down' && e.startY + span > puzzle.height) return false;
    }
    return true;
  },
};
