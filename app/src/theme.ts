import { StyleSheet } from 'react-native';
import { palette } from '@pachu/shared';

// Semantic role mapping. The palette is the source of truth — change a
// color there to update every role that references it. Do not inline
// hex codes here; add a token to `shared/src/design/palette.ts` instead.
export const colors = {
  bg: palette.ink,
  surface: palette.shadow,
  surfaceElevated: palette.plum,
  text: palette.bone,
  muted: palette.stone,
  danger: palette.rust,
  success: palette.sage,
  accent: palette.amber,
  accentHot: palette.ember,
  border: palette.wine,
  cell: palette.plum,
  cellBlock: palette.void,
  cellActive: palette.mauve,
  cellHighlight: palette.mulberry,
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16 } as const;

export const typography = {
  title: 28,
  heading: 20,
  subheading: 16,
  body: 14,
  caption: 12,
} as const;

export const sharedStyles = StyleSheet.create({
  screenTitle: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: '700',
  },
  screenSubtitle: {
    color: colors.muted,
    fontSize: typography.body,
    lineHeight: 20,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    color: colors.muted,
    fontSize: typography.caption,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
});
