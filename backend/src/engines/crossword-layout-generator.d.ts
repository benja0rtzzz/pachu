/**
 * Ambient module declaration for the `crossword-layout-generator` npm package, which
 * ships without TypeScript types. We only declare the surface we actually use; if we
 * reach for more of the package later, extend this file rather than sprinkling `as any`
 * casts at call sites.
 */
declare module 'crossword-layout-generator' {
  export interface ClgInputEntry {
    clue: string;
    answer: string;
  }

  export interface ClgResultEntry {
    clue: string;
    answer: string;
    /** 'across' | 'down' for placed entries, sometimes 'none' for unplaced. */
    orientation: string;
    /** 1-based position number (the cell label in standard crosswords). 0 when unplaced. */
    position: number;
    /** 1-based column for the first letter. 0 when unplaced. */
    startx: number;
    /** 1-based row for the first letter. 0 when unplaced. */
    starty: number;
  }

  export interface ClgLayout {
    /** Total column count of the smallest bounding grid. */
    cols: number;
    /** Total row count of the smallest bounding grid. */
    rows: number;
    /** Per-input result, in the same order as the input. Unplaced entries have
     *  orientation: "none" and startx/starty = 0. */
    result: ClgResultEntry[];
    /** Solved cell grid (2D); unused cells are typically '-'. We don't consume it. */
    table?: unknown;
    /** Plain-text grid with HTML line breaks. We don't consume it. */
    table_string?: string;
  }

  export function generateLayout(input: ClgInputEntry[]): ClgLayout;

  const _default: { generateLayout: typeof generateLayout };
  export default _default;
}
