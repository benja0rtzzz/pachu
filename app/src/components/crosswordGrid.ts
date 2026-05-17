import type { CrosswordEntry, CrosswordPuzzle } from '@pachu/shared';

export type CellKind = 'block' | 'empty' | 'letter';

export interface GridCell {
  kind: CellKind;
  letter: string;
  entryIds: string[];
}

export function buildCrosswordGrid(puzzle: CrosswordPuzzle): GridCell[][] {
  const grid: GridCell[][] = Array.from({ length: puzzle.height }, () =>
    Array.from({ length: puzzle.width }, () => ({
      kind: 'block' as const,
      letter: '',
      entryIds: [],
    })),
  );

  for (const entry of puzzle.entries) {
    placeEntry(grid, entry);
  }

  return grid;
}

function placeEntry(grid: GridCell[][], entry: CrosswordEntry) {
  const term = entry.term.toUpperCase();
  for (let i = 0; i < term.length; i++) {
    const x = entry.orientation === 'across' ? entry.startX + i : entry.startX;
    const y = entry.orientation === 'down' ? entry.startY + i : entry.startY;
    const row = grid[y];
    if (!row) continue;
    const cell = row[x];
    if (!cell) continue;

    if (cell.kind === 'block') {
      cell.kind = 'letter';
      cell.letter = term[i] ?? '';
    } else if (cell.letter && cell.letter !== term[i]) {
      cell.letter = term[i] ?? cell.letter;
    }

    if (!cell.entryIds.includes(entry.termId)) {
      cell.entryIds.push(entry.termId);
    }
  }
}
