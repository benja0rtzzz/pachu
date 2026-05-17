import { useEffect, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SecondaryButton } from './PrimaryButton';
import { colors, fonts, radii, spacing, typography } from '../theme';

// One adaptive "session complete" screen shared by Crossword / Cloze /
// Flashcards. Callers pass their own kind-specific headline + detail; the
// chrome, the gentle entrance, and the "come back tomorrow" cue are uniform
// so finishing a puzzle never feels abrupt and reads the same everywhere.

type Props = {
  eyebrow?: string;
  headline: string;
  detail?: string;
  /** Extra line under the stats — e.g. "Saved to <space>" / next-due. */
  footnote?: ReactNode;
  error?: string | null;
  onBack: () => void;
  backLabel?: string;
  /** Show the "come back tomorrow" cue. Default true. */
  comeBackHint?: boolean;
};

export function PuzzleComplete({
  eyebrow = 'Session complete',
  headline,
  detail,
  footnote,
  error,
  onBack,
  backLabel = 'Back to space',
  comeBackHint = true,
}: Props) {
  const insets = useSafeAreaInsets();
  const enter = useSharedValue(0);

  useEffect(() => {
    enter.value = withTiming(1, {
      duration: 460,
      easing: Easing.out(Easing.cubic),
    });
  }, [enter]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [
      { translateY: 16 * (1 - enter.value) },
      { scale: 0.97 + 0.03 * enter.value },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.wrap,
        { paddingBottom: spacing.xl + insets.bottom },
        animStyle,
      ]}
    >
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.headline}>{headline}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      {footnote ? <Text style={styles.footnote}>{footnote}</Text> : null}
      {comeBackHint && (
        <Text style={styles.comeBack}>
          Nice work — come back tomorrow to keep the streak.
        </Text>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <SecondaryButton label={backLabel} onPress={onBack} full />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    color: colors.accent,
    fontFamily: fonts.ui.bold,
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  headline: {
    color: colors.text,
    fontFamily: fonts.display.semibold,
    fontWeight: '600',
    fontSize: typography.title,
    textAlign: 'center',
  },
  detail: {
    color: colors.muted,
    fontFamily: fonts.ui.regular,
    fontSize: typography.body,
    textAlign: 'center',
  },
  footnote: {
    color: colors.text,
    fontFamily: fonts.ui.regular,
    fontSize: typography.bodySm,
    textAlign: 'center',
  },
  comeBack: {
    color: colors.subtle,
    fontFamily: fonts.ui.medium,
    fontSize: typography.caption,
    textAlign: 'center',
  },
  error: {
    color: colors.text,
    backgroundColor: 'rgba(177,8,4,0.08)',
    padding: spacing.sm,
    borderRadius: radii.sm,
    fontFamily: fonts.ui.medium,
    fontSize: typography.caption,
    textAlign: 'center',
  },
  actions: {
    alignSelf: 'stretch',
    marginTop: spacing.sm,
  },
});
