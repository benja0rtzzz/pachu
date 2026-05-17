import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette } from '@pachu/shared';
import { colors, fonts, radii, shadows, spacing, typography } from '../theme';

// One-line transient surface for "the action just succeeded / failed and the
// screen doesn't need a permanent banner for it." Replaces ad-hoc
// `Alert.alert` calls and the inline error banners we used in Phase 2 for
// rename / delete / finish failures.
//
// Single-toast queue: a new show() replaces the current toast. Good enough
// for our flow (we never burst more than one error at a time during normal
// use); the queue can grow later if a screen ever needs it.

export type ToastTone = 'info' | 'error' | 'success';

interface ToastInput {
  message: string;
  tone?: ToastTone;
  durationMs?: number;
}

interface ToastContextValue {
  show: (input: ToastInput) => void;
  dismiss: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION_MS = 3_500;

const TONE_TINT: Record<ToastTone, { bg: string; border: string; fg: string }> = {
  info: { bg: colors.text, border: colors.text, fg: colors.textOnAccent },
  error: { bg: '#7a0503', border: '#7a0503', fg: '#fff' },
  success: { bg: palette.sage, border: palette.sage, fg: '#fff' },
};

interface ActiveToast {
  id: number;
  message: string;
  tone: ToastTone;
  durationMs: number;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ActiveToast | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counterRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const show = useCallback(
    ({ message, tone = 'info', durationMs = DEFAULT_DURATION_MS }: ToastInput) => {
      counterRef.current += 1;
      const id = counterRef.current;
      clearTimer();
      setToast({ id, message, tone, durationMs });
    },
    [clearTimer],
  );

  const dismiss = useCallback(() => {
    clearTimer();
    setToast(null);
  }, [clearTimer]);

  useEffect(() => {
    if (!toast) return;
    dismissTimerRef.current = setTimeout(() => {
      setToast((cur) => (cur && cur.id === toast.id ? null : cur));
    }, toast.durationMs);
    return clearTimer;
  }, [toast, clearTimer]);

  const value = useMemo<ToastContextValue>(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <ToastView toast={toast} bottomInset={insets.bottom} onDismiss={dismiss} />
      )}
    </ToastContext.Provider>
  );
}

function ToastView({
  toast,
  bottomInset,
  onDismiss,
}: {
  toast: ActiveToast;
  bottomInset: number;
  onDismiss: () => void;
}) {
  const offset = useSharedValue(80);
  useEffect(() => {
    offset.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
  }, [offset, toast.id]);

  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
    opacity: offset.value === 0 ? 1 : Math.max(0, 1 - offset.value / 80),
  }));

  const tint = TONE_TINT[toast.tone];
  return (
    <Animated.View
      style={[
        styles.root,
        { bottom: spacing.lg + bottomInset, backgroundColor: tint.bg, borderColor: tint.border },
        slideStyle,
      ]}
      pointerEvents="box-none"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Text style={[styles.message, { color: tint.fg }]} numberOfLines={3}>
        {toast.message}
      </Text>
      <Text
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        style={[styles.close, { color: tint.fg }]}
      >
        ×
      </Text>
    </Animated.View>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // No provider in tests / Storybook — return a no-op so consumers can
    // still render without crashing.
    return {
      show: () => undefined,
      dismiss: () => undefined,
    };
  }
  return ctx;
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    zIndex: 50,
    ...shadows.card,
  },
  message: {
    flex: 1,
    fontFamily: fonts.ui.medium,
    fontSize: typography.bodySm,
    lineHeight: 20,
  },
  close: {
    fontFamily: fonts.ui.bold,
    fontWeight: '700',
    fontSize: 18,
    paddingHorizontal: 6,
  },
});
