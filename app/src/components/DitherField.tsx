import { lazy, Suspense } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { ensureSkiaReady } from '../skiaLoader';
import type { DitherFieldProps } from './DitherFieldInner';

// Public gate. NO `@shopify/react-native-skia` imports here — Skia's web
// build constructs its `Skia` API at module-init time using
// `global.CanvasKit`. If anything imports the Skia package before
// `LoadSkiaWeb` resolves, `Skia.*` factories are permanently bound to an
// undefined CanvasKit and every call throws
// "Cannot read properties of undefined (reading 'PictureRecorder')".
//
// We sidestep that by lazy-importing `./DitherFieldInner` only after
// `ensureSkiaReady()` resolves. On native this is effectively immediate
// (`ensureSkiaReady` short-circuits via `Platform.OS !== 'web'`).
const DitherFieldInner = lazy(async () => {
  await ensureSkiaReady();
  return import('./DitherFieldInner');
});

export function DitherField(props: DitherFieldProps) {
  return (
    <Suspense fallback={<View style={[styles.fill, props.style]} pointerEvents="none" />}>
      <DitherFieldInner {...props} />
    </Suspense>
  );
}

export type { DitherFieldProps };

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject },
});
