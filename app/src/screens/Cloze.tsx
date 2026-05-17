import { useEffect, useMemo, useRef, useState } from 'react';
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
import { useCoach } from '../api/ws';
import { CoachOverlay } from '../components/CoachOverlay';
import { ProgressBar } from '../components/ProgressBar';
import { PuzzleComplete } from '../components/PuzzleComplete';
import { PuzzleShell } from '../components/PuzzleShell';
import { SecondaryButton } from '../components/PrimaryButton';
import { getPuzzleProgress, savePuzzleProgress } from '../api/puzzles';
import { useNavigation } from '../navigation/NavigationContext';
import { isClozePuzzle, useSession, useSpaces } from '../state/session';
import { colors, fonts, radii, shadows, spacing, typography } from '../theme';

const MAX_ATTEMPTS_BEFORE_FORCE_REVEAL = 3;
const HINT_COOLDOWN_MS = 8000;

/**
 * Blank out every occurrence of the answer in the source snippet so the
 * "Source" footer can't spoil the cloze. Case-insensitive; non-ASCII answers
 * fall back to a plain global replace (word boundaries don't help for CJK).
 */
function redactAnswer(text: string, answer: string): string {
  const a = answer.trim();
  if (!a) return text;
  const blank = '█'.repeat(Math.max(3, a.length));
  if (/[^\x00-\x7F]/.test(a)) {
    return text.split(a).join(blank);
  }
  const esc = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`\\b${esc}\\b`, 'gi'), blank);
}

const CELL_W = 19;
const CELL_H = 30;
const SPACE_W = 9;

type GridTok =
  | { kind: 'word'; chars: string[] }
  | { kind: 'space' }
  | { kind: 'blank' };

/**
 * Duolingo-style character grid: every glyph of the sentence — not just the
 * answer — sits in a fixed-size cell, so the text wraps predictably per word
 * and the blank lines up with the rest. The blank is N input cells backed by
 * a single transparent TextInput so typing/caret stays native.
 */
function ClozeCharGrid({
  sentence,
  answerLen,
  draft,
  editable,
  onChange,
  tone,
}: {
  sentence: string;
  answerLen: number;
  draft: string;
  editable: boolean;
  onChange: (v: string) => void;
  tone: 'idle' | 'correct' | 'wrong';
}) {
  const inputRef = useRef<TextInput>(null);
  const len = Math.max(answerLen, 1);

  const tokens = useMemo<GridTok[]>(() => {
    const parts = sentence.split(MASK_TOKEN);
    const before = parts[0] ?? '';
    const after = parts.slice(1).join(' ');
    const out: GridTok[] = [];
    const pushText = (txt: string) => {
      for (const seg of txt.split(/(\s+)/)) {
        if (seg === '') continue;
        if (/^\s+$/.test(seg)) {
          for (let i = 0; i < seg.length; i++) out.push({ kind: 'space' });
        } else {
          out.push({ kind: 'word', chars: Array.from(seg) });
        }
      }
    };
    pushText(before);
    out.push({ kind: 'blank' });
    pushText(after);
    return out;
  }, [sentence]);

  const focusBlank = () => {
    if (editable) inputRef.current?.focus();
  };

  return (
    <View style={styles.grid}>
      {tokens.map((tok, ti) => {
        if (tok.kind === 'space') {
          return <View key={`s-${ti}`} style={styles.gridSpace} />;
        }
        if (tok.kind === 'blank') {
          return (
            <Pressable key={`b-${ti}`} onPress={focusBlank} style={styles.gridWord}>
              {Array.from({ length: len }).map((_, i) => (
                <View
                  key={`bc-${i}`}
                  style={[
                    styles.gridCell,
                    styles.blankCell,
                    tone === 'correct' && styles.blankCellCorrect,
                    tone === 'wrong' && styles.blankCellWrong,
                  ]}
                >
                  <Text
                    style={[
                      styles.gridChar,
                      tone === 'correct' && styles.gridCharCorrect,
                    ]}
                  >
                    {draft[i] ?? ''}
                  </Text>
                </View>
              ))}
              <TextInput
                ref={inputRef}
                value={draft}
                onChangeText={onChange}
                editable={editable}
                maxLength={len}
                autoCapitalize="none"
                autoCorrect={false}
                caretHidden
                style={styles.gridHiddenInput}
              />
            </Pressable>
          );
        }
        return (
          <Text key={`w-${ti}`} style={styles.gridWordText}>
            {tok.chars.join('')}
          </Text>
        );
      })}
    </View>
  );
}

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

interface ClozeProgress {
  index: number;
  itemStates: Record<string, PerItemState>;
  drafts: Record<string, string>;
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
  const coach = useCoach();
  const puzzle =
    activePuzzle && isClozePuzzle(activePuzzle) ? activePuzzle : null;

  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState('');
  const [state, setState] = useState<PerItemState>(emptyItemState());
  const [submitted, setSubmitted] = useState<'correct' | 'wrong' | null>(null);
  const [hintCooldown, setHintCooldown] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemStatesRef = useRef<Map<string, PerItemState>>(new Map());
  const [finishError, setFinishError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    response: SessionFinishResponse | null;
    total: number;
    correctCount: number;
    spaceTitle: string;
  } | null>(null);

  const item: ClozeItem | undefined = puzzle?.items[index];

  // When resuming, the [index] effect must NOT wipe the restored item — this
  // ref carries the saved state/draft for the landed index for one run.
  const resumeRef = useRef<{ state: PerItemState; draft: string } | null>(null);

  useEffect(() => {
    if (resumeRef.current) {
      const r = resumeRef.current;
      resumeRef.current = null;
      setState(r.state);
      setDraft(r.draft);
      setSubmitted(
        r.state.correct ? 'correct' : r.state.revealed ? 'wrong' : null,
      );
      return;
    }
    setState(emptyItemState());
    setDraft('');
    setSubmitted(null);
    setHintCooldown(false);
    if (hintTimer.current) clearTimeout(hintTimer.current);
  }, [index]);

  useEffect(() => () => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
  }, []);

  // --- Progress persistence ------------------------------------------------
  const puzzleId = puzzle?.id;
  const itemCount = puzzle?.items.length ?? 0;
  const hydratedRef = useRef(false);
  // Only true once the GET resolves — guards persist() so a user action in
  // the fetch window can't overwrite saved progress with empty state.
  const readyRef = useRef(false);

  useEffect(() => {
    if (!puzzleId || hydratedRef.current) return;
    hydratedRef.current = true;
    void getPuzzleProgress(puzzleId)
      .then((p) => {
        const prog = p?.progress as ClozeProgress | undefined;
        if (!prog || !puzzle) return;
        if (prog.itemStates) {
          for (const [k, v] of Object.entries(prog.itemStates)) {
            itemStatesRef.current.set(k, v);
          }
        }
        const ri =
          typeof prog.index === 'number'
            ? Math.min(Math.max(0, prog.index), Math.max(0, itemCount - 1))
            : 0;
        const termId = puzzle.items[ri]?.termId;
        if (!termId) return;
        const savedState = itemStatesRef.current.get(termId) ?? emptyItemState();
        const savedDraft = prog.drafts?.[termId] ?? '';
        if (ri > 0) {
          // [index] effect re-runs on the index change and applies resumeRef.
          resumeRef.current = { state: savedState, draft: savedDraft };
          setIndex(ri);
        } else {
          // Already on index 0 — the [index] effect won't fire, restore inline.
          setState(savedState);
          setDraft(savedDraft);
          setSubmitted(
            savedState.correct ? 'correct' : savedState.revealed ? 'wrong' : null,
          );
        }
      })
      .finally(() => {
        readyRef.current = true;
      });
  }, [puzzleId, itemCount, puzzle]);

  // Explicit, immediate persist. The earlier debounced autosave was cancelled
  // by its own cleanup whenever `index` advanced or the screen unmounted, so
  // little/nothing survived a "back". We snapshot synchronously instead.
  const persist = (over: {
    index?: number;
    curState?: PerItemState;
    curDraft?: string;
  }) => {
    if (!puzzleId || !readyRef.current || !item) return;
    const curState = over.curState ?? state;
    const itemStates: Record<string, PerItemState> = {};
    itemStatesRef.current.forEach((v, k) => {
      itemStates[k] = v;
    });
    itemStates[item.termId] = curState;
    void savePuzzleProgress(puzzleId, {
      index: over.index ?? index,
      itemStates,
      drafts: { [item.termId]: over.curDraft ?? draft },
    } satisfies ClozeProgress);
  };

  // Snapshot on unmount so a plain "back" (typed into the blank but no Submit
  // yet) survives. Reading from refs in the cleanup avoids the stale-closure
  // trap and the cancelled-timer trap the old debounced autosave fell into.
  const indexRef = useRef(index);
  indexRef.current = index;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const stateRef = useRef(state);
  stateRef.current = state;
  const itemRef = useRef(item);
  itemRef.current = item;
  useEffect(() => {
    return () => {
      if (!puzzleId || !readyRef.current) return;
      const it = itemRef.current;
      if (!it) return;
      const itemStates: Record<string, PerItemState> = {};
      itemStatesRef.current.forEach((v, k) => {
        itemStates[k] = v;
      });
      itemStates[it.termId] = stateRef.current;
      void savePuzzleProgress(puzzleId, {
        index: indexRef.current,
        itemStates,
        drafts: { [it.termId]: draftRef.current },
      } satisfies ClozeProgress);
    };
  }, [puzzleId]);

  // Summary first: finishing the session clears `activePuzzle`, which would
  // otherwise fall through to the "No cloze items loaded" guard below.
  if (summary) {
    return (
      <PuzzleShell title="Cloze" onBack={goBack} ditherIntensity="low">
        <PuzzleComplete
          headline={`${summary.correctCount} / ${summary.total} correct`}
          footnote={`Saved to ${summary.spaceTitle}`}
          error={finishError}
          onBack={goBack}
        />
      </PuzzleShell>
    );
  }

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
    if (!correct) {
      // Stream the wrong attempt as a mistake observation so a follow-up
      // tier-1 hint request can be grounded in what the user actually typed.
      coach.send({
        type: 'mistake',
        termId: item.termId,
        observation: `Wrote "${guess}" for "${item.answer}"`,
      });
    }
    if (!correct && next.attempts >= MAX_ATTEMPTS_BEFORE_FORCE_REVEAL) {
      // Force reveal so the user always advances.
      const forced = { ...next, revealed: true };
      setState(forced);
      setDraft(item.answer);
      itemStatesRef.current.set(item.termId, forced);
      persist({ curState: forced, curDraft: item.answer });
      return;
    }
    itemStatesRef.current.set(item.termId, next);
    persist({ curState: next });
  };

  // Tier escalation: first tap → pattern, second → LLM nudge. A short
  // cooldown between requests stops a double-tap from burning both tiers at
  // once (matches the Crossword behaviour).
  const requestHint = () => {
    if (state.hintsUsed >= 2 || hintCooldown) return;
    const tier = Math.min(2, state.hintsUsed + 1) as 1 | 2;
    coach.send({ type: 'hint_request', termId: item.termId, tier });
    const hinted = { ...state, hintsUsed: state.hintsUsed + 1 };
    setState(hinted);
    itemStatesRef.current.set(item.termId, hinted);
    persist({ curState: hinted });
    setHintCooldown(true);
    hintTimer.current = setTimeout(() => setHintCooldown(false), HINT_COOLDOWN_MS);
  };

  const reveal = () => {
    const revealed = { ...state, revealed: true, correct: false };
    setState(revealed);
    setDraft(item.answer);
    setSubmitted('wrong');
    itemStatesRef.current.set(item.termId, revealed);
    persist({ curState: revealed, curDraft: item.answer });
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
    persist({ index: index + 1, curState: state });
    setIndex((i) => i + 1);
  };

  const showWrongCue = submitted === 'wrong' && !state.revealed;
  const showCorrectCue = submitted === 'correct' || state.revealed;

  return (
    <PuzzleShell
      title="Cloze"
      onBack={goBack}
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

          <ClozeCharGrid
            sentence={item.sentence}
            answerLen={item.answer.length}
            draft={draft}
            editable={!state.revealed}
            onChange={(v) => {
              if (state.revealed) return;
              setDraft(v);
              if (submitted !== null) setSubmitted(null);
            }}
            tone={showCorrectCue ? 'correct' : showWrongCue ? 'wrong' : 'idle'}
          />

          <View style={styles.sourceFooter}>
            <Text style={styles.sourceLabel}>Source</Text>
            <Text style={styles.sourceText} numberOfLines={3}>
              {redactAnswer(item.sourceChunk, item.answer)}
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
            <Pressable
              onPress={requestHint}
              disabled={state.hintsUsed >= 2 || hintCooldown}
              style={[
                styles.actionBtn,
                styles.actionSecondary,
                (state.hintsUsed >= 2 || hintCooldown) && styles.actionDisabled,
              ]}
            >
              <Text style={styles.actionSecondaryLabel}>
                {hintCooldown
                  ? 'Hint…'
                  : state.hintsUsed === 0
                    ? 'Hint'
                    : state.hintsUsed >= 2
                      ? 'No more hints'
                      : `Hint (${state.hintsUsed}/2)`}
              </Text>
            </Pressable>
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

      <CoachOverlay termId={item.termId} maxVisible={1} />
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
  },
  // Surrounding words render as normal typeset text (good kerning / wrapping);
  // only the answer is on a fixed cell grid. lineHeight ≈ cell height so the
  // text baseline sits level with the blank boxes.
  gridWordText: {
    color: colors.text,
    fontFamily: fonts.display.regular,
    fontWeight: '400',
    fontSize: 20,
    lineHeight: CELL_H,
  },
  gridWord: {
    flexDirection: 'row',
    marginVertical: 3,
  },
  gridSpace: {
    width: SPACE_W,
    height: CELL_H,
  },
  gridCell: {
    width: CELL_W,
    height: CELL_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridChar: {
    color: colors.text,
    fontFamily: fonts.display.semibold,
    fontWeight: '600',
    fontSize: 20,
  },
  gridCharCorrect: {
    color: palette.sage,
  },
  blankCell: {
    borderBottomWidth: 2,
    borderBottomColor: colors.accent,
    backgroundColor: 'rgba(0,104,255,0.06)',
    marginHorizontal: 1,
    borderRadius: 3,
  },
  blankCellCorrect: {
    backgroundColor: 'rgba(127,176,105,0.16)',
    borderBottomColor: palette.sage,
  },
  blankCellWrong: {
    backgroundColor: 'rgba(177,8,4,0.07)',
    borderBottomColor: '#b10804',
  },
  gridHiddenInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
    color: 'transparent',
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
});
