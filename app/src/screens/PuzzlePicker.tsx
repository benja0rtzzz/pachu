import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PuzzleKind, Space } from '@pachu/shared';
import { palette } from '@pachu/shared';
import { generatePuzzle } from '../api/puzzles';
import { ApiError } from '../api/client';
import { DitherField } from '../components/DitherField';
import { ModeIcon, type ModeIconKind } from '../components/ModeIcon';
import { ScreenShell } from '../components/ScreenShell';
import { TopBar } from '../components/TopBar';
import {
  GhostLink,
  SecondaryButton,
} from '../components/PrimaryButton';
import { useNavigation } from '../navigation/NavigationContext';
import { useSession, useSpaces } from '../state/session';
import { colors, fonts, radii, shadows, spacing, typography } from '../theme';

const MODES: {
  kind: PuzzleKind;
  icon: ModeIconKind;
  label: string;
  hint: string;
}[] = [
  {
    kind: 'crossword',
    icon: 'cross',
    label: 'Crossword',
    hint: 'Definitions across, terms down',
  },
  {
    kind: 'cloze',
    icon: 'cloze',
    label: 'Cloze',
    hint: 'Fill the blanks in your own sentences',
  },
  {
    kind: 'flashcards',
    icon: 'cards',
    label: 'Flashcards',
    hint: 'Recall, then check — spaced over days',
  },
];

type Props = { spaceId?: string };

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ok'; space: Space }
  | { kind: 'missing' }
  | { kind: 'error'; message: string };

export function PuzzlePickerScreen({ spaceId }: Props) {
  const insets = useSafeAreaInsets();
  const { navigate, goBack } = useNavigation();
  const { spaces, refreshSpace, extractTerms } = useSpaces();
  const { setActivePuzzle } = useSession();

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [loadingKind, setLoadingKind] = useState<PuzzleKind | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!spaceId) {
      setState({ kind: 'missing' });
      return;
    }
    const cached = spaces.find((s) => s.id === spaceId);
    if (cached) setState({ kind: 'ok', space: cached });
    const fresh = await refreshSpace(spaceId);
    if (fresh) setState({ kind: 'ok', space: fresh });
    else if (!cached) setState({ kind: 'missing' });
  }, [spaceId, spaces, refreshSpace]);

  useEffect(() => {
    void load();
    // We intentionally re-run only when spaceId changes — `spaces` updates
    // from refreshSpace would otherwise loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId]);

  if (state.kind === 'loading') {
    return (
      <ScreenShell dither={{ intensity: 'low', gradient: 'radial' }}>
        <TopBar title="Space" onBack={goBack} />
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </ScreenShell>
    );
  }

  if (state.kind === 'missing' || state.kind === 'error') {
    const message =
      state.kind === 'error' ? state.message : "We couldn't find that space.";
    return (
      <ScreenShell dither={{ intensity: 'low', gradient: 'radial' }}>
        <TopBar title="Space not found" onBack={goBack} />
        <View style={styles.centerFill}>
          <Text style={styles.errorTitle}>Space not found</Text>
          <Text style={styles.errorBody}>{message}</Text>
          <SecondaryButton
            label="Back to spaces"
            onPress={() => navigate({ name: 'spaces' })}
          />
        </View>
      </ScreenShell>
    );
  }

  const { space } = state;
  const termCount = space.summary.termCount;
  const dueCount = space.summary.dueCount;
  const dueToday = space.summary.dueToday;

  const triggerExtract = async () => {
    setExtracting(true);
    setExtractError(null);
    try {
      const updated = await extractTerms(space.id);
      setState({ kind: 'ok', space: updated });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          // Already extracted — just refresh.
          const fresh = await refreshSpace(space.id);
          if (fresh) setState({ kind: 'ok', space: fresh });
        } else if (err.status === 422) {
          setExtractError(
            "Extractor couldn't find terms here — try richer or longer notes.",
          );
        } else {
          setExtractError(err.message);
        }
      } else {
        setExtractError((err as Error).message);
      }
    } finally {
      setExtracting(false);
    }
  };

  const startPuzzle = async (kind: PuzzleKind) => {
    setLoadingKind(kind);
    setGenerateError(null);
    try {
      const puzzle = await generatePuzzle({ kind, spaceId: space.id });
      setActivePuzzle(puzzle);
      navigate({ name: kind, puzzleId: puzzle.id });
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setGenerateError(
          'No terms available in this space yet — extract terms above.',
        );
      } else {
        setGenerateError((err as Error).message);
      }
    } finally {
      setLoadingKind(null);
    }
  };

  return (
    <ScreenShell dither={{ intensity: 'low', gradient: 'radial' }}>
      <TopBar title={space.title} onBack={goBack} />

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: spacing.xl + insets.bottom },
        ]}
      >
        <View style={styles.headerWrap}>
          <Text style={styles.h2}>Pick how you want to remember today.</Text>
          <Text style={styles.h2Sub}>
            {termCount === 0
              ? 'No terms yet — extract to get started.'
              : `${dueToday > 0 ? dueToday : dueCount} ${
                  (dueToday > 0 ? dueToday : dueCount) === 1 ? 'item' : 'items'
                } due · same content, three angles.`}
          </Text>
        </View>

        <View style={styles.aboutCard}>
          <Text style={styles.aboutLabel}>About this space</Text>
          <Text style={styles.aboutTitle}>{space.title}</Text>
          <Text style={styles.aboutMeta}>
            {termCount} {termCount === 1 ? 'term' : 'terms'}
            <Text style={styles.metaSep}>{'  ·  '}</Text>
            {dueCount} due
            <Text style={styles.metaSep}>{'  ·  '}</Text>
            {dueToday} today
          </Text>
        </View>

        {termCount === 0 && (
          <View style={styles.emptyTerms}>
            <Text style={styles.emptyTermsTitle}>
              No terms extracted yet
            </Text>
            <Text style={styles.emptyTermsBody}>
              Run the extractor to scan your notes and seed FSRS with terms.
              This usually takes 10–30 seconds.
            </Text>
            {extractError && (
              <Text style={styles.errorBanner}>{extractError}</Text>
            )}
            <Pressable
              onPress={triggerExtract}
              disabled={extracting}
              style={[styles.extractBtn, extracting && styles.extractBtnBusy]}
            >
              {extracting ? (
                <ActivityIndicator color={colors.textOnAccent} />
              ) : (
                <Text style={styles.extractBtnLabel}>Extract terms</Text>
              )}
            </Pressable>
          </View>
        )}

        {generateError && termCount > 0 && (
          <Text style={styles.errorBanner}>{generateError}</Text>
        )}

        <View style={styles.tilesWrap}>
          {MODES.map((m) => {
            const done = space.summary.playedTodayKinds.includes(m.kind);
            const disabled = termCount === 0 || loadingKind !== null;
            const isLoading = loadingKind === m.kind;
            return (
              <Pressable
                key={m.kind}
                onPress={() => startPuzzle(m.kind)}
                disabled={disabled}
                accessibilityState={{ disabled }}
                style={[styles.tile, disabled && styles.tileDisabled]}
              >
                <View style={styles.tilePreview}>
                  <View style={StyleSheet.absoluteFill}>
                    <DitherField
                      intensity="hero"
                      gridSize={8}
                      gradient="radial"
                      color={colors.accent}
                    />
                  </View>
                  <View style={styles.tileIconBubble}>
                    <ModeIcon kind={m.icon} color={colors.accent} />
                  </View>
                </View>
                <View style={styles.tileBody}>
                  <View style={styles.tileTitleRow}>
                    <Text style={styles.tileTitle}>{m.label}</Text>
                    <Text style={styles.tileStatus}>
                      {isLoading
                        ? 'Loading…'
                        : done
                          ? 'done today'
                          : termCount === 0
                            ? '—'
                            : 'Open →'}
                    </Text>
                  </View>
                  <Text style={styles.tileHint}>{m.hint}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.footer}>
          <GhostLink
            label="← Back to spaces"
            onPress={() => navigate({ name: 'spaces' })}
          />
          {space.summary.streakDays > 0 && (
            <Text style={styles.streakCaption}>
              Streak: {space.summary.streakDays} {space.summary.streakDays === 1 ? 'day' : 'days'}
            </Text>
          )}
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    gap: spacing.md,
  },
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
  headerWrap: {
    paddingHorizontal: spacing.xs,
    gap: 6,
  },
  h2: {
    color: colors.text,
    fontFamily: fonts.display.semibold,
    fontWeight: '600',
    fontSize: 28,
    lineHeight: 30,
    letterSpacing: -0.7,
  },
  h2Sub: {
    color: colors.muted,
    fontFamily: fonts.ui.regular,
    fontSize: typography.bodySm,
  },
  aboutCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 4,
  },
  aboutLabel: {
    color: colors.subtle,
    fontFamily: fonts.ui.bold,
    fontWeight: '700',
    fontSize: 10.5,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  aboutTitle: {
    color: colors.text,
    fontFamily: fonts.display.semibold,
    fontWeight: '600',
    fontSize: typography.subheading,
  },
  aboutMeta: {
    color: colors.muted,
    fontFamily: fonts.ui.medium,
    fontSize: typography.caption,
  },
  metaSep: {
    color: palette.ink25,
  },
  emptyTerms: {
    backgroundColor: 'rgba(0,104,255,0.04)',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(0,104,255,0.18)',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  emptyTermsTitle: {
    color: colors.text,
    fontFamily: fonts.display.semibold,
    fontWeight: '600',
    fontSize: typography.subheading,
  },
  emptyTermsBody: {
    color: colors.muted,
    fontFamily: fonts.ui.regular,
    fontSize: typography.bodySm,
    lineHeight: 20,
  },
  errorBanner: {
    color: colors.text,
    backgroundColor: 'rgba(177,8,4,0.08)',
    padding: spacing.sm,
    borderRadius: radii.sm,
    fontFamily: fonts.ui.medium,
    fontSize: typography.caption,
  },
  extractBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 22,
    ...shadows.button,
  },
  extractBtnBusy: {
    opacity: 0.7,
  },
  extractBtnLabel: {
    color: colors.textOnAccent,
    fontFamily: fonts.ui.semibold,
    fontWeight: '600',
    fontSize: typography.body,
  },
  tilesWrap: {
    gap: 12,
  },
  tile: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    flexDirection: 'row',
    minHeight: 96,
  },
  tileDisabled: {
    opacity: 0.55,
  },
  tilePreview: {
    position: 'relative',
    width: 110,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileIconBubble: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  tileBody: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    justifyContent: 'center',
    gap: 4,
  },
  tileTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  tileTitle: {
    color: colors.text,
    fontFamily: fonts.display.semibold,
    fontWeight: '600',
    fontSize: 19,
    letterSpacing: -0.4,
  },
  tileStatus: {
    color: colors.accent,
    fontFamily: fonts.ui.semibold,
    fontWeight: '600',
    fontSize: typography.caption,
  },
  tileHint: {
    color: colors.muted,
    fontFamily: fonts.ui.regular,
    fontSize: 13.5,
    lineHeight: 19,
  },
  footer: {
    paddingTop: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  streakCaption: {
    color: colors.subtle,
    fontFamily: fonts.ui.medium,
    fontSize: typography.caption,
  },
});
