/**
 * Common shape for every puzzle engine. Each engine takes a kind-specific input
 * (already-picked `Term[]`, the LLM adapter, etc.) and yields the matching `Puzzle`
 * variant from `@pachu/shared`. `validate` is a cheap structural check used by the
 * orchestrator to fail loudly on a bad engine output before the puzzle ever leaves the
 * backend.
 *
 * Why the explicit `id` field? Lets a single registry of engines be looked up by
 * `PuzzleKind` without type-narrowing gymnastics in the route handler.
 */
import type { PuzzleKind, Puzzle } from '@pachu/shared';

export interface PuzzleEngine<TInput, TPuzzle extends Puzzle> {
  id: PuzzleKind;
  generate(input: TInput): Promise<TPuzzle>;
  validate(puzzle: TPuzzle): boolean;
}
