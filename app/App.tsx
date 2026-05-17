import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { HealthBanner } from './src/components/HealthBanner';
import { NavigationProvider } from './src/navigation/NavigationContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { SessionProvider } from './src/state/session';
import { colors } from './src/theme';

export default function App() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <NavigationProvider>
          <View style={styles.root}>
            <HealthBanner />
            <RootNavigator />
          </View>
          <StatusBar style="light" />
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
