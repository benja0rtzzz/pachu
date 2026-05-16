import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { HealthResponse } from '@pachu/shared';
import { API_BASE_URL, getHealth } from './src/api/client';

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; health: HealthResponse }
  | { kind: 'error'; message: string };

export default function App() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const health = await getHealth();
        if (!cancelled) setState({ kind: 'ok', health });
      } catch (e) {
        if (!cancelled) setState({ kind: 'error', message: (e as Error).message });
      }
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pachu</Text>
      <Text style={styles.subtitle}>backend: {API_BASE_URL}</Text>

      {state.kind === 'loading' && <ActivityIndicator />}

      {state.kind === 'error' && (
        <View style={styles.card}>
          <Text style={styles.errorTitle}>Backend unreachable</Text>
          <Text style={styles.errorBody}>{state.message}</Text>
          <Text style={styles.hint}>
            Make sure the backend is running (`bun run dev:backend`). On a phone, set
            EXPO_PUBLIC_API_BASE_URL to your laptop's LAN IP.
          </Text>
        </View>
      )}

      {state.kind === 'ok' && (
        <View style={styles.card}>
          <Row label="service" value={state.health.service} />
          <Row label="version" value={state.health.version} />
          <Row label="uptime" value={`${Math.round(state.health.uptimeMs / 1000)}s`} />
          <Row
            label="LLM"
            value={`${state.health.llm.provider} / ${state.health.llm.model}`}
          />
          <Row
            label="LLM reachable"
            value={state.health.llm.reachable ? 'yes' : 'NO'}
            highlight={!state.health.llm.reachable}
          />
        </View>
      )}

      <StatusBar style="auto" />
    </View>
  );
}

function Row(props: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{props.label}</Text>
      <Text style={[styles.rowValue, props.highlight ? styles.rowValueAlert : null]}>
        {props.value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1115',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: '#f5f7fa',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 24,
  },
  card: {
    backgroundColor: '#1b1f29',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    maxWidth: 420,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  rowLabel: { color: '#94a3b8', fontSize: 13 },
  rowValue: { color: '#f5f7fa', fontSize: 13, fontWeight: '600' },
  rowValueAlert: { color: '#f87171' },
  errorTitle: { color: '#f87171', fontSize: 16, fontWeight: '700', marginBottom: 6 },
  errorBody: { color: '#f5f7fa', fontSize: 13, marginBottom: 8 },
  hint: { color: '#94a3b8', fontSize: 12 },
});
