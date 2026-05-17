import type { Puzzle, PuzzleKind } from '@pachu/shared';
import { MOCK_CLOZE, MOCK_CROSSWORD, MOCK_FLASHCARDS } from '../mocks/mockPuzzles';

export async function generatePuzzle(_req: {
  kind: PuzzleKind;
  notesId: string;
}): Promise<Puzzle> {
  await new Promise((r) => setTimeout(r, 400));

  switch (_req.kind) {
    case 'crossword':
      return { ...MOCK_CROSSWORD, id: `mock-crossword-${_req.notesId}` };
    case 'cloze':
      return { ...MOCK_CLOZE, id: `mock-cloze-${_req.notesId}` };
    case 'flashcards':
      return { ...MOCK_FLASHCARDS, id: `mock-flash-${_req.notesId}` };
    default: {
      const _exhaustive: never = _req.kind;
      throw new Error(`Unknown puzzle kind: ${_exhaustive}`);
    }
  }
}
