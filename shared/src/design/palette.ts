/**
 * Pachu brand palette — Puzzle Forge Coach scheme.
 *
 * Tokens are named by what they ARE (pigment / opacity step), not what they
 * DO (role). Semantic role assignment lives in `app/src/theme.ts`. Never
 * inline a hex code in a consumer; add a token here and reference it.
 *
 * The scheme is cool: a single electric blue accent (`blue`) over a near-black
 * ink (`ink`) on white (`surface`), with a six-step rgba ladder of ink for
 * text, borders, fills, and overlays. `hairline` is the canonical 1px divider
 * color. `sage` stays as the off-palette success green (no green in the
 * brand otherwise).
 */
export const palette = {
  blue: '#0068ff',
  ink: '#0B0F19',

  // Ink opacity ladder — use these for text tiers, borders, fills.
  ink70: 'rgba(11,15,25,0.70)',
  ink55: 'rgba(11,15,25,0.55)',
  ink40: 'rgba(11,15,25,0.40)',
  ink25: 'rgba(11,15,25,0.25)',
  ink10: 'rgba(11,15,25,0.10)',
  ink06: 'rgba(11,15,25,0.06)',

  surface: '#FFFFFF',
  hairline: 'rgba(11,15,25,0.08)',

  // Off-palette — semantic green for success/correct feedback.
  sage: '#7fb069',
} as const;

export type PaletteToken = keyof typeof palette;
export type PaletteValue = (typeof palette)[PaletteToken];
