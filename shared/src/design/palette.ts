/**
 * Pachu brand palette — single source of truth for color.
 *
 * Tokens are named by what they ARE (pigment), not what they DO (role).
 * Semantic role assignment lives in consumers (e.g. `app/src/theme.ts`).
 * Never inline a hex code in a consumer; add a token here and reference it.
 *
 * Scale runs from `void` (darkest) up to `bone` (warm near-white):
 *   void < ink < shadow < plum < wine < mulberry < mauve < stone < bone
 */
export const palette = {
  // Brand — the six core pigments
  rust: '#b10804',
  ember: '#fb4007',
  amber: '#f68f41',
  mauve: '#8e525c',
  stone: '#ac9e9c',
  plum: '#4b2e3e',

  // Derived warm-dark scale (kept in the plum family for cohesion)
  void: '#0f0608',
  ink: '#1a0e12',
  shadow: '#2a1a22',
  wine: '#5a3a48',
  mulberry: '#6b3d4a',
  bone: '#faf3f0',

  // Off-palette — semantic green for success/correct feedback.
  // The brand palette has no green; a desaturated sage keeps the warm
  // tone without clashing.
  sage: '#7fb069',
} as const;

export type PaletteToken = keyof typeof palette;
export type PaletteValue = (typeof palette)[PaletteToken];
