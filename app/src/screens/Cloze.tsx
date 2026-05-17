import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ClozeItem, Rating, Review, SessionFinishResponse } from '@pachu/shared';
import { MASK_TOKEN, palette } from '@pachu/shared';
import { ProgressBar } from '../components/ProgressBar';
import { PuzzleShell } from '../components/PuzzleShell';
import { SecondaryButton } from '../components/PrimaryButton';
import { useNavigation } from '../navigation/NavigationContext';
import { isClozePuzzle, useSession, useSpaces } from '../state/session';
import { colors, fonts, radii, shadows, spacing, typography } from '../theme';

const MAX_ATTEMPTS_BEFORE_FORCE_REVEAL = 3;

interface PerItemState {
  startedAt: number;
  attempts: number;
  hintsUsed: number;
  correct: boolean;
  revealed: boolean;
}

function emptyItemState(): PerItemState {
  return {
    startedAt: Date.now(),
    attempts: 0,
    hintsUsed: 0,
    correct: false,
    revealed: false,
  };
}

/**
 * Map a finished item to a Rating. Mirrors the ratingMapper.mapCloze rule
 * from PLAN.md: correct first-try & no hints → Easy(4); correct → Good(3);
 * second-try correct → Hard(2); revealed or no-answer → Again(1).
 */
function mapRating(s: PerItemState): Rating {
  if (s.revealed || (!s.correct && s.attempts >= MAX_ATTEMPTS_BEFORE_FORCE_REVEAL)) return 1;
  if (!s.correct) return 1;
  if (s.attempts <= 1 && s.hintsUsed === 0) return 4;
  if (s.attempts <= 2 && s.hintsUsed <= 1) return 3;
  return 2;
}

export function ClozeScreen() {
  const insets = useSafeAreaInsets();
  const { goBack, navigate } = useNavigation();
  const { activePuzzle } = useSession();
  const { activeSpace } = useSpaces();
  const session = useSession();
  const puzzle =
    activePuzzle && isClozePuzzle(activePuzzle) ? activePuzzle : null;

  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState('');
  const [state, setState] = useState<PerItemState>(emptyItemState());
  const [submitted, setSubmitted] = useState<'correct' | 'wrong' | null>(null);
  const itemStatesRef = useRef<Map<string, PerItemState>>(new Map());
  const [finishError, setFinishError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    response: SessionFinishResponse | null;
    total: number;
    correctCount: number;
    spaceTitle: string;
  } | null>(null);

  const item: ClozeItem | undefined = puzzle?.items[index];

  useEffect(() => {
    setState(emptyItemState());
    setDraft('');
    setSubmitted(null);
  }, [index]);

  if (!puzzle || puzzle.items.length === 0) {
    return (
      <PuzzleShell title="Cloze" onBack={goBack} ditherIntensity="low">
        <View style={styles.centerFill}>
          <Text style={styles.errorTitle}>No cloze items loaded</Text>
          <Text style={styles.errorBody}>
            Generate a cloze puzzle from a space to start practicing.
          </Text>
          <SecondaryButton
            label="Back to spaces"
            onPress={() => navigate({ name: 'spaces' })}
          />
        </View>
      </PuzzleShell>
    );
  }

  if (!item) {
    // Defensive: index past the end.
    return null;
  }

  const total = puzzle.items.length;
  const isLast = index >= total - 1;
  const sentenceParts = item.sentence.split(MASK_TOKEN);
  const blankWidth = Math.max(80, item.answer.length * 13);

  const submit = () => {
    const guess = draft.trim();
    if (!guess) return;
    const correct = guess.toLowerCase() === item.answer.toLowerCase();
    const next: PerItemState = {
      ...state,
      attempts: state.attempts + 1,
      correct,
    };
    setState(next);
    setSubmitted(correct ? 'correct' : 'wrong');
    if (!correct && next.attempts >= MAX_ATTEMPTS_BEFORE_FORCE_REVEAL) {
      // Force reveal so the user always advances.
      setState({ ...next, revealed: true });
      setDraft(item.answer);
    }
  };

  const reveal = () => {
    setState({ ...state, revealed: true, correct: false });
    setDraft(item.answer);
    setSubmitted('wrong');
  };

  const finishSession = async () => {
    const finalStates = new Map(itemStatesRef.current);
    finalStates.set(item.termId, state);

    const reviews: Review[] = puzzle.items.map((it) => {
      const s = finalStates.get(it.termId) ?? emptyItemState();
      return {
        termId: it.termId,
        rating: mapRating(s),
        ms: Math.max(0, Date.now() - s.startedAt),
        hintsUsed: s.hintsUsed,
      };
    });

    const correctCount = Array.from(finalStates.values()).filter((s) => s.correct).length;
    const fallbackTitle = activeSpace?.title ?? 'this space';

    try {
      const response = await session.finishActivePuzzle(reviews);
      setSummary({
        response,
        total: reviews.length,
        correctCount,
        spaceTitle: response?.space?.title ?? fallbackTitle,
      });
    } catch (err) {
      setFinishError(`Couldn't save results — ${(err as Error).message}`);
      setSummary({
        response: null,
        total: reviews.length,
        correctCount,
        spaceTitle: fallbackTitle,
      });
    }
  };

  const next = async () => {
    itemStatesRef.current.set(item.termId, state);
    if (isLast) {
      await finishSession();
      return;
    }
    setIndex((i) => i + 1);
  };

  if (summary) {
    return (
      <PuzzleShell title="Cloze" onBack={goBack} ditherIntensity="low">
        <View style={[styles.summaryWrap, { paddingBottom: spacing.xl + insets.bottom }]}>
          <Text style={styles.summaryEyebrow}>Session complete</Text>
          <Text style={styles.summaryHeadline}>
            {summary.correctCount} / {summary.total} correct
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

  const showWrongCue = submitted === 'wrong' && !state.revealed;
  const showCorrectCue = submitted === 'correct' || state.revealed;

  return (
    <PuzzleShell
      title="Cloze"
      onBack={() => navigate({ name: 'space', spaceId: puzzle.spaceId })}
      ditherIntensity="medium"
    >
      <View style={styles.progressWrap}>
        <ProgressBar value={index + 1} max={total} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: spacing.xl + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardEyebrow}>From your notes</Text>
            <View
              style={[
                styles.modeChip,
                item.mode === 'anchored' ? styles.modeAnchored : styles.modeGenerated,
              ]}
            >
              <Text
                style={[
                  styles.modeChipLabel,
                  item.mode === 'anchored'
                    ? styles.modeAnchoredLabel
                    : styles.modeGeneratedLabel,
                ]}
              >
                {item.mode === 'anchored' ? 'Anchored' : 'Generated'}
              </Text>
            </View>
          </View>

          <View style={styles.sentence}>
            {sentenceParts.map((piece, i) => (
              <View key={`piece-${i}`} style={styles.sentenceRow}>
                {piece.length > 0 && <Text style={styles.sentenceText}>{piece}</Text>}
                {i < sentenceParts.length - 1 && (
                  <View style={[styles.blank, { width: blankWidth }]}>
                    <TextInput
                      value={draft}
                      onChangeText={(v) => {
                        if (state.revealed) return;
                        setDraft(v);
                        if (submitted !== null) setSubmitted(null);
                      }}
                      editable={!state.revealed}
                      placeholder={item.answer.length > 0 ? `${item.answer.length} letters` : 'answer'}
                      placeholderTextColor={colors.subtle}
                      style={[
                        styles.blankInput,
                        showCorrectCue && styles.blankInputCorrect,
                        showWrongCue && styles.blankInputWrong,
                      ]}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                )}
              </View>
            ))}
          </View>

          <View style={styles.sourceFooter}>
            <Text style={styles.sourceLabel}>Source</Text>
            <Text style={styles.sourceText} numberOfLines={3}>
              {item.sourceChunk}
            </Text>
          </View>
        </View>

        {submitted === 'correct' && (
          <Text style={styles.feedbackOk}>Correct</Text>
        )}
        {submitted === 'wrong' && !state.revealed && (
          <Text style={styles.feedbackWrong}>
            Try again — attempt {state.attempts}/{MAX_ATTEMPTS_BEFORE_FORCE_REVEAL}
          </Text>
        )}

        {item.previousMode && item.previousMode !== item.mode && (
          <Text style={styles.regeneratedBadge}>
            Regenerated for you (was {item.previousMode})
          </Text>
        )}
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: spacing.lg + insets.bottom }]}>
        {!state.correct && !state.revealed && submitted !== 'correct' && (
          <>
            <Pressable onPress={reveal} style={[styles.actionBtn, styles.actionSecondary]}>
              <Text style={styles.actionSecondaryLabel}>Reveal</Text>
            </Pressable>
            <Pressable
              onPress={submit}
              disabled={draft.trim().length === 0}
              style={[
                styles.actionBtn,
                styles.actionPrimary,
                draft.trim().length === 0 && styles.actionDisabled,
              ]}
            >
              <Text style={styles.actionPrimaryLabel}>Submit</Text>
            </Pressable>
          </>
        )}
        {(state.correct || state.revealed) && (
          <Pressable onPress={next} style={[styles.actionBtn, styles.actionPrimary, styles.actionFull]}>
            <Text style={styles.actionPrimaryLabel}>
              {isLast ? 'Finish session' : 'Next →'}
            </Text>
          </Pressable>
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
    paddingBottom: 12,
  },
  scroll: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    ...shadows.card,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  cardEyebrow: {
    color: colors.subtle,
    fontFamily: fonts.ui.bold,
    fontWeight: '700',
    fontSize: 10.5,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  modeChip: {
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: radii.pill,
  },
  modeAnchored: {
    backgroundColor: 'rgba(0,104,255,0.08)',
  },
  modeGenerated: {
    backgroundColor: 'rgba(127,176,105,0.14)',
  },
  modeChipLabel: {
    fontFamily: fonts.ui.bold,
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  modeAnchoredLabel: {
    color: colors.accent,
  },
  modeGeneratedLabel: {
    color: palette.sage,
  },
  sentence: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
  },
  sentenceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
  },
  sentenceText: {
    color: colors.text,
    fontFamily: fonts.display.regular,
    fontWeight: '400',
    fontSize: 22,
    lineHeight: 34,
    letterSpacing: -0.22,
  },
  blank: {
    marginHorizontal: 4,
    transform: [{ translateY: 4 }],
  },
  blankInput: {
    backgroundColor: 'rgba(0,104,255,0.06)',
    borderBottomWidth: 2,
    borderBottomColor: colors.accent,
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 8,
    textAlign: 'center',
    fontFamily: fonts.display.semibold,
    fontWeight: '600',
    fontSize: 21,
    color: colors.text,
  },
  blankInputCorrect: {
    backgroundColor: 'rgba(127,176,105,0.16)',
    borderBottomColor: palette.sage,
    color: palette.sage,
  },
  blankInputWrong: {
    backgroundColor: 'rgba(177,8,4,0.07)',
    borderBottomColor: '#b10804',
  },
  sourceFooter: {
    marginTop: 22,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 6,
  },
  sourceLabel: {
    color: colors.subtle,
    fontFamily: fonts.ui.bold,
    fontWeight: '700',
    fontSize: 9.5,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  sourceText: {
    color: colors.muted,
    fontFamily: fonts.ui.regular,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  feedbackOk: {
    color: palette.sage,
    fontFamily: fonts.ui.semibold,
    fontWeight: '600',
    fontSize: typography.bodySm,
    textAlign: 'center',
  },
  feedbackWrong: {
    color: '#b10804',
    fontFamily: fonts.ui.medium,
    fontSize: typography.caption,
    textAlign: 'center',
  },
  regeneratedBadge: {
    alignSelf: 'center',
    color: palette.sage,
    fontFamily: fonts.ui.semibold,
    fontWeight: '600',
    fontSize: typography.caption,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(127,176,105,0.14)',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
  },
  actionPrimary: {
    backgroundColor: colors.accent,
    ...shadows.button,
  },
  actionSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  actionDisabled: {
    opacity: 0.55,
  },
  actionFull: {
    flex: 1,
  },
  actionPrimaryLabel: {
    color: colors.textOnAccent,
    fontFamily: fonts.ui.semibold,
    fontWeight: '600',
    fontSize: typography.body,
  },
  actionSecondaryLabel: {
    color: colors.text,
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
