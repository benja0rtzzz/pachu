import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { ClueList } from '../components/ClueList';
import { Grid } from '../components/Grid';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { useNavigation } from '../navigation/NavigationContext';
import { isCrosswordPuzzle, useSession } from '../state/session';
import { colors, sharedStyles, spacing, typography } from '../theme';

export function CrosswordScreen() {
  const { goBack, navigate } = useNavigation();
  const { activePuzzle } = useSession();
  const puzzle = activePuzzle && isCrosswordPuzzle(activePuzzle) ? activePuzzle : null;

  const [selectedTermId, setSelectedTermId] = useState<string | null>(
    puzzle?.entries[0]?.termId ?? null,
  );
  const [entries, setEntries] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  const across = useMemo(
    () => puzzle?.entries.filter((e) => e.orientation === 'across') ?? [],
    [puzzle],
  );
  const down = useMemo(
    () => puzzle?.entries.filter((e) => e.orientation === 'down') ?? [],
    [puzzle],
  );

  if (!puzzle) {
    return (
      <Screen title="Crossword" onBack={goBack}>
        <Text style={sharedStyles.screenSubtitle}>No puzzle loaded.</Text>
        <PrimaryButton label="Back to picker" onPress={() => navigate({ name: 'picker' })} />
      </Screen>
    );
  }

  const selected = puzzle.entries.find((e) => e.termId === selectedTermId) ?? puzzle.entries[0];

  const updateAnswer = (text: string) => {
    if (!selected) return;
    setEntries((prev) => ({ ...prev, [selected.termId]: text.toUpperCase().slice(0, selected.term.length) }));
    setFeedback(null);
  };

  const checkAnswers = () => {
    const wrong = puzzle.entries.filter(
      (e) => (entries[e.termId] ?? '').toUpperCase() !== e.term.toUpperCase(),
    );
    if (wrong.length === 0) {
      setFeedback('All words correct (mock session).');
    } else {
      setFeedback(`${wrong.length} word(s) still need work.`);
    }
  };

  return (
    <Screen
      title="Crossword"
      subtitle="Tap a clue or cell — mock layout for UI demo."
      onBack={goBack}
      footer={
        <View style={styles.footer}>
          {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}
          <PrimaryButton label="Check answers" onPress={checkAnswers} variant="secondary" />
          <PrimaryButton label="Done — back to puzzles" onPress={() => navigate({ name: 'picker' })} />
        </View>
      }
    >
      <Grid
        puzzle={puzzle}
        selectedTermId={selected?.termId ?? null}
        entries={entries}
        onSelectTerm={setSelectedTermId}
      />

      {selected ? (
        <View style={sharedStyles.card}>
          <Text style={sharedStyles.label}>Answer for selected clue</Text>
          <Text style={styles.selectedClue}>{selected.clue}</Text>
          <TextInput
            value={entries[selected.termId] ?? ''}
            onChangeText={updateAnswer}
            placeholder={`${selected.term.length} letters`}
            placeholderTextColor={colors.muted}
            autoCapitalize="characters"
            style={styles.answerInput}
          />
        </View>
      ) : null}

      <ClueList
        title="Across"
        entries={across}
        selectedTermId={selectedTermId}
        onSelect={setSelectedTermId}
      />
      <ClueList
        title="Down"
        entries={down}
        selectedTermId={selectedTermId}
        onSelect={setSelectedTermId}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: {
    gap: spacing.sm,
  },
  feedback: {
    color: colors.success,
    fontSize: typography.body,
    textAlign: 'center',
  },
  selectedClue: {
    color: colors.text,
    fontSize: typography.body,
    marginBottom: spacing.sm,
    lineHeight: 20,
  },
  answerInput: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 4,
    padding: spacing.md,
    textAlign: 'center',
  },
});
