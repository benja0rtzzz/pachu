import { StyleSheet } from 'react-native';
import { palette } from '@pachu/shared';

// Semantic role mapping. The palette is the source of truth — change a
// color there to update every role that references it. Do not inline hex
// codes here; add a token to `shared/src/design/palette.ts` instead.
//
// The post-rework scheme is white surface + electric blue accent + near-black
// ink. Legacy keys (`bg`, `surface`, `cell*`, etc.) are preserved so screens
// still compile during the Phase 2 rework; some collapse onto the same token
// because the new palette has fewer degrees of freedom than the warm one.
export const colors = {
  bg: palette.surface,
  surface: palette.surface,
  surfaceElevated: palette.surface,
  text: palette.ink,
  textOnAccent: palette.surface,
  muted: palette.ink55,
  subtle: palette.ink40,
  danger: palette.ink,
  success: palette.sage,
  accent: palette.blue,
  accentHot: palette.blue,
  border: palette.hairline,
  borderStrong: palette.ink10,
  cell: palette.surface,
  cellBlock: palette.ink,
  cellActive: palette.blue,
  cellHighlight: palette.ink06,
  overlay: palette.ink70,
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

// Blueprint uses a fine-grained radius scale; legacy `radius.sm|md|lg` keys
// preserved for older components.
export const radii = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 14,
  lg: 18,
  xl: 20,
  xxl: 22,
  card: 24,
  pill: 99,
} as const;

export const radius = { sm: radii.xs, md: radii.sm, lg: radii.lg } as const;

// Typography scale derived from the blueprint (Bricolage display, Manrope UI).
// `fonts.ui` / `fonts.display` resolve to the weight-suffixed family names
// emitted by `@expo-google-fonts/*` — `useFonts` in App.tsx must load every
// weight that gets referenced as a `fontFamily`.
export const fonts = {
  ui: {
    regular: 'Manrope_400Regular',
    medium: 'Manrope_500Medium',
    semibold: 'Manrope_600SemiBold',
    bold: 'Manrope_700Bold',
  },
  display: {
    regular: 'BricolageGrotesque_400Regular',
    medium: 'BricolageGrotesque_500Medium',
    semibold: 'BricolageGrotesque_600SemiBold',
    bold: 'BricolageGrotesque_700Bold',
  },
} as const;

export const typography = {
  hero: 56,
  display: 32,
  title: 28,
  heading: 20,
  subheading: 17,
  body: 16,
  bodySm: 14,
  caption: 12,
  micro: 11,
  eyebrow: 10.5,
} as const;

// React Native shadow primitives. iOS/web read the shadow* keys; Android
// reads `elevation`. Numbers tuned to match the blueprint's box-shadows:
//   card:    0 8px 32px rgba(0,38,92,0.06)
//   hero:    0 16px 50px rgba(0,38,92,0.10)
//   button:  0 6px 16px rgba(0,104,255,0.25)
//   pill:    0 4px 12px rgba(0,104,255,0.25)
const SHADOW_NAVY = '#00265c';
export const shadows = {
  card: {
    shadowColor: SHADOW_NAVY,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 32,
    elevation: 2,
  },
  hero: {
    shadowColor: SHADOW_NAVY,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.1,
    shadowRadius: 50,
    elevation: 6,
  },
  button: {
    shadowColor: palette.blue,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 4,
  },
  pill: {
    shadowColor: palette.blue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 3,
  },
} as const;

export const sharedStyles = StyleSheet.create({
  screenTitle: {
    color: colors.text,
    fontSize: typography.heading,
    fontFamily: fonts.display.semibold,
    fontWeight: '600',
  },
  screenSubtitle: {
    color: colors.muted,
    fontSize: typography.bodySm,
    fontFamily: fonts.ui.regular,
    lineHeight: 20,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    color: colors.subtle,
    fontSize: typography.caption,
    fontFamily: fonts.ui.bold,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    marginBottom: spacing.xs,
  },
});
