import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import {
  Canvas,
  ColorMatrix,
  Group,
  Image as SkiaImage,
  Mask,
  Picture,
  Skia,
  createPicture,
  useImage,
} from '@shopify/react-native-skia';
import {
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated';

// At 60fps each `useDerivedValue` recalculates the entire dot grid every
// frame. Capping ticks at ~30fps halves GPU work with no perceptible change
// to the ambient animation (it moves at < 0.3 rad/s).
const TARGET_FRAME_MS = 1000 / 30;

// IMPORTANT: this file must only be imported via the dynamic `lazy()` in
// `./DitherField.tsx`, after `ensureSkiaReady()` resolves. Skia's web build
// constructs its `Skia` proxy at module-init time using `global.CanvasKit`
// — so importing it before CanvasKit (WASM) has loaded gives you a Skia
// object permanently bound to `undefined`, and every `Skia.*` factory
// crashes with "Cannot read properties of undefined (reading 'X')". The
// gate lives in `DitherField.tsx`; never import this file directly.

type Intensity = 'hero' | 'medium' | 'low';
type Gradient = 'none' | 'top' | 'bottom' | 'radial' | 'corner';

export interface DitherFieldProps {
  intensity?: Intensity;
  speed?: number;
  pulse?: boolean;
  gridSize?: number;
  color?: string;
  gradient?: Gradient;
  /** Clip the dot field to the app logo (bird) silhouette. */
  logoMask?: boolean;
  style?: ViewStyle;
}

// Invert color matrix: the logo png is a dark bird on a white field, but a
// luminance mask keeps the *bright* areas. Inverting flips it so the bird
// becomes the visible region and the white background is masked out.
const INVERT_MATRIX = [
  -1, 0, 0, 0, 1,
  0, -1, 0, 0, 1,
  0, 0, -1, 0, 1,
  0, 0, 0, 1, 0,
];

const CONFIG: Record<
  Intensity,
  { base: number; amp: number; opacity: number; max: number }
> = {
  hero: { base: 0.55, amp: 0.4, opacity: 1.0, max: 0.46 },
  medium: { base: 0.32, amp: 0.22, opacity: 0.55, max: 0.42 },
  low: { base: 0.16, amp: 0.14, opacity: 0.28, max: 0.4 },
};

export default function DitherFieldInner({
  intensity = 'medium',
  speed = 1,
  pulse = true,
  gridSize = 18,
  color = '#0068ff',
  gradient = 'none',
  logoMask = false,
  style,
}: DitherFieldProps) {
  const cfg = CONFIG[intensity];
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const logo = useImage(require('../../assets/logo.png'));
  const t = useSharedValue(0);
  const w = useSharedValue(1);
  const h = useSharedValue(1);
  const lastTickTime = useSharedValue(0);

  useFrameCallback((info) => {
    'worklet';
    if (info.timestamp - lastTickTime.value < TARGET_FRAME_MS) return;
    lastTickTime.value = info.timestamp;
    const dtMs = info.timeSincePreviousFrame ?? 16;
    t.value += (dtMs / 1000) * speed;
  });

  const picture = useDerivedValue(() => {
    'worklet';
    const W = w.value;
    const H = h.value;
    const tNow = t.value;
    const base = cfg.base;
    const amp = cfg.amp;
    const maxScale = cfg.max;

    return createPicture((canvas) => {
      const paint = Skia.Paint();
      paint.setColor(Skia.Color(color));

      const pulseFactor = pulse
        ? base + amp * (0.5 + 0.5 * Math.sin(tNow * 0.9))
        : base + amp * 0.6;

      const cols = Math.ceil(W / gridSize) + 1;
      const rows = Math.ceil(H / gridSize) + 1;
      const halfCell = gridSize / 2;
      const maxR = gridSize * maxScale;

      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const px = i * gridSize + halfCell;
          const py = j * gridSize + halfCell;

          const a =
            Math.sin(px * 0.018 + tNow * 0.27) *
            Math.cos(py * 0.022 - tNow * 0.21);
          const b = Math.sin((px + py) * 0.013 + tNow * 0.13);
          const c = Math.cos((px - py * 0.7) * 0.009 - tNow * 0.18);
          const n = (a * 0.5 + b * 0.3 + c * 0.2 + 1) * 0.5;

          let density = pulseFactor * (0.55 + 0.55 * n);

          if (gradient === 'top') {
            density *= Math.max(0, 1 - (py / H) * 1.15);
          } else if (gradient === 'bottom') {
            density *= Math.max(0, (py / H) * 1.15 - 0.05);
          } else if (gradient === 'radial') {
            const dx = px - W / 2;
            const dy = py - H / 2;
            const d =
              Math.sqrt(dx * dx + dy * dy) / (Math.max(W, H) * 0.55);
            density *= Math.max(0, 1 - d * 0.9);
          } else if (gradient === 'corner') {
            // Circle "origin" at the bottom-right corner: brightest there,
            // fading out toward the top-left. Tighter spread (1.45) plus a
            // squared falloff so the diffusion from the dense core out to
            // nothing is stronger and reads smoother (less rough banding).
            const dx = px - W;
            const dy = py - H;
            const d = Math.sqrt(dx * dx + dy * dy) / Math.hypot(W, H);
            const f = Math.max(0, 1 - d * 1.45);
            density *= f * f;
          }

          const r = Math.max(0, Math.min(maxR, density * maxR * 1.25));
          if (r < 0.25) continue;
          canvas.drawCircle(px, py, r, paint);
        }
      }
    });
  });

  const [size, setSize] = useState({ w: 0, h: 0 });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    w.value = width;
    h.value = height;
    setSize((prev) =>
      prev.w === width && prev.h === height ? prev : { w: width, h: height },
    );
  };

  // Bird anchored to the top-right, oversized and pushed right so only ~the
  // right half shows in the corner. Tuned by eye — adjust the multipliers if
  // the crop needs nudging.
  const span = Math.max(size.w, size.h) * 1.15;
  const imgX = size.w - span * 0.66;
  const imgY = -span * 0.06;

  const useLogo = logoMask && logo != null && size.w > 0;

  return (
    <View
      style={[styles.fill, { opacity: cfg.opacity }, style]}
      onLayout={onLayout}
      pointerEvents="none"
    >
      <Canvas style={styles.fill}>
        {useLogo ? (
          <Mask
            mode="luminance"
            mask={
              <Group>
                <SkiaImage
                  image={logo}
                  x={imgX}
                  y={imgY}
                  width={span}
                  height={span}
                  fit="contain"
                >
                  <ColorMatrix matrix={INVERT_MATRIX} />
                </SkiaImage>
              </Group>
            }
          >
            <Picture picture={picture} />
          </Mask>
        ) : (
          <Picture picture={picture} />
        )}
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject },
});
