import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type {
  CrosswordEntry,
  Rating,
  Review,
  SessionFinishResponse,
} from '@pachu/shared';
import { palette } from '@pachu/shared';
import { getPuzzleProgress, savePuzzleProgress } from '../api/puzzles';
import { useCoach } from '../api/ws';
import { CoachOverlay } from '../components/CoachOverlay';
import { ProgressBar } from '../components/ProgressBar';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PuzzleComplete } from '../components/PuzzleComplete';
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
  const coach = useCoach();
  const { width: windowWidth } = useWindowDimensions();
  const puzzle =
    activePuzzle && isCrosswordPuzzle(activePuzzle) ? activePuzzle : null;

  const grid = useMemo(
    () => (puzzle ? buildGrid(puzzle.width, puzzle.height, puzzle.entries) : null),
    [puzzle],
  );

  // Scale cell size down so the grid always fits within the card's available
  // width. cardMargin (16 * 2) + cardPadding (6 * 2) = 44px consumed by card.
  const availableWidth = windowWidth - 44;
  const cellSize = puzzle
    ? Math.min(CELL, Math.floor((availableWidth - (puzzle.width - 1) * GAP) / puzzle.width))
    : CELL;

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

  const [hintCooldown, setHintCooldown] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear cooldown whenever the selected cell changes. `selected` is defined
  // above the early-return guard; `currentEntry` is not (it is derived below
  // that guard), so we can't reference it here. Using `selected` is correct:
  // the user picking any new cell always changes `selected`, which resets the
  // per-word cooldown.
  useEffect(() => {
    setHintCooldown(false);
    if (hintTimer.current) clearTimeout(hintTimer.current);
  }, [selected]);

  const [feedback, setFeedback] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    response: SessionFinishResponse | null;
    counts: { correct: number; revealed: number; wrong: number };
    spaceTitle: string;
  } | null>(null);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);

  // --- Progress persistence -------------------------------------------------
  // Hydrate saved letters/term-states once, then persist EXPLICITLY on Submit
  // / Reveal / Hint. (A debounced autosave got cancelled by its own cleanup on
  // every keystroke and on unmount, so nothing survived a "back".)
  const puzzleId = puzzle?.id;
  const hydratedRef = useRef(false);
  const readyRef = useRef(false);
  useEffect(() => {
    if (!puzzleId || hydratedRef.current) return;
    hydratedRef.current = true;
    void getPuzzleProgress(puzzleId)
      .then((p) => {
        const prog = p?.progress as
          | { letters?: Record<string, string>; termStates?: Record<string, PerTermState> }
          | undefined;
        if (prog?.letters) setLetters(prog.letters);
        if (prog?.termStates) setTermStates(prog.termStates);
      })
      .finally(() => {
        readyRef.current = true;
      });
  }, [puzzleId]);

  const persist = (
    nextLetters: Record<string, string>,
    nextTermStates: Record<string, PerTermState>,
  ) => {
    if (!puzzleId || !readyRef.current) return;
    void savePuzzleProgress(puzzleId, {
      letters: nextLetters,
      termStates: nextTermStates,
    });
  };

  // Summary must be checked BEFORE the no-puzzle guard: finishing the session
  // clears `activePuzzle`, so without this the stats screen would be masked by
  // the "No crossword loaded" fallback.
  if (summary) {
    return (
      <PuzzleShell title="Crossword" onBack={goBack} ditherIntensity="low">
        <PuzzleComplete
          headline={`${summary.counts.correct} solved`}
          detail={`${summary.counts.correct} correct · ${summary.counts.revealed} revealed · ${summary.counts.wrong} skipped`}
          footnote={`Saved to ${summary.spaceTitle}`}
          error={finishError}
          onBack={goBack}
        />
      </PuzzleShell>
    );
  }

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

  // Entries the user never solved or revealed get rating "Again" (wrong) at
  // finish — warn before ending so a mis-tap doesn't tank a half-done puzzle.
  const incompleteCount = puzzle.entries.filter((e) => {
    const s = termStates[e.termId] ?? emptyTermState();
    return !(s.correct || s.revealed);
  }).length;

  const handleDone = () => {
    if (incompleteCount > 0) setConfirmEnd(true);
    else void finishSession();
  };

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
    const guessStr = guess.join('');
    const correct = guessStr === currentEntry.term.toUpperCase();
    const cur = termStates[currentEntry.termId] ?? emptyTermState();
    const nextTermStates: Record<string, PerTermState> = {
      ...termStates,
      [currentEntry.termId]: {
        ...cur,
        attempts: cur.attempts + 1,
        correct: cur.correct || correct,
      },
    };
    setTermStates(nextTermStates);
    persist(letters, nextTermStates);
    setFeedback(
      correct ? 'Correct!' : `Not quite — keep trying ${currentEntry.term.length}-letter answer`,
    );
    if (!correct) {
      // Stream the wrong attempt so a follow-up tier-1 hint has context.
      coach.send({
        type: 'mistake',
        termId: currentEntry.termId,
        observation: `Tried "${guessStr}" for "${currentEntry.term}"`,
      });
    }
  };

  const requestHint = () => {
    const cur = termStates[currentEntry.termId] ?? emptyTermState();
    if (cur.revealed || hintCooldown) return;
    const tier = Math.min(2, cur.hintsUsed + 1) as 1 | 2;
    coach.send({ type: 'hint_request', termId: currentEntry.termId, tier });
    const nextTermStates: Record<string, PerTermState> = {
      ...termStates,
      [currentEntry.termId]: { ...cur, hintsUsed: cur.hintsUsed + 1 },
    };
    setTermStates(nextTermStates);
    persist(letters, nextTermStates);
    setHintCooldown(true);
    hintTimer.current = setTimeout(() => setHintCooldown(false), 8000);
  };

  const revealCurrent = () => {
    const nextLetters: Record<string, string> = { ...letters };
    for (let i = 0; i < currentEntry.term.length; i++) {
      const x =
        currentEntry.orientation === 'across' ? currentEntry.startX + i : currentEntry.startX;
      const y =
        currentEntry.orientation === 'down' ? currentEntry.startY + i : currentEntry.startY;
      nextLetters[`${x},${y}`] = currentEntry.term[i]!.toUpperCase();
    }
    setLetters(nextLetters);
    const cur = termStates[currentEntry.termId] ?? emptyTermState();
    const nextTermStates: Record<string, PerTermState> = {
      ...termStates,
      [currentEntry.termId]: { ...cur, revealed: true, correct: false },
    };
    setTermStates(nextTermStates);
    persist(nextLetters, nextTermStates);
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

  return (
    <PuzzleShell
      title="Crossword"
      onBack={goBack}
      ditherIntensity="medium"
    >
      {/* Scrollable area — grid + clue card + chip strip */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.progressWrap}>
          <ProgressBar value={filledCount} max={totalCount} />
        </View>

        <View style={styles.gridCard}>
          <View style={styles.gridInner}>
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
                          { width: cellSize, height: cellSize, marginRight: x < puzzle.width - 1 ? GAP : 0 },
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
                        { width: cellSize, height: cellSize, marginRight: x < puzzle.width - 1 ? GAP : 0 },
                        isSel && styles.cellSelected,
                        !isSel && inWord && styles.cellInWord,
                      ]}
                    >
                      {cell.number !== undefined && (
                        <Text
                          style={[
                            styles.cellNumber,
                            { fontSize: Math.max(6, cellSize * 0.22) },
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
                          { fontSize: Math.max(10, cellSize * 0.44) },
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

          {!(currentTermState.correct || currentTermState.revealed) && (
            <View style={styles.clueActions}>
              <Pressable
                onPress={requestHint}
                disabled={(currentTermState.hintsUsed ?? 0) >= 2 || hintCooldown}
                style={[
                  styles.clueBtn,
                  styles.clueBtnSecondary,
                  ((currentTermState.hintsUsed ?? 0) >= 2 || hintCooldown) && styles.clueBtnDisabled,
                ]}
              >
                <Text style={styles.clueBtnSecondaryLabel}>
                  {hintCooldown
                    ? 'Hint…'
                    : currentTermState.hintsUsed === 0
                      ? 'Hint'
                      : currentTermState.hintsUsed >= 2
                        ? 'No more hints'
                        : `Hint (${currentTermState.hintsUsed}/2)`}
                </Text>
              </Pressable>
              <Pressable onPress={revealCurrent} style={[styles.clueBtn, styles.clueBtnSecondary]}>
                <Text style={styles.clueBtnSecondaryLabel}>Reveal</Text>
              </Pressable>
              <Pressable onPress={submitCurrent} style={[styles.clueBtn, styles.clueBtnPrimary]}>
                <Text style={styles.clueBtnPrimaryLabel}>Submit</Text>
              </Pressable>
            </View>
          )}
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
      </ScrollView>

      {/* Footer stays pinned at the bottom regardless of content height */}
      <View style={[styles.footer, { paddingBottom: spacing.lg + insets.bottom }]}>
        <Pressable onPress={handleDone} style={styles.doneBtn}>
          <Text style={styles.doneBtnLabel}>Done — finish session</Text>
        </Pressable>
      </View>

      <CoachOverlay termId={currentEntry.termId} maxVisible={3} />

      <ConfirmDialog
        visible={confirmEnd}
        title="End session now?"
        message={`${incompleteCount} ${
          incompleteCount === 1 ? 'answer is' : 'answers are'
        } still unsolved. Ending now marks ${
          incompleteCount === 1 ? 'it' : 'them'
        } wrong (rated "Again"). Continue?`}
        confirmLabel="End session"
        cancelLabel="Keep solving"
        tone="danger"
        onConfirm={() => {
          setConfirmEnd(false);
          void finishSession();
        }}
        onCancel={() => setConfirmEnd(false)}
      />
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.md,
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
  gridInner: {
    paddingHorizontal: 6,
    paddingVertical: 6,
    alignItems: 'flex-start',
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
  clueBtnDisabled: {
    opacity: 0.5,
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
});
