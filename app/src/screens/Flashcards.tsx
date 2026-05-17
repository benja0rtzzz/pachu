import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Rating } from '@pachu/shared';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { useNavigation } from '../navigation/NavigationContext';
import { isFlashcardsPuzzle, useSession } from '../state/session';
import { colors, sharedStyles, spacing, typography } from '../theme';

const RATINGS: { rating: Rating; label: string }[] = [
  { rating: 1, label: 'Again' },
  { rating: 2, label: 'Hard' },
  { rating: 3, label: 'Good' },
  { rating: 4, label: 'Easy' },
];

export function FlashcardsScreen() {
  const { goBack, navigate } = useNavigation();
  const { activePuzzle } = useSession();
  const puzzle = activePuzzle && isFlashcardsPuzzle(activePuzzle) ? activePuzzle : null;
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  if (!puzzle || puzzle.items.length === 0) {
    return (
      <Screen title="Flashcards" onBack={goBack}>
        <Text style={sharedStyles.screenSubtitle}>No puzzle loaded.</Text>
        <PrimaryButton label="Back to picker" onPress={() => navigate({ name: 'picker' })} />
      </Screen>
    );
  }

  const card = puzzle.items[index]!;
  const isLast = index >= puzzle.items.length - 1;

  const rate = (_rating: Rating) => {
    setFlipped(false);
    if (isLast) {
      navigate({ name: 'picker' });
      return;
    }
    setIndex((i) => i + 1);
  };

  return (
    <Screen
      title="Flashcards"
      subtitle={`Card ${index + 1} of ${puzzle.items.length}`}
      onBack={goBack}
    >
      <Pressable onPress={() => setFlipped((f) => !f)} style={[sharedStyles.card, styles.card]}>
        <Text style={sharedStyles.label}>{flipped ? 'Back' : 'Front'}</Text>
        <Text style={styles.cardText}>{flipped ? card.back : card.front}</Text>
        <Text style={styles.tapHint}>Tap to flip</Text>
      </Pressable>

      {flipped ? (
        <View style={styles.ratingRow}>
          {RATINGS.map((r) => (
            <PrimaryButton
              key={r.rating}
              label={r.label}
              onPress={() => rate(r.rating)}
              variant="secondary"
            />
          ))}
        </View>
      ) : (
        <PrimaryButton label="Show answer" onPress={() => setFlipped(true)} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 200,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  cardText: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 28,
  },
  tapHint: {
    color: colors.muted,
    fontSize: typography.caption,
  },
  ratingRow: {
    gap: spacing.sm,
  },
});
