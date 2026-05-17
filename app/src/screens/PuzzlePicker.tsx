import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { PuzzleKind } from '@pachu/shared';
import { generatePuzzle } from '../api/puzzles';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { useNavigation } from '../navigation/NavigationContext';
import { useSession } from '../state/session';
import { colors, sharedStyles, spacing, typography } from '../theme';

const PUZZLE_OPTIONS: {
  kind: PuzzleKind;
  title: string;
  description: string;
}[] = [
  {
    kind: 'crossword',
    title: 'Crossword',
    description: 'Clues styled like your notes',
  },
  {
    kind: 'cloze',
    title: 'Cloze',
    description: 'Fill in the blank from context',
  },
  {
    kind: 'flashcards',
    title: 'Flashcards',
    description: 'Direct FSRS review',
  },
];

export function PuzzlePickerScreen() {
  const { navigate, goBack } = useNavigation();
  const { activeNotes, setActivePuzzle } = useSession();
  const [loadingKind, setLoadingKind] = useState<PuzzleKind | null>(null);

  if (!activeNotes) {
    return (
      <Screen title="No notes selected" onBack={() => navigate({ name: 'import' })}>
        <Text style={sharedStyles.screenSubtitle}>
          Import notes first to generate puzzles.
        </Text>
        <PrimaryButton label="Import notes" onPress={() => navigate({ name: 'import' })} />
      </Screen>
    );
  }

  const startPuzzle = async (kind: PuzzleKind) => {
    setLoadingKind(kind);
    try {
      const puzzle = await generatePuzzle({ kind, notesId: activeNotes.id });
      setActivePuzzle(puzzle);
      if (kind === 'crossword') navigate({ name: 'crossword', puzzleId: puzzle.id });
      else if (kind === 'cloze') navigate({ name: 'cloze', puzzleId: puzzle.id });
      else navigate({ name: 'flashcards', puzzleId: puzzle.id });
    } finally {
      setLoadingKind(null);
    }
  };

  const charCount = activeNotes.content.length;

  return (
    <Screen
      title="Choose a puzzle"
      subtitle="Register comes from your notes — no difficulty knob."
      onBack={goBack}
      footer={
        <PrimaryButton
          label="Change notes"
          onPress={() => navigate({ name: 'import' })}
          variant="secondary"
        />
      }
    >
      <View style={sharedStyles.card}>
        <Text style={sharedStyles.label}>Active notes</Text>
        <Text style={styles.notesTitle}>{activeNotes.title}</Text>
        <Text style={styles.notesMeta}>{charCount.toLocaleString()} characters</Text>
        <Text style={styles.notesPreview} numberOfLines={3}>
          {activeNotes.content}
        </Text>
      </View>

      <View style={styles.list}>
        {PUZZLE_OPTIONS.map((opt) => {
          const loading = loadingKind === opt.kind;
          return (
            <Pressable
              key={opt.kind}
              onPress={() => startPuzzle(opt.kind)}
              disabled={loadingKind !== null}
              style={({ pressed }) => [
                styles.option,
                pressed && styles.optionPressed,
                loading && styles.optionLoading,
              ]}
            >
              <View style={styles.optionText}>
                <Text style={styles.optionTitle}>{opt.title}</Text>
                <Text style={styles.optionDesc}>{opt.description}</Text>
              </View>
              {loading ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <Text style={styles.chevron}>→</Text>
              )}
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.mockHint}>Mock puzzles — backend generate API coming soon.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  notesTitle: {
    color: colors.text,
    fontSize: typography.subheading,
    fontWeight: '700',
  },
  notesMeta: {
    color: colors.muted,
    fontSize: typography.caption,
    marginBottom: spacing.sm,
  },
  notesPreview: {
    color: colors.muted,
    fontSize: typography.body,
    lineHeight: 20,
  },
  list: {
    gap: spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  optionPressed: {
    opacity: 0.9,
    borderColor: colors.accent,
  },
  optionLoading: {
    opacity: 0.7,
  },
  optionText: {
    flex: 1,
    gap: 4,
  },
  optionTitle: {
    color: colors.text,
    fontSize: typography.subheading,
    fontWeight: '700',
  },
  optionDesc: {
    color: colors.muted,
    fontSize: typography.body,
  },
  chevron: {
    color: colors.accent,
    fontSize: 20,
    fontWeight: '600',
  },
  mockHint: {
    color: colors.muted,
    fontSize: typography.caption,
    textAlign: 'center',
  },
});
