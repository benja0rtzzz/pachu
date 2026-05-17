import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { useNavigation } from '../navigation/NavigationContext';
import { isClozePuzzle, useSession } from '../state/session';
import { colors, sharedStyles, spacing, typography } from '../theme';

export function ClozeScreen() {
  const { goBack, navigate } = useNavigation();
  const { activePuzzle } = useSession();
  const puzzle = activePuzzle && isClozePuzzle(activePuzzle) ? activePuzzle : null;
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');

  if (!puzzle || puzzle.items.length === 0) {
    return (
      <Screen title="Cloze" onBack={goBack}>
        <Text style={sharedStyles.screenSubtitle}>No puzzle loaded.</Text>
        <PrimaryButton label="Back to picker" onPress={() => navigate({ name: 'picker' })} />
      </Screen>
    );
  }

  const item = puzzle.items[index]!;
  const isLast = index >= puzzle.items.length - 1;

  const reveal = () => {
    setAnswer(item.answer);
  };

  const next = () => {
    if (isLast) {
      navigate({ name: 'picker' });
      return;
    }
    setIndex((i) => i + 1);
    setAnswer('');
  };

  const correct =
    answer.trim().toUpperCase() === item.answer.toUpperCase() && answer.length > 0;

  return (
    <Screen
      title="Cloze"
      subtitle={`Card ${index + 1} of ${puzzle.items.length} · mode: ${item.mode}`}
      onBack={goBack}
      footer={
        <View style={styles.footer}>
          <PrimaryButton label="Reveal answer" onPress={reveal} variant="secondary" />
          <PrimaryButton label={isLast ? 'Finish session' : 'Next card'} onPress={next} />
        </View>
      }
    >
      <View style={sharedStyles.card}>
        <Text style={styles.sentence}>{item.sentence}</Text>
        <TextInput
          value={answer}
          onChangeText={setAnswer}
          placeholder="Type the missing term"
          placeholderTextColor={colors.muted}
          autoCapitalize="characters"
          style={styles.input}
        />
        {correct ? <Text style={styles.ok}>Correct</Text> : null}
      </View>

      <View style={[sharedStyles.card, styles.source]}>
        <Text style={sharedStyles.label}>Source chunk</Text>
        <Text style={styles.sourceText}>{item.sourceChunk}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sentence: {
    color: colors.text,
    fontSize: typography.subheading,
    lineHeight: 26,
    marginBottom: spacing.md,
  },
  input: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: typography.body,
    padding: spacing.md,
  },
  ok: {
    color: colors.success,
    marginTop: spacing.sm,
    fontWeight: '600',
  },
  source: {
    opacity: 0.9,
  },
  sourceText: {
    color: colors.muted,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  footer: {
    gap: spacing.sm,
  },
});
