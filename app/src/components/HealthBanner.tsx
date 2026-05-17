import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { HealthResponse } from '@pachu/shared';
import { API_BASE_URL, getHealth } from '../api/client';
import { colors, radius, spacing, typography } from '../theme';

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; health: HealthResponse }
  | { kind: 'error'; message: string };

export function HealthBanner() {
  const [expanded, setExpanded] = useState(false);
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

  const ok = state.kind === 'ok';
  const llmOk = ok && state.health.llm.reachable;
  const dotColor =
    state.kind === 'loading' ? colors.muted : ok && llmOk ? colors.success : colors.danger;

  return (
    <Pressable
      onPress={() => setExpanded((v) => !v)}
      style={styles.wrap}
      accessibilityRole="button"
      accessibilityLabel="Backend health status"
    >
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        {state.kind === 'loading' ? (
          <ActivityIndicator size="small" color={colors.muted} style={styles.spinner} />
        ) : (
          <Text style={styles.summary}>
            {state.kind === 'error'
              ? 'Backend offline'
              : `Backend · LLM ${llmOk ? 'ready' : 'unreachable'}`}
          </Text>
        )}
        <Text style={styles.chevron}>{expanded ? '▾' : '▸'}</Text>
      </View>

      {expanded && (
        <View style={styles.details}>
          <Text style={styles.hint}>API: {API_BASE_URL}</Text>
          {state.kind === 'error' && (
            <Text style={styles.error}>{state.message}</Text>
          )}
          {state.kind === 'ok' && (
            <>
              <Detail label="version" value={state.health.version} />
              <Detail
                label="uptime"
                value={`${Math.round(state.health.uptimeMs / 1000)}s`}
              />
              <Detail
                label="model"
                value={`${state.health.llm.provider} / ${state.health.llm.model}`}
              />
            </>
          )}
        </View>
      )}
    </Pressable>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  spinner: {
    flex: 1,
  },
  summary: {
    flex: 1,
    color: colors.muted,
    fontSize: typography.caption,
  },
  chevron: {
    color: colors.muted,
    fontSize: 10,
  },
  details: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  hint: {
    color: colors.muted,
    fontSize: typography.caption,
    marginBottom: spacing.xs,
  },
  error: {
    color: colors.danger,
    fontSize: typography.caption,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  detailLabel: { color: colors.muted, fontSize: typography.caption },
  detailValue: { color: colors.text, fontSize: typography.caption, fontWeight: '600' },
});
