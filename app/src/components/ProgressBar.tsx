import { StyleSheet, Text, View } from 'react-native';
import { palette } from '@pachu/shared';
import { colors, fonts, radii, typography } from '../theme';

// Ported from `app/screens/puzzles.jsx::ProgressBar` — thin 4px track + tabular
// "value/max" label on the right. Used inside `PuzzleShell` to show puzzle
// progress and inside the SpacesScreen rows for per-space completion.

type Props = {
  value: number;
  max: number;
  /** Override the bar/text color. Defaults to `colors.accent`. */
  color?: string;
  /** Hide the trailing `N/M` label. Defaults to false. */
  hideLabel?: boolean;
};

export function ProgressBar({ value, max, color, hideLabel }: Props) {
  const safeMax = Math.max(1, max);
  const pct = Math.min(1, Math.max(0, value / safeMax));
  const fill = color ?? colors.accent;

  return (
    <View style={styles.row}>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${pct * 100}%`, backgroundColor: fill },
          ]}
        />
      </View>
      {!hideLabel && (
        <Text style={[styles.label, { color: colors.muted }]}>
          {value}/{max}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  track: {
    position: 'relative',
    height: 4,
    flex: 1,
    backgroundColor: palette.ink06,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: radii.pill,
  },
  label: {
    fontFamily: fonts.ui.semibold,
    fontVariant: ['tabular-nums'],
    fontSize: typography.caption,
    fontWeight: '600',
    minWidth: 36,
    textAlign: 'right',
  },
});
