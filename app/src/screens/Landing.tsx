import { StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { useNavigation } from '../navigation/NavigationContext';
import { useSession } from '../state/session';
import { colors, sharedStyles, spacing, typography } from '../theme';

const STEPS = [
  { n: '1', label: 'Import your notes', detail: 'Paste, upload, or try a demo set' },
  { n: '2', label: 'Pick a puzzle', detail: 'Crossword, cloze, or flashcards' },
  { n: '3', label: 'Practice & review', detail: 'FSRS adapts what comes back next' },
];

export function LandingScreen() {
  const { navigate } = useNavigation();
  const { notes } = useSession();
  const hasNotes = notes.length > 0;

  const handlePlay = () => {
    navigate({ name: hasNotes ? 'picker' : 'import' });
  };

  return (
    <Screen
      scroll
      footer={
        <View style={styles.footerActions}>
          <PrimaryButton label="Play" onPress={handlePlay} />
          <PrimaryButton
            label="Check my notes"
            onPress={() => navigate({ name: 'import' })}
            variant="secondary"
          />
          {!hasNotes && (
            <Text style={styles.fallbackHint}>
              No notes yet — tap Play to add some first.
            </Text>
          )}
        </View>
      }
    >
      <View style={styles.hero}>
        <Text style={styles.brand}>Pachu</Text>
        <Text style={styles.tagline}>
          Note-driven puzzles that match how you actually study.
        </Text>
      </View>

      <View style={sharedStyles.card}>
        <Text style={sharedStyles.label}>How it works</Text>
        {STEPS.map((step) => (
          <View key={step.n} style={styles.step}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepN}>{step.n}</Text>
            </View>
            <View style={styles.stepBody}>
              <Text style={styles.stepLabel}>{step.label}</Text>
              <Text style={styles.stepDetail}>{step.detail}</Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.disclaimer}>
        Prototype flow — puzzles use mock data until the backend is wired.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  brand: {
    color: colors.text,
    fontSize: typography.title,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  tagline: {
    color: colors.muted,
    fontSize: typography.subheading,
    lineHeight: 24,
  },
  step: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepN: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: typography.body,
  },
  stepBody: {
    flex: 1,
    gap: 2,
  },
  stepLabel: {
    color: colors.text,
    fontSize: typography.subheading,
    fontWeight: '600',
  },
  stepDetail: {
    color: colors.muted,
    fontSize: typography.body,
    lineHeight: 20,
  },
  disclaimer: {
    color: colors.muted,
    fontSize: typography.caption,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  footerActions: {
    gap: spacing.sm,
  },
  fallbackHint: {
    color: colors.muted,
    fontSize: typography.caption,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
