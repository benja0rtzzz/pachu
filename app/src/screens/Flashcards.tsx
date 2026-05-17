import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Rating, Review, SessionFinishResponse } from '@pachu/shared';
import { ProgressBar } from '../components/ProgressBar';
import { PuzzleComplete } from '../components/PuzzleComplete';
import { PuzzleShell } from '../components/PuzzleShell';
import { SecondaryButton } from '../components/PrimaryButton';
import { getPuzzleProgress, savePuzzleProgress } from '../api/puzzles';
import { useNavigation } from '../navigation/NavigationContext';
import { isFlashcardsPuzzle, useSession, useSpaces } from '../state/session';

interface FlashProgress {
  index: number;
  reviews: Review[];
}
import { colors, fonts, radii, shadows, spacing, typography } from '../theme';

// Flip duration, plus the settle delay before the next card's content is
// swapped in. Swapping earlier than the flip-back completes briefly exposes
// the *next* card's answer through the still-rotating face.
const FLIP_MS = 560;
const NEXT_CARD_DELAY_MS = FLIP_MS + 40;

const GRADES: { rating: Rating; label: string; tone: 'subtle' | 'accent-bg' | 'accent' }[] = [
  { rating: 1, label: 'Again', tone: 'subtle' },
  { rating: 2, label: 'Hard', tone: 'subtle' },
  { rating: 3, label: 'Good', tone: 'accent-bg' },
  { rating: 4, label: 'Easy', tone: 'accent' },
];

function formatDueTime(iso?: string): string {
  if (!iso) return 'no schedule yet';
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return iso;
  const now = Date.now();
  const diffMs = ts - now;
  const day = 24 * 60 * 60 * 1000;
  if (diffMs < 60 * 60 * 1000) return 'in under an hour';
  if (diffMs < day) return 'later today';
  if (diffMs < 2 * day) return 'tomorrow';
  const days = Math.round(diffMs / day);
  return `in ${days} days`;
}

export function FlashcardsScreen() {
  const insets = useSafeAreaInsets();
  const { goBack, navigate } = useNavigation();
  const { activePuzzle } = useSession();
  const { activeSpace } = useSpaces();
  const session = useSession();

  const puzzle =
    activePuzzle && isFlashcardsPuzzle(activePuzzle) ? activePuzzle : null;

  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [cardShownAt, setCardShownAt] = useState<number>(() => Date.now());
  const reviewsRef = useRef<Review[]>([]);
  const [summary, setSummary] = useState<{
    response: SessionFinishResponse | null;
    counts: Record<Rating, number>;
    total: number;
    spaceTitle: string;
  } | null>(null);
  const [finishError, setFinishError] = useState<string | null>(null);

  const flip = useSharedValue(0);

  useEffect(() => {
    flip.value = withTiming(flipped ? 1 : 0, {
      duration: FLIP_MS,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
    });
  }, [flip, flipped]);

  useEffect(() => {
    setCardShownAt(Date.now());
  }, [index]);

  // Resume: pull saved progress once and restore the deck position + ratings.
  const puzzleId = puzzle?.id;
  const itemCount = puzzle?.items.length ?? 0;
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!puzzleId || hydratedRef.current) return;
    hydratedRef.current = true;
    void getPuzzleProgress(puzzleId).then((p) => {
      const prog = p?.progress as FlashProgress | undefined;
      if (!prog) return;
      if (Array.isArray(prog.reviews)) reviewsRef.current = prog.reviews;
      if (
        typeof prog.index === 'number' &&
        prog.index > 0 &&
        prog.index < itemCount
      ) {
        setIndex(prog.index);
      }
    });
  }, [puzzleId, itemCount]);

  const frontStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1200 },
      { rotateY: `${interpolate(flip.value, [0, 1], [0, 180])}deg` },
    ],
  }));
  const backStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1200 },
      { rotateY: `${interpolate(flip.value, [0, 1], [180, 360])}deg` },
    ],
  }));

  // Summary first: finishing the session clears `activePuzzle`, which would
  // otherwise fall through to the "No flashcards loaded" guard below.
  if (summary) {
    const c = summary.counts;
    const dueLine = formatDueTime(summary.response?.nextDueAt);
    return (
      <PuzzleShell title="Flashcards" onBack={goBack} ditherIntensity="low">
        <PuzzleComplete
          headline={`${summary.total} ${summary.total === 1 ? 'card' : 'cards'} reviewed`}
          detail={`${c[3]} good · ${c[2]} hard · ${c[1]} again · ${c[4]} easy`}
          footnote={`Next due in ${summary.spaceTitle}: ${dueLine}`}
          error={finishError}
          onBack={goBack}
        />
      </PuzzleShell>
    );
  }

  if (!puzzle || puzzle.items.length === 0) {
    return (
      <PuzzleShell title="Flashcards" onBack={goBack} ditherIntensity="low">
        <View style={styles.centerFill}>
          <Text style={styles.errorTitle}>No flashcards loaded</Text>
          <Text style={styles.errorBody}>
            Generate a flashcards puzzle from a space to start reviewing.
          </Text>
          <SecondaryButton
            label="Back to spaces"
            onPress={() => navigate({ name: 'spaces' })}
          />
        </View>
      </PuzzleShell>
    );
  }

  const card = puzzle.items[index]!;
  const isLast = index >= puzzle.items.length - 1;

  const grade = async (rating: Rating) => {
    const ms = Math.max(0, Date.now() - cardShownAt);
    reviewsRef.current.push({ termId: card.termId, rating, ms, hintsUsed: 0 });

    if (!isLast) {
      void savePuzzleProgress(puzzle.id, {
        index: index + 1,
        reviews: reviewsRef.current,
      } satisfies FlashProgress);
      setFlipped(false);
      // Wait for the flip-back to fully complete before swapping in the next
      // card — otherwise the next answer flashes through the rotating face.
      setTimeout(() => setIndex((i) => i + 1), NEXT_CARD_DELAY_MS);
      return;
    }

    setFlipped(false);
    setFinishError(null);
    const counts: Record<Rating, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const r of reviewsRef.current) counts[r.rating] += 1;
    const fallbackTitle = activeSpace?.title ?? 'this space';
    try {
      const response = await session.finishActivePuzzle(reviewsRef.current);
      setSummary({
        response,
        counts,
        total: reviewsRef.current.length,
        spaceTitle: response?.space?.title ?? fallbackTitle,
      });
    } catch (err) {
      setFinishError(`Couldn't save results — ${(err as Error).message}`);
      setSummary({
        response: null,
        counts,
        total: reviewsRef.current.length,
        spaceTitle: fallbackTitle,
      });
    }
  };

  return (
    <PuzzleShell
      title="Flashcards"
      onBack={goBack}
      ditherIntensity="medium"
    >
      <View style={styles.progressWrap}>
        <ProgressBar value={index + 1} max={puzzle.items.length} />
      </View>

      <View style={styles.cardArea}>
        <Pressable onPress={() => setFlipped((f) => !f)} style={styles.cardPerspective}>
          <Animated.View style={[styles.cardFace, styles.cardFront, frontStyle]}>
            <Text style={styles.cardTag}>Flashcard</Text>
            <View style={styles.cardCenter}>
              <Text
                style={styles.cardFrontText}
                numberOfLines={6}
                adjustsFontSizeToFit
                minimumFontScale={0.5}
              >
                {card.front}
              </Text>
            </View>
            <View style={styles.cardHintRow}>
              <Text style={styles.cardHintText}>Tap to flip</Text>
            </View>
          </Animated.View>
          <Animated.View style={[styles.cardFace, styles.cardBack, backStyle]}>
            <Text style={[styles.cardTag, styles.cardTagInverse]}>Flashcard</Text>
            <View style={styles.cardCenter}>
              <Text
                style={styles.cardBackText}
                numberOfLines={9}
                adjustsFontSizeToFit
                minimumFontScale={0.5}
              >
                {card.back}
              </Text>
            </View>
            <Text style={styles.cardHintInverse}>Rate your recall</Text>
          </Animated.View>
        </Pressable>
      </View>

      <View style={[styles.gradeRow, { paddingBottom: spacing.xl + insets.bottom }]}>
        {!flipped ? (
          <Pressable
            onPress={() => setFlipped(true)}
            style={styles.showAnswer}
            accessibilityHint="Reveal the back of this card before grading"
          >
            <Text style={styles.showAnswerLabel}>Show answer</Text>
          </Pressable>
        ) : (
          GRADES.map((g) => (
            <Pressable
              key={g.rating}
              onPress={() => grade(g.rating)}
              style={[
                styles.gradeBtn,
                g.tone === 'subtle' && styles.gradeSubtle,
                g.tone === 'accent-bg' && styles.gradeAccentBg,
                g.tone === 'accent' && styles.gradeAccent,
              ]}
            >
              <Text
                style={[
                  styles.gradeLabel,
                  g.tone === 'accent' && styles.gradeLabelOnAccent,
                  g.tone === 'accent-bg' && styles.gradeLabelAccent,
                ]}
              >
                {g.label}
              </Text>
            </Pressable>
          ))
        )}
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
    paddingBottom: 18,
  },
  cardArea: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardPerspective: {
    width: '100%',
    maxWidth: 320,
    height: 360,
    position: 'relative',
  },
  cardFace: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    borderRadius: radii.card,
    padding: 26,
    backfaceVisibility: 'hidden',
  },
  cardFront: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.hero,
  },
  cardBack: {
    backgroundColor: colors.accent,
    ...shadows.hero,
  },
  cardTag: {
    color: colors.accent,
    fontFamily: fonts.ui.bold,
    fontWeight: '700',
    fontSize: 10.5,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  cardTagInverse: {
    color: 'rgba(255,255,255,0.7)',
  },
  cardCenter: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardFrontText: {
    color: colors.text,
    fontFamily: fonts.display.semibold,
    fontWeight: '600',
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -0.85,
    textAlign: 'center',
  },
  cardBackText: {
    color: colors.textOnAccent,
    fontFamily: fonts.display.medium,
    fontWeight: '500',
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.22,
    textAlign: 'center',
  },
  cardHintRow: {
    alignItems: 'center',
  },
  cardHintText: {
    color: colors.subtle,
    fontFamily: fonts.ui.regular,
    fontSize: typography.caption,
  },
  cardHintInverse: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: fonts.ui.regular,
    fontSize: typography.caption,
    textAlign: 'center',
  },
  gradeRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  showAnswer: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: radii.sm,
    alignItems: 'center',
    backgroundColor: colors.accent,
    ...shadows.button,
  },
  showAnswerLabel: {
    color: colors.textOnAccent,
    fontFamily: fonts.ui.semibold,
    fontWeight: '600',
    fontSize: typography.body,
  },
  gradeBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradeSubtle: {
    backgroundColor: 'rgba(11,15,25,0.06)',
  },
  gradeAccentBg: {
    backgroundColor: 'rgba(0,104,255,0.08)',
  },
  gradeAccent: {
    backgroundColor: colors.accent,
    ...shadows.pill,
  },
  gradeLabel: {
    color: colors.text,
    fontFamily: fonts.ui.semibold,
    fontWeight: '600',
    fontSize: typography.bodySm,
  },
  gradeLabelAccent: {
    color: colors.accent,
  },
  gradeLabelOnAccent: {
    color: colors.textOnAccent,
  },
});
