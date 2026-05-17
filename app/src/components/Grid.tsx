import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CrosswordPuzzle } from '@pachu/shared';
import { colors, radius, spacing } from '../theme';
import { buildCrosswordGrid } from './crosswordGrid';

const CELL = 32;

type Props = {
  puzzle: CrosswordPuzzle;
  selectedTermId: string | null;
  entries: Record<string, string>;
  onSelectTerm: (termId: string) => void;
};

export function Grid({ puzzle, selectedTermId, entries, onSelectTerm }: Props) {
  const grid = buildCrosswordGrid(puzzle);

  return (
    <View style={styles.wrap}>
      {grid.map((row, y) => (
        <View key={`row-${y}`} style={styles.row}>
          {row.map((cell, x) => {
            if (cell.kind === 'block') {
              return <View key={`${x}-${y}`} style={[styles.cell, styles.block]} />;
            }

            const termId = cell.entryIds[0] ?? null;
            const entry = termId ? puzzle.entries.find((e) => e.termId === termId) : null;
            let display = '';
            if (entry && termId) {
              const filled = entries[termId] ?? '';
              const idx =
                entry.orientation === 'across' ? x - entry.startX : y - entry.startY;
              display = filled[idx]?.toUpperCase() ?? '';
            }

            const active = termId !== null && cell.entryIds.includes(selectedTermId ?? '');

            return (
              <Pressable
                key={`${x}-${y}`}
                onPress={() => {
                  if (termId) onSelectTerm(termId);
                }}
                style={[styles.cell, styles.playable, active && styles.active]}
              >
                <Text style={styles.letter}>{display}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    width: CELL,
    height: CELL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  block: {
    backgroundColor: colors.cellBlock,
  },
  playable: {
    backgroundColor: colors.cell,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  active: {
    backgroundColor: colors.cellActive,
  },
  letter: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
});
