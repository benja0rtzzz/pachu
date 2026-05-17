import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { DitherField } from './DitherField';
import { colors } from '../theme';

type DitherProps = {
  intensity?: 'hero' | 'medium' | 'low';
  gradient?: 'none' | 'top' | 'bottom' | 'radial';
  speed?: number;
  gridSize?: number;
  color?: string;
};

type Props = {
  children: ReactNode;
  style?: ViewStyle;
  /**
   * Render an ambient `DitherField` behind the children. Pass `false` (the
   * default) for screens that don't want a background pattern. Pass an
   * object to forward props through (intensity / gradient / speed / etc.).
   */
  dither?: false | DitherProps;
};

// Ported from `app/screens/screens.jsx::ScreenShell` — a white, full-bleed
// flex-column container. Phase 2 screens build their layouts inside this
// shell; the legacy `Screen.tsx` wrapper sticks around until each consumer
// migrates over.
export function ScreenShell({ children, style, dither = false }: Props) {
  return (
    <View style={[styles.root, style]}>
      {dither && (
        <View style={styles.ditherLayer} pointerEvents="none">
          <DitherField {...dither} />
        </View>
      )}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  ditherLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    flex: 1,
    zIndex: 1,
  },
});
