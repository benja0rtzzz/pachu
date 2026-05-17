import Svg, { Path, Rect } from 'react-native-svg';

// Ported from `app/screens/screens.jsx::ModeIcon`. Three glyphs at 28×28
// for the PuzzlePicker tiles — crossword grid, cloze underlines with a
// dashed mask, flashcards stack.

export type ModeIconKind = 'cross' | 'cloze' | 'cards';

type Props = {
  kind: ModeIconKind;
  color: string;
  size?: number;
};

export function ModeIcon({ kind, color, size = 28 }: Props) {
  const stroke = {
    stroke: color,
    strokeWidth: 1.6,
    fill: 'none' as const,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  if (kind === 'cross') {
    return (
      <Svg width={size} height={size} viewBox="0 0 28 28">
        <Rect x={4} y={4} width={6} height={6} rx={1} {...stroke} />
        <Rect x={11} y={4} width={6} height={6} rx={1} {...stroke} />
        <Rect x={18} y={4} width={6} height={6} rx={1} {...stroke} />
        <Rect x={11} y={11} width={6} height={6} rx={1} {...stroke} />
        <Rect x={11} y={18} width={6} height={6} rx={1} {...stroke} />
        <Rect x={4} y={11} width={6} height={6} rx={1} {...stroke} />
      </Svg>
    );
  }

  if (kind === 'cloze') {
    return (
      <Svg width={size} height={size} viewBox="0 0 28 28">
        <Path
          d="M4 9h7M14 9h10M4 15h14M21 15h3M4 21h6M13 21h11"
          {...stroke}
        />
        <Rect
          x={11}
          y={13}
          width={9}
          height={4}
          rx={1}
          {...stroke}
          strokeDasharray="2 2"
        />
      </Svg>
    );
  }

  // cards
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28">
      <Rect x={6} y={9} width={16} height={13} rx={2} {...stroke} />
      <Rect x={3} y={6} width={16} height={13} rx={2} {...stroke} />
    </Svg>
  );
}
