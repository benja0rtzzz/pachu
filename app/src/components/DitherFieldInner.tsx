import { StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import {
  Canvas,
  Picture,
  Skia,
  createPicture,
} from '@shopify/react-native-skia';
import {
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated';

// IMPORTANT: this file must only be imported via the dynamic `lazy()` in
// `./DitherField.tsx`, after `ensureSkiaReady()` resolves. Skia's web build
// constructs its `Skia` proxy at module-init time using `global.CanvasKit`
// — so importing it before CanvasKit (WASM) has loaded gives you a Skia
// object permanently bound to `undefined`, and every `Skia.*` factory
// crashes with "Cannot read properties of undefined (reading 'X')". The
// gate lives in `DitherField.tsx`; never import this file directly.

type Intensity = 'hero' | 'medium' | 'low';
type Gradient = 'none' | 'top' | 'bottom' | 'radial';

export interface DitherFieldProps {
  intensity?: Intensity;
  speed?: number;
  pulse?: boolean;
  gridSize?: number;
  color?: string;
  gradient?: Gradient;
  style?: ViewStyle;
}

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
  gridSize = 12,
  color = '#0068ff',
  gradient = 'none',
  style,
}: DitherFieldProps) {
  const cfg = CONFIG[intensity];
  const t = useSharedValue(0);
  const w = useSharedValue(1);
  const h = useSharedValue(1);

  useFrameCallback((info) => {
    'worklet';
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
          }

          const r = Math.max(0, Math.min(maxR, density * maxR * 1.25));
          if (r < 0.25) continue;
          canvas.drawCircle(px, py, r, paint);
        }
      }
    });
  });

  const onLayout = (e: LayoutChangeEvent) => {
    w.value = e.nativeEvent.layout.width;
    h.value = e.nativeEvent.layout.height;
  };

  return (
    <View
      style={[styles.fill, { opacity: cfg.opacity }, style]}
      onLayout={onLayout}
      pointerEvents="none"
    >
      <Canvas style={styles.fill}>
        <Picture picture={picture} />
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject },
});
