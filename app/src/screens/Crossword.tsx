import { useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type {
  CrosswordEntry,
  Rating,
  Review,
  SessionFinishResponse,
} from '@pachu/shared';
import { palette } from '@pachu/shared';
import { ProgressBar } from '../components/ProgressBar';
import { PuzzleShell } from '../components/PuzzleShell';
import { SecondaryButton } from '../components/PrimaryButton';
import { useNavigation } from '../navigation/NavigationContext';
import { isCrosswordPuzzle, useSession, useSpaces } from '../state/session';
import { colors, fonts, radii, shadows, spacing, typography } from '../theme';

const CELL = 36;
const GAP = 2;

interface CellAxis {
  termId: string;
  number: number;
  positionInEntry: number;
}

interface CellInfo {
  letter: string;
  across?: CellAxis;
  down?: CellAxis;
  number?: number;
}

interface PerTermState {
  startedAt: number;
  attempts: number;
  hintsUsed: number;
  correct: boolean;
  revealed: boolean;
}

function emptyTermState(): PerTermState {
  return {
    startedAt: Date.now(),
    attempts: 0,
    hintsUsed: 0,
    correct: false,
    revealed: false,
  };
}

function mapRating(s: PerTermState): Rating {
  if (s.revealed) return 1;
  if (!s.correct) return 1;
  if (s.attempts <= 1 && s.hintsUsed === 0) return 4;
  if (s.attempts <= 2 && s.hintsUsed <= 1) return 3;
  return 2;
}

interface BuiltGrid {
  cells: (CellInfo | null)[][];
  numbered: { number: number; entry: CrosswordEntry }[];
  numberByTermId: Map<string, number>;
}

/**
 * Walk the entries and build a 2D grid of cells; assign clue numbers in
 * row-major order to cells that start an across or down entry.
 */
function buildGrid(width: number, height: number, entries: CrosswordEntry[]): BuiltGrid {
  const cells: (CellInfo | null)[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => null),
  );

  for (const entry of entries) {
    for (let i = 0; i < entry.term.length; i++) {
      const x = entry.orientation === 'across' ? entry.startX + i : entry.startX;
      const y = entry.orientation === 'down' ? entry.startY + i : entry.startY;
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      const existing = cells[y]![x] ?? { letter: entry.term[i]!.toUpperCase() };
      if (entry.orientation === 'across') {
        existing.across = { termId: entry.termId, number: 0, positionInEntry: i };
      } else {
        existing.down = { termId: entry.termId, number: 0, positionInEntry: i };
      }
      cells[y]![x] = existing;
    }
  }

  // Assign numbers to cells that start an across or down entry.
  let next = 1;
  const numbered: { number: number; entry: CrosswordEntry }[] = [];
  const numberByTermId = new Map<string, number>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = cells[y]![x];
      if (!c) continue;
      const startsAcross = entries.find(
        (e) => e.orientation === 'across' && e.startX === x && e.startY === y,
      );
      const startsDown = entries.find(
        (e) => e.orientation === 'down' && e.startX === x && e.startY === y,
      );
      if (startsAcross || startsDown) {
        c.number = next;
        if (startsAcross) {
          numbered.push({ number: next, entry: startsAcross });
          numberByTermId.set(startsAcross.termId, next);
          if (c.across) c.across.number = next;
        }
        if (startsDown) {
          numbered.push({ number: next, entry: startsDown });
          numberByTermId.set(startsDown.termId, next);
          if (c.down) c.down.number = next;
        }
        // Propagate the across/down numbers into every cell of those entries.
        if (startsAcross) {
          for (let i = 0; i < startsAcross.term.length; i++) {
            const cc = cells[y]![x + i];
            if (cc?.across?.termId === startsAcross.termId) cc.across.number = next;
          }
        }
        if (startsDown) {
          for (let i = 0; i < startsDown.term.length; i++) {
            const cc = cells[y + i]?.[x];
            if (cc?.down?.termId === startsDown.termId) cc.down.number = next;
          }
        }
        next += 1;
      }
    }
  }

  return { cells, numbered, numberByTermId };
}

export function CrosswordScreen() {
  const insets = useSafeAreaInsets();
  const { goBack, navigate } = useNavigation();
  const { activePuzzle } = useSession();
  const { activeSpace } = useSpaces();
  const session = useSession();
  const puzzle =
    activePuzzle && isCrosswordPuzzle(activePuzzle) ? activePuzzle : null;

  const grid = useMemo(
    () => (puzzle ? buildGrid(puzzle.width, puzzle.height, puzzle.entries) : null),
    [puzzle],
  );

  // Per-cell letter input (uppercase A–Z or empty).
  const [letters, setLetters] = useState<Record<string, string>>({});
  const cellRefs = useRef<Map<string, TextInput | null>>(new Map());

  const firstEntry = puzzle?.entries[0];
  const [selected, setSelected] = useState<{
    x: number;
    y: number;
    dir: 'across' | 'down';
  } | null>(
    firstEntry
      ? { x: firstEntry.startX, y: firstEntry.startY, dir: firstEntry.orientation }
      : null,
  );

  const [termStates, setTermStates] = useState<Record<string, PerTermState>>(() => {
    const init: Record<string, PerTermState> = {};
    for (const e of puzzle?.entries ?? []) init[e.termId] = emptyTermState();
    return init;
  });

  const [feedback, setFeedback] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    response: SessionFinishResponse | null;
    counts: { correct: number; revealed: number; wrong: number };
    spaceTitle: string;
  } | null>(null);
  const [finishError, setFinishError] = useState<string | null>(null);

  if (!puzzle || puzzle.entries.length === 0 || !grid) {
    return (
      <PuzzleShell title="Crossword" onBack={goBack} ditherIntensity="low">
        <View style={styles.centerFill}>
          <Text style={styles.errorTitle}>No crossword loaded</Text>
          <Text style={styles.errorBody}>
            Generate a crossword from a space to start solving.
          </Text>
          <SecondaryButton
            label="Back to spaces"
            onPress={() => navigate({ name: 'spaces' })}
          />
        </View>
      </PuzzleShell>
    );
  }

  const currentEntry = (() => {
    if (!selected) return puzzle.entries[0]!;
    const cell = grid.cells[selected.y]?.[selected.x];
    if (!cell) return puzzle.entries[0]!;
    const axis = selected.dir === 'across' ? cell.across : cell.down;
    if (axis) return puzzle.entries.find((e) => e.termId === axis.termId) ?? puzzle.entries[0]!;
    // Selected direction doesn't have an entry at this cell — fall back to whichever exists.
    const fallback = cell.across ?? cell.down;
    if (fallback) {
      return puzzle.entries.find((e) => e.termId === fallback.termId) ?? puzzle.entries[0]!;
    }
    return puzzle.entries[0]!;
  })();

  const currentTermState = termStates[currentEntry.termId] ?? emptyTermState();

  const setCell = (x: number, y: number, v: string) => {
    setLetters((prev) => ({ ...prev, [`${x},${y}`]: v }));
  };

  const focusCell = (x: number, y: number) => {
    cellRefs.current.get(`${x},${y}`)?.focus();
  };

  const advance = (x: number, y: number, dir: 'across' | 'down') => {
    let nx = x;
    let ny = y;
    if (dir === 'across') nx += 1;
    else ny += 1;
    if (nx >= puzzle.width || ny >= puzzle.height) return;
    if (!grid.cells[ny]?.[nx]) return;
    setSelected({ x: nx, y: ny, dir });
    focusCell(nx, ny);
  };

  const inCurrentWord = (x: number, y: number): boolean => {
    if (currentEntry.orientation === 'across') {
      return (
        y === currentEntry.startY &&
        x >= currentEntry.startX &&
        x < currentEntry.startX + currentEntry.term.length
      );
    }
    return (
      x === currentEntry.startX &&
      y >= currentEntry.startY &&
      y < currentEntry.startY + currentEntry.term.length
    );
  };

  const cellLetter = (x: number, y: number) => letters[`${x},${y}`] ?? '';

  const filledCount = Object.values(letters).filter((c) => c).length;
  const totalCount = grid.cells.flat().filter((c): c is CellInfo => c !== null).length;

  const submitCurrent = () => {
    const guess: string[] = [];
    for (let i = 0; i < currentEntry.term.length; i++) {
      const x =
        currentEntry.orientation === 'across' ? currentEntry.startX + i : currentEntry.startX;
      const y =
        currentEntry.orientation === 'down' ? currentEntry.startY + i : currentEntry.startY;
      guess.push(cellLetter(x, y).toUpperCase());
    }
    const correct = guess.join('') === currentEntry.term.toUpperCase();
    setTermStates((prev) => {
      const cur = prev[currentEntry.termId] ?? emptyTermState();
      return {
        ...prev,
        [currentEntry.termId]: {
          ...cur,
          attempts: cur.attempts + 1,
          correct: cur.correct || correct,
        },
      };
    });
    setFeedback(
      correct ? 'Correct!' : `Not quite — keep trying ${currentEntry.term.length}-letter answer`,
    );
  };

  const revealCurrent = () => {
    for (let i = 0; i < currentEntry.term.length; i++) {
      const x =
        currentEntry.orientation === 'across' ? currentEntry.startX + i : currentEntry.startX;
      const y =
        currentEntry.orientation === 'down' ? currentEntry.startY + i : currentEntry.startY;
      setCell(x, y, currentEntry.term[i]!.toUpperCase());
    }
    setTermStates((prev) => {
      const cur = prev[currentEntry.termId] ?? emptyTermState();
      return {
        ...prev,
        [currentEntry.termId]: { ...cur, revealed: true, correct: false },
      };
    });
    setFeedback('Revealed');
  };

  const finishSession = async () => {
    const reviews: Review[] = puzzle.entries.map((e) => {
      const s = termStates[e.termId] ?? emptyTermState();
      return {
        termId: e.termId,
        rating: mapRating(s),
        ms: Math.max(0, Date.now() - s.startedAt),
        hintsUsed: s.hintsUsed,
      };
    });
    const counts = {
      correct: 0,
      revealed: 0,
      wrong: 0,
    };
    for (const e of puzzle.entries) {
      const s = termStates[e.termId] ?? emptyTermState();
      if (s.revealed) counts.revealed += 1;
      else if (s.correct) counts.correct += 1;
      else counts.wrong += 1;
    }
    const fallbackTitle = activeSpace?.title ?? 'this space';
    try {
      const response = await session.finishActivePuzzle(reviews);
      setSummary({
        response,
        counts,
        spaceTitle: response?.space?.title ?? fallbackTitle,
      });
    } catch (err) {
      setFinishError(`Couldn't save results — ${(err as Error).message}`);
      setSummary({ response: null, counts, spaceTitle: fallbackTitle });
    }
  };

  if (summary) {
    return (
      <PuzzleShell title="Crossword" onBack={goBack} ditherIntensity="low">
        <View style={[styles.summaryWrap, { paddingBottom: spacing.xl + insets.bottom }]}>
          <Text style={styles.summaryEyebrow}>Session complete</Text>
          <Text style={styles.summaryHeadline}>
            {summary.counts.correct} solved
          </Text>
          <Text style={styles.summaryBody}>
            {summary.counts.correct} correct · {summary.counts.revealed} revealed ·{' '}
            {summary.counts.wrong} skipped
          </Text>
          <Text style={styles.summaryNext}>
            Saved to <Text style={styles.summarySpace}>{summary.spaceTitle}</Text>
          </Text>
          {finishError && <Text style={styles.errorBanner}>{finishError}</Text>}
          <SecondaryButton
            label="Back to space"
            onPress={() => navigate({ name: 'space', spaceId: puzzle.spaceId })}
            full
          />
        </View>
      </PuzzleShell>
    );
  }

  return (
    <PuzzleShell
      title="Crossword"
      onBack={() => navigate({ name: 'space', spaceId: puzzle.spaceId })}
      ditherIntensity="medium"
    >
      <View style={styles.progressWrap}>
        <ProgressBar value={filledCount} max={totalCount} />
      </View>

      <View style={styles.gridCard}>
        <View
          style={{
            // Cell-grid pad so the inner cells aren't right against the rounded corners.
            paddingHorizontal: 6,
            paddingVertical: 6,
          }}
        >
          {Array.from({ length: puzzle.height }).map((_, y) => (
            <View key={`row-${y}`} style={[styles.gridRow, { marginBottom: y < puzzle.height - 1 ? GAP : 0 }]}>
              {Array.from({ length: puzzle.width }).map((__, x) => {
                const cell = grid.cells[y]![x];
                if (!cell) {
                  return (
                    <View
                      key={`c-${x}-${y}`}
                      style={[
                        styles.cellBlock,
                        { marginRight: x < puzzle.width - 1 ? GAP : 0 },
                      ]}
                    />
                  );
                }
                const isSel = selected?.x === x && selected?.y === y;
                const inWord = inCurrentWord(x, y);
                const value = cellLetter(x, y);
                const correctLetter = cell.letter;
                const cellCorrect = value && value.toUpperCase() === correctLetter;
                return (
                  <Pressable
                    key={`c-${x}-${y}`}
                    onPress={() => {
                      const sameCell = isSel;
                      const dir = sameCell
                        ? selected!.dir === 'across' && cell.down
                          ? 'down'
                          : cell.across
                            ? 'across'
                            : 'down'
                        : cell.across
                          ? 'across'
                          : 'down';
                      setSelected({ x, y, dir });
                      focusCell(x, y);
                    }}
                    style={[
                      styles.cell,
                      { marginRight: x < puzzle.width - 1 ? GAP : 0 },
                      isSel && styles.cellSelected,
                      !isSel && inWord && styles.cellInWord,
                    ]}
                  >
                    {cell.number !== undefined && (
                      <Text
                        style={[
                          styles.cellNumber,
                          isSel ? styles.cellNumberInverse : null,
                        ]}
                      >
                        {cell.number}
                      </Text>
                    )}
                    <TextInput
                      ref={(el) => {
                        cellRefs.current.set(`${x},${y}`, el);
                      }}
                      value={value}
                      onChangeText={(raw) => {
                        const letter = raw.slice(-1).toUpperCase().replace(/[^A-Z]/g, '');
                        setCell(x, y, letter);
                        setFeedback(null);
                        if (letter && selected) {
                          advance(x, y, selected.dir);
                        }
                      }}
                      maxLength={1}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      style={[
                        styles.cellInput,
                        isSel && styles.cellInputInverse,
                        !isSel && cellCorrect && styles.cellInputCorrect,
                      ]}
                    />
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </View>

      <View style={styles.clueCard}>
        <Text style={styles.clueEyebrow}>
          {grid.numberByTermId.get(currentEntry.termId) ?? '?'}{' '}
          {currentEntry.orientation === 'across' ? 'Across' : 'Down'}
        </Text>
        <Text style={styles.clueBody}>{currentEntry.clue}</Text>

        <View style={styles.clueActions}>
          <Pressable onPress={revealCurrent} style={[styles.clueBtn, styles.clueBtnSecondary]}>
            <Text style={styles.clueBtnSecondaryLabel}>Reveal</Text>
          </Pressable>
          <Pressable onPress={submitCurrent} style={[styles.clueBtn, styles.clueBtnPrimary]}>
            <Text style={styles.clueBtnPrimaryLabel}>Submit</Text>
          </Pressable>
        </View>
        {feedback && (
          <Text
            style={[
              styles.feedback,
              currentTermState.revealed ? styles.feedbackMuted : null,
              feedback === 'Correct!' ? styles.feedbackOk : null,
            ]}
          >
            {feedback}
          </Text>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {grid.numbered.map(({ number, entry }) => {
          const active =
            entry.termId === currentEntry.termId &&
            entry.orientation === (selected?.dir ?? 'across');
          return (
            <Pressable
              key={`${number}-${entry.orientation}`}
              onPress={() =>
                setSelected({ x: entry.startX, y: entry.startY, dir: entry.orientation })
              }
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                {number}
                {entry.orientation === 'across' ? 'A' : 'D'}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: spacing.lg + insets.bottom }]}>
        <Pressable onPress={finishSession} style={styles.doneBtn}>
          <Text style={styles.doneBtnLabel}>Done — finish session</Text>
        </Pressable>
      </View>
    </PuzzleShell>
  );
}

const styles = StyleSheet.create({
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  errorTitle: {
    color: colors.text,
    fontFamily: fonts.display.semibold,
    fontWeight: '600',
    fontSize: typography.title,
  },
  errorBody: {
    color: colors.muted,
    fontFamily: fonts.ui.regular,
    fontSize: typography.body,
    textAlign: 'center',
  },
  progressWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 12,
  },
  gridCard: {
    marginHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.xxl,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    ...shadows.card,
  },
  gridRow: {
    flexDirection: 'row',
  },
  cell: {
    width: CELL,
    height: CELL,
    borderRadius: 4,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellBlock: {
    width: CELL,
    height: CELL,
    borderRadius: 3,
    backgroundColor: colors.text,
  },
  cellSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  cellInWord: {
    backgroundColor: 'rgba(0,104,255,0.10)',
  },
  cellNumber: {
    position: 'absolute',
    top: 1,
    left: 3,
    color: colors.muted,
    fontFamily: fonts.ui.bold,
    fontWeight: '700',
    fontSize: 8,
    lineHeight: 9,
  },
  cellNumberInverse: {
    color: 'rgba(255,255,255,0.85)',
  },
  cellInput: {
    width: '100%',
    height: '100%',
    textAlign: 'center',
    color: colors.text,
    fontFamily: fonts.ui.bold,
    fontWeight: '700',
    fontSize: 16,
    padding: 0,
  },
  cellInputInverse: {
    color: colors.textOnAccent,
  },
  cellInputCorrect: {
    color: colors.accent,
  },
  clueCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  clueEyebrow: {
    color: colors.accent,
    fontFamily: fonts.ui.bold,
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  clueBody: {
    color: colors.text,
    fontFamily: fonts.display.medium,
    fontWeight: '500',
    fontSize: 19,
    lineHeight: 25,
    letterSpacing: -0.25,
  },
  clueActions: {
    flexDirection: 'row',
    gap: 8,
  },
  clueBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: radii.sm,
  },
  clueBtnPrimary: {
    backgroundColor: colors.accent,
    ...shadows.pill,
  },
  clueBtnSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  clueBtnPrimaryLabel: {
    color: colors.textOnAccent,
    fontFamily: fonts.ui.semibold,
    fontWeight: '600',
    fontSize: typography.bodySm,
  },
  clueBtnSecondaryLabel: {
    color: colors.text,
    fontFamily: fonts.ui.semibold,
    fontWeight: '600',
    fontSize: typography.bodySm,
  },
  feedback: {
    color: colors.text,
    fontFamily: fonts.ui.medium,
    fontSize: typography.caption,
  },
  feedbackOk: {
    color: palette.sage,
  },
  feedbackMuted: {
    color: colors.subtle,
  },
  chipRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 8,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipLabel: {
    color: colors.muted,
    fontFamily: fonts.ui.semibold,
    fontWeight: '600',
    fontSize: 13,
  },
  chipLabelActive: {
    color: colors.textOnAccent,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  doneBtn: {
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: 15,
    alignItems: 'center',
    ...shadows.button,
  },
  doneBtnLabel: {
    color: colors.textOnAccent,
    fontFamily: fonts.ui.semibold,
    fontWeight: '600',
    fontSize: typography.body,
  },
  summaryWrap: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryEyebrow: {
    color: colors.accent,
    fontFamily: fonts.ui.bold,
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  summaryHeadline: {
    color: colors.text,
    fontFamily: fonts.display.semibold,
    fontWeight: '600',
    fontSize: typography.title,
    textAlign: 'center',
  },
  summaryBody: {
    color: colors.muted,
    fontFamily: fonts.ui.regular,
    fontSize: typography.body,
    textAlign: 'center',
  },
  summaryNext: {
    color: colors.text,
    fontFamily: fonts.ui.regular,
    fontSize: typography.bodySm,
    textAlign: 'center',
  },
  summarySpace: {
    fontFamily: fonts.display.semibold,
    fontWeight: '600',
    fontStyle: 'italic',
  },
  errorBanner: {
    color: colors.text,
    backgroundColor: 'rgba(177,8,4,0.08)',
    padding: spacing.sm,
    borderRadius: radii.sm,
    fontFamily: fonts.ui.medium,
    fontSize: typography.caption,
    textAlign: 'center',
  },
});
