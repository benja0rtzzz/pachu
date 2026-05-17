import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ensureSkiaReady } from './src/skiaLoader';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';
import {
  BricolageGrotesque_400Regular,
  BricolageGrotesque_500Medium,
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
} from '@expo-google-fonts/bricolage-grotesque';
import { HealthBanner } from './src/components/HealthBanner';
import { CoachProvider } from './src/api/ws';
import { NavigationProvider } from './src/navigation/NavigationContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { SessionProvider } from './src/state/session';
import { ToastProvider } from './src/state/toast';
import { colors } from './src/theme';

export default function App() {
  // Family names referenced via `theme.fonts.*` must each appear here, or
  // React Native silently falls back to the platform default.
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    BricolageGrotesque_400Regular,
    BricolageGrotesque_500Medium,
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
  });

  // Skia v2 on web has to load CanvasKit (WASM) before any `Skia.*` call;
  // without this, the first `DitherField` render throws
  // `Cannot read properties of undefined (reading 'PictureRecorder')`.
  // Native bundles short-circuit inside `ensureSkiaReady`.
  const [skiaReady, setSkiaReady] = useState(false);
  const [skiaError, setSkiaError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await ensureSkiaReady();
        if (!cancelled) setSkiaReady(true);
      } catch (err) {
        const msg = (err as Error)?.message ?? String(err);
        if (__DEV__) console.error('[skia] LoadSkiaWeb failed:', err);
        if (!cancelled) setSkiaError(msg);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (skiaError) {
    // Fail loud rather than letting `DitherField` crash silently. The block
    // text gives the reviewer enough to grep for if the WASM fetch is being
    // proxied / blocked / version-mismatched.
    return (
      <View style={[styles.root, styles.errorBoot]}>
        <Text style={styles.errorBootTitle}>Skia (CanvasKit) failed to load</Text>
        <Text style={styles.errorBootBody}>{skiaError}</Text>
        <Text style={styles.errorBootHint}>
          Check the network tab for the canvaskit.wasm fetch, or self-host via
          {' '}<Text style={styles.errorBootCode}>bunx setup-skia-web public</Text>.
        </Text>
      </View>
    );
  }

  if (!fontsLoaded || !skiaReady) {
    return <View style={styles.root} />;
  }

  return (
    <SafeAreaProvider>
      <ToastProvider>
        <SessionProvider>
          <CoachProvider>
            <NavigationProvider>
              <View style={styles.root}>
                <HealthBanner />
                <RootNavigator />
              </View>
              <StatusBar style="dark" />
            </NavigationProvider>
          </CoachProvider>
        </SessionProvider>
      </ToastProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  errorBoot: {
    padding: 24,
    gap: 12,
    justifyContent: 'center',
  },
  errorBootTitle: {
    color: '#b10804',
    fontSize: 18,
    fontWeight: '700',
  },
  errorBootBody: {
    color: '#0B0F19',
    fontSize: 14,
    lineHeight: 20,
  },
  errorBootHint: {
    color: 'rgba(11,15,25,0.55)',
    fontSize: 13,
    lineHeight: 18,
  },
  errorBootCode: {
    fontFamily: 'monospace',
  },
});
