import type { ClozePuzzle, CrosswordPuzzle, FlashcardsPuzzle } from '@pachu/shared';

export const MOCK_CROSSWORD: CrosswordPuzzle = {
  kind: 'crossword',
  id: 'mock-crossword-1',
  width: 7,
  height: 7,
  entries: [
    {
      termId: 't-cabg',
      term: 'CABG',
      clue: 'Coronary artery bypass graft (abbr.)',
      startX: 0,
      startY: 1,
      orientation: 'across',
    },
    {
      termId: 't-stemi',
      term: 'STEMI',
      clue: 'ST-elevation myocardial infarction (abbr.)',
      startX: 0,
      startY: 3,
      orientation: 'across',
    },
    {
      termId: 't-ace',
      term: 'ACE',
      clue: 'Enzyme targeted by inhibitors in HF workups',
      startX: 0,
      startY: 5,
      orientation: 'across',
    },
  ],
};

export const MOCK_CLOZE: ClozePuzzle = {
  kind: 'cloze',
  id: 'mock-cloze-1',
  items: [
    {
      termId: 't-stemi',
      sentence: '_____ requires emergent reperfusion when clinically confirmed.',
      answer: 'STEMI',
      mode: 'anchored',
      sourceChunk: 'STEMI: ST-elevation myocardial infarction — emergent reperfusion indicated.',
    },
    {
      termId: 't-bnp',
      sentence: '_____ is elevated in volume overload; interpret with clinical context.',
      answer: 'BNP',
      mode: 'generated',
      sourceChunk: 'BNP elevated in volume overload; use with clinical context.',
    },
  ],
};

export const MOCK_FLASHCARDS: FlashcardsPuzzle = {
  kind: 'flashcards',
  id: 'mock-flash-1',
  items: [
    {
      termId: 't-ratio',
      front: 'Ratio test (series)',
      back: 'If lim |a_{n+1}/a_n| < 1 → converges absolutely',
    },
    {
      termId: 't-parts',
      front: 'Integration by parts',
      back: '∫ u dv = uv − ∫ v du',
    },
    {
      termId: 't-hiragana',
      front: 'Hiragana あ',
      back: 'Vowel sound "a"',
    },
  ],
};
