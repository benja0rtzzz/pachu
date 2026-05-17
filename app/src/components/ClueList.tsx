import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CrosswordEntry } from '@pachu/shared';
import { colors, radius, spacing, typography } from '../theme';

type Props = {
  title: string;
  entries: CrosswordEntry[];
  selectedTermId: string | null;
  onSelect: (termId: string) => void;
};

export function ClueList({ title, entries, selectedTermId, onSelect }: Props) {
  if (entries.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.title}>{title}</Text>
      {entries.map((entry, index) => {
        const selected = entry.termId === selectedTermId;
        return (
          <Pressable
            key={entry.termId}
            onPress={() => onSelect(entry.termId)}
            style={[styles.clue, selected && styles.clueSelected]}
          >
            <Text style={styles.number}>{index + 1}.</Text>
            <Text style={styles.clueText}>{entry.clue}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
  title: {
    color: colors.muted,
    fontSize: typography.caption,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  clue: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clueSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceElevated,
  },
  number: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: typography.body,
    minWidth: 20,
  },
  clueText: {
    flex: 1,
    color: colors.text,
    fontSize: typography.body,
    lineHeight: 20,
  },
});
