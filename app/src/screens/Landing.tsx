import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { HealthResponse } from '@pachu/shared';
import { getHealth } from '../api/client';
import { DoveCornerMark } from '../components/DoveCornerMark';
import {
  PrimaryButton,
  SecondaryButton,
} from '../components/PrimaryButton';
import { ScreenShell } from '../components/ScreenShell';
import { useNavigation } from '../navigation/NavigationContext';
import { useSpaces } from '../state/session';
import { palette } from '@pachu/shared';
import { colors, fonts, spacing, typography } from '../theme';

type HealthState =
  | { kind: 'loading' }
  | { kind: 'ok'; health: HealthResponse }
  | { kind: 'error' };

function useLlmReachable(): { llmReachable: boolean; loading: boolean } {
  const [state, setState] = useState<HealthState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const health = await getHealth();
        if (!cancelled) setState({ kind: 'ok', health });
      } catch {
        if (!cancelled) setState({ kind: 'error' });
      }
    };
    void tick();
    const id = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return {
    llmReachable: state.kind === 'ok' && state.health.llm.reachable,
    loading: state.kind === 'loading',
  };
}

export function LandingScreen() {
  const { navigate } = useNavigation();
  const { spaces, loading: spacesLoading } = useSpaces();
  const { llmReachable, loading: healthLoading } = useLlmReachable();
  const insets = useSafeAreaInsets();

  const hasSpaces = spaces.length > 0;
  const registerDisabled = !healthLoading && !llmReachable;

  // Stat strip — small row showing the totals across all spaces. Pure
  // derivation; matches the "stretch" bullet in docs/SCREENS.md Landing.
  const totalTerms = spaces.reduce((acc, s) => acc + s.summary.termCount, 0);
  const dueToday = spaces.reduce((acc, s) => acc + s.summary.dueToday, 0);

  const handleRegister = () => navigate({ name: 'import' });
  const handleExplore = () => navigate({ name: 'spaces' });

  return (
    <ScreenShell>
      {/* Vector-mapped from the logo reference, cropped at the dove's midline. */}
      <View style={styles.dovePane} pointerEvents="none">
        <DoveCornerMark color={colors.accent} />
      </View>

      {/* Top half — hero with wordmark */}
      <View style={styles.hero}>
        {/* Status-bar gradient guard so the wordmark stays readable */}
        <View style={[styles.statusGuard, { height: insets.top + 32 }]} pointerEvents="none" />

        <View style={[styles.wordmarkWrap, { paddingBottom: 36 }]} pointerEvents="none">
          <Text style={styles.eyebrow}>An adaptive notes engine</Text>
          <Text style={styles.wordmark}>
            Pa<Text style={styles.wordmarkAccent}>chu</Text>
          </Text>
        </View>
      </View>

      {/* Bottom half — actions */}
      <View style={[styles.actionsHalf, { paddingBottom: spacing.xl + insets.bottom }]}>
        <View style={styles.copyWrap}>
          <Text style={styles.copy}>
            Drop in your notes — lectures, papers, a PDF you scribbled on.
            We turn them into puzzles that adapt to what you remember.
          </Text>

          {(totalTerms > 0 || hasSpaces) && (
            <Text style={styles.statStrip}>
              {spaces.length} {spaces.length === 1 ? 'space' : 'spaces'}
              {' · '}
              {totalTerms} {totalTerms === 1 ? 'term' : 'terms'}
              {' · '}
              {dueToday} due today
            </Text>
          )}
        </View>

        <View style={styles.buttons}>
          <PrimaryButton
            full
            label="New space"
            onPress={handleRegister}
            disabled={registerDisabled}
            leading={
              <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
                <Path
                  d="M9 3v12M3 9h12"
                  stroke={colors.textOnAccent}
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              </Svg>
            }
          />
          {registerDisabled && (
            <Text style={styles.hint}>Backend offline — start `bun run dev:backend`</Text>
          )}

          <SecondaryButton
            full
            label={
              hasSpaces
                ? `My spaces · ${spaces.length}`
                : spacesLoading
                  ? 'Loading spaces…'
                  : 'My spaces'
            }
            onPress={handleExplore}
            disabled={!hasSpaces}
          />
          {!hasSpaces && !spacesLoading && (
            <Text style={styles.hint}>No spaces yet</Text>
          )}
        </View>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  hero: {
    position: 'relative',
    height: '52%',
    minHeight: 380,
    backgroundColor: 'transparent',
  },
  dovePane: {
    position: 'absolute',
    top: -18,
    right: 8,
    width: '61%',
    height: '61%',
    opacity: 0.9,
  },
  statusGuard: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    // RN doesn't support gradients without a lib; the white surface fading to
    // transparent is close enough as a flat overlay. The dither beneath has
    // a bottom-gradient mask so the top is already lighter.
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  wordmarkWrap: {
    position: 'absolute',
    left: 28,
    right: 28,
    bottom: 0,
    gap: 6,
  },
  eyebrow: {
    color: 'rgba(0,38,92,0.55)',
    fontFamily: fonts.ui.semibold,
    fontWeight: '600',
    fontSize: 12.5,
    letterSpacing: 2.25,
    textTransform: 'uppercase',
  },
  wordmark: {
    color: colors.text,
    fontFamily: fonts.display.bold,
    fontWeight: '700',
    fontSize: typography.hero,
    lineHeight: typography.hero * 0.92,
    letterSpacing: -2,
  },
  wordmarkAccent: {
    color: colors.accent,
  },
  actionsHalf: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  copyWrap: {
    gap: spacing.sm,
    maxWidth: 320,
  },
  copy: {
    color: colors.muted,
    fontFamily: fonts.ui.regular,
    fontSize: typography.body,
    lineHeight: 23,
  },
  statStrip: {
    color: palette.ink40,
    fontFamily: fonts.ui.semibold,
    fontSize: typography.caption,
    letterSpacing: 0.5,
  },
  buttons: {
    gap: 10,
  },
  hint: {
    color: colors.muted,
    fontFamily: fonts.ui.regular,
    fontSize: typography.caption,
    textAlign: 'center',
    marginTop: -spacing.xs,
  },
});
