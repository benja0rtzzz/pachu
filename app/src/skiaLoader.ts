import { Platform } from 'react-native';

// Skia v2 on web needs the CanvasKit WASM module loaded before any
// `Skia.*` call. On native there's a real native module behind the JSI
// bridge so this is a no-op.
//
// We pin the WASM to the same `canvaskit-wasm` version Skia bundles
// (0.40.0 today) and pull it from jsDelivr so dev/demo runs work without
// the `setup-skia-web` postinstall step that copies the binary into
// Metro's static dir. For a production build, swap `locateFile` for a
// self-hosted path.
const CANVASKIT_VERSION = '0.40.0';

export async function ensureSkiaReady(): Promise<void> {
  if (Platform.OS !== 'web') return;
  // Dynamic import so native bundles never pull the web entry.
  const { LoadSkiaWeb } = await import(
    '@shopify/react-native-skia/lib/module/web'
  );
  await LoadSkiaWeb({
    locateFile: (file: string) =>
      `https://cdn.jsdelivr.net/npm/canvaskit-wasm@${CANVASKIT_VERSION}/bin/full/${file}`,
  });
}
