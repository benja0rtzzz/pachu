import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
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
import { NavigationProvider } from './src/navigation/NavigationContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { SessionProvider } from './src/state/session';
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

  if (!fontsLoaded) {
    return <View style={styles.root} />;
  }

  return (
    <SafeAreaProvider>
      <SessionProvider>
        <NavigationProvider>
          <View style={styles.root}>
            <HealthBanner />
            <RootNavigator />
          </View>
          <StatusBar style="dark" />
        </NavigationProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
});
