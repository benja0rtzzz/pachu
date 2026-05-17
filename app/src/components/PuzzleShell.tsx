import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { ScreenShell } from './ScreenShell';
import { TopBar } from './TopBar';
import { colors } from '../theme';

// Ported from `app/screens/puzzles.jsx::PuzzleShell` — `ScreenShell` with
// a medium-intensity radial dither field + a `TopBar` that puts a three-dot
// overflow menu button in the right slot. Crossword / Cloze / Flashcards
// all build on top of this.

type Props = {
  title: string;
  onBack?: () => void;
  onMenu?: () => void;
  ditherIntensity?: 'hero' | 'medium' | 'low';
  children: ReactNode;
};

export function PuzzleShell({
  title,
  onBack,
  onMenu,
  ditherIntensity = 'medium',
  children,
}: Props) {
  return (
    <ScreenShell dither={{ intensity: ditherIntensity, gradient: 'radial' }}>
      <TopBar
        title={title}
        onBack={onBack}
        right={
          onMenu ? (
            <Pressable
              onPress={onMenu}
              accessibilityRole="button"
              accessibilityLabel="More"
              hitSlop={8}
              style={styles.menuBtn}
            >
              <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
                <Circle cx={11} cy={6} r={1.6} fill={colors.text} />
                <Circle cx={11} cy={11} r={1.6} fill={colors.text} />
                <Circle cx={11} cy={16} r={1.6} fill={colors.text} />
              </Svg>
            </Pressable>
          ) : null
        }
      />
      <View style={styles.body}>{children}</View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  menuBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    position: 'relative',
    zIndex: 3,
  },
});
