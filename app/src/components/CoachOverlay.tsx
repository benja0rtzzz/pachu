import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { Hint } from '@pachu/shared';
import { palette } from '@pachu/shared';
import { useCoach } from '../api/ws';
import { colors, fonts, radii, shadows, spacing, typography } from '../theme';

// Bottom-slide hint surface. Subscribes to `useCoach()`, filters down to
// `hint` events for the current term, and renders them as a stack of cards
// (1 for Cloze, up to 3 for Crossword per the SCREENS.md stretch item).
//
// Each tier is styled distinctly so the escalation (pattern → contextual
// nudge) reads at a glance without parsing the body text.

type Props = {
  termId: string | null;
  /** Max hints to keep visible. Defaults to 1 (single-card mode). */
  maxVisible?: number;
};

const TIER_LABEL: Record<1 | 2 | 3, string> = {
  1: 'Pattern',
  2: 'Hint',
  // tier 3 is retired; kept defensively in case a stale event arrives.
  3: 'Hint',
};

const TIER_TINT: Record<1 | 2 | 3, { bg: string; border: string; fg: string }> = {
  1: {
    bg: 'rgba(127,176,105,0.14)',
    border: 'rgba(127,176,105,0.32)',
    fg: palette.sage,
  },
  2: { bg: 'rgba(0,104,255,0.08)', border: 'rgba(0,104,255,0.2)', fg: colors.accent },
  3: { bg: 'rgba(0,104,255,0.08)', border: 'rgba(0,104,255,0.2)', fg: colors.accent },
};

export function CoachOverlay({ termId, maxVisible = 1 }: Props) {
  const { events, status } = useCoach();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // Reset the dismiss set when the focused term changes — a hint dismissed
  // on one clue shouldn't suppress hints requested on the next one.
  useEffect(() => {
    setDismissedIds(new Set());
  }, [termId]);

  const visible: Hint[] = useMemo(() => {
    if (!termId) return [];
    const hints: Hint[] = [];
    for (let i = events.length - 1; i >= 0 && hints.length < maxVisible * 2; i--) {
      const ev = events[i]!;
      if (ev.type !== 'hint') continue;
      if (ev.hint.termId !== termId) continue;
      const key = `${ev.hint.termId}:${ev.hint.tier}:${ev.hint.text}`;
      if (dismissedIds.has(key)) continue;
      hints.push(ev.hint);
    }
    return hints.slice(0, maxVisible).reverse();
  }, [events, termId, maxVisible, dismissedIds]);

  const offset = useSharedValue(120);
  useEffect(() => {
    offset.value = withTiming(visible.length > 0 ? 0 : 120, {
      duration: 240,
      easing: Easing.out(Easing.cubic),
    });
  }, [offset, visible.length]);

  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
    opacity: offset.value === 0 ? 1 : 1 - offset.value / 120,
  }));

  if (visible.length === 0 && status !== 'connecting') return null;

  return (
    <Animated.View style={[styles.root, slideStyle]} pointerEvents="box-none">
      {visible.map((hint) => {
        const tint = TIER_TINT[hint.tier];
        const key = `${hint.termId}:${hint.tier}:${hint.text}`;
        return (
          <View
            key={key}
            style={[
              styles.card,
              { borderLeftColor: tint.fg },
            ]}
          >
            <View style={styles.cardHeader}>
              <Text style={[styles.cardTier, { color: tint.fg }]}>
                Tier {hint.tier} · {TIER_LABEL[hint.tier]}
              </Text>
              <Pressable
                onPress={() =>
                  setDismissedIds((prev) => {
                    const next = new Set(prev);
                    next.add(key);
                    return next;
                  })
                }
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Dismiss hint"
              >
                <Text style={[styles.cardClose, { color: tint.fg }]}>×</Text>
              </Pressable>
            </View>
            <Text style={styles.cardBody}>{hint.text}</Text>
          </View>
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    // Sit well clear of the footer/keyboard so the hint reads on its own
    // rather than crowding the action buttons.
    bottom: spacing.md + 150,
    gap: spacing.sm,
    zIndex: 20,
  },
  card: {
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 6,
    ...shadows.hero,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTier: {
    fontFamily: fonts.ui.bold,
    fontWeight: '700',
    fontSize: 10.5,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  cardClose: {
    fontFamily: fonts.ui.bold,
    fontWeight: '700',
    fontSize: 18,
    lineHeight: 18,
  },
  cardBody: {
    color: colors.text,
    fontFamily: fonts.ui.regular,
    fontSize: typography.bodySm,
    lineHeight: 21,
  },
});
