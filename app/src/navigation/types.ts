import type { PuzzleKind } from '@pachu/shared';

export type Route =
  | { name: 'landing' }
  | { name: 'import' }
  | { name: 'picker' }
  | { name: 'crossword'; puzzleId: string }
  | { name: 'cloze'; puzzleId: string }
  | { name: 'flashcards'; puzzleId: string };

export type NavigateTarget =
  | Route['name']
  | { name: 'crossword'; puzzleId: string }
  | { name: 'cloze'; puzzleId: string }
  | { name: 'flashcards'; puzzleId: string };

export interface StartPuzzleParams {
  kind: PuzzleKind;
  puzzleId: string;
}
