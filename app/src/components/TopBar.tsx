import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, spacing, typography } from '../theme';

type Props = {
  title?: string;
  onBack?: () => void;
  right?: ReactNode;
};

// Header chrome ported from `app/screens/screens.jsx` (TopBar). Back chevron
// on the left, centered display-font title, free right-slot. Top padding
// derives from the device's safe-area inset so the bar sits below the
// status bar / notch on iOS and the system bar on Android.
export function TopBar({ title, onBack, right }: Props) {
  const insets = useSafeAreaInsets();
  const paddingTop = Math.max(insets.top, spacing.lg);

  return (
    <View style={[styles.root, { paddingTop, minHeight: paddingTop + 50 }]}>
      <View style={styles.side}>
        {onBack && (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
            style={styles.backBtn}
          >
            <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
              <Path
                d="M14 5L8 11l6 6"
                stroke={colors.text}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Pressable>
        )}
      </View>

      {title ? (
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      ) : (
        <View />
      )}

      <View style={[styles.side, styles.sideRight]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'relative',
    zIndex: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: 14,
  },
  side: {
    width: 40,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sideRight: {
    justifyContent: 'flex-end',
  },
  backBtn: {
    width: 40,
    height: 40,
    marginLeft: -10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    color: colors.text,
    fontFamily: fonts.display.semibold,
    fontWeight: '600',
    fontSize: typography.subheading,
    letterSpacing: -0.17,
  },
});
