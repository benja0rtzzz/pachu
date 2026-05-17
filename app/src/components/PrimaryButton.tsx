import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { colors, fonts, radii, shadows, spacing, typography } from '../theme';

// Buttons ported from `app/screens/screens.jsx` — Primary (blue + glow),
// Secondary (white + hairline border), Ghost (blue text link). All three
// support a `full` prop that stretches them to the row width.
//
// `PrimaryButton` keeps its original `variant` API so legacy screens that
// pass `variant="secondary"` / `"ghost"` continue to compile. New screens
// in the Phase 2 rework should reach for the dedicated
// `SecondaryButton` / `GhostLink` exports directly.

type Variant = 'primary' | 'secondary' | 'ghost';

type CommonProps = {
  label?: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  full?: boolean;
  leading?: ReactNode;
  style?: ViewStyle;
};

type PrimaryProps = CommonProps & { variant?: Variant };

export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  full,
  leading,
  style,
  variant = 'primary',
}: PrimaryProps) {
  if (variant === 'secondary') {
    return (
      <SecondaryButton
        label={label}
        onPress={onPress}
        disabled={disabled}
        loading={loading}
        full={full}
        leading={leading}
        style={style}
      />
    );
  }
  if (variant === 'ghost') {
    return (
      <GhostLink
        label={label ?? ''}
        onPress={onPress}
        disabled={disabled}
        style={style}
      />
    );
  }

  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        styles.primary,
        full && styles.full,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator color={colors.textOnAccent} size="small" />
        ) : (
          leading ?? null
        )}
        {label ? (
          <Text style={[styles.label, styles.labelPrimary]}>{label}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

type SecondaryProps = CommonProps;

export function SecondaryButton({
  label,
  onPress,
  disabled,
  loading,
  full,
  leading,
  style,
}: SecondaryProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        styles.secondary,
        full && styles.full,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <View style={styles.row}>
          {leading}
          {label ? (
            <Text style={[styles.label, styles.labelSecondary]}>{label}</Text>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

type GhostProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
};

export function GhostLink({ label, onPress, disabled, style }: GhostProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.ghost,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <Text style={styles.labelGhost}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.md,
    paddingVertical: 16,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: colors.accent,
    ...shadows.button,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingVertical: 15,
  },
  ghost: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  full: {
    alignSelf: 'stretch',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.85,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  label: {
    fontFamily: fonts.ui.semibold,
    fontWeight: '600',
    fontSize: typography.body,
    letterSpacing: -0.08,
  },
  labelPrimary: {
    color: colors.textOnAccent,
  },
  labelSecondary: {
    color: colors.text,
  },
  labelGhost: {
    fontFamily: fonts.ui.semibold,
    fontWeight: '600',
    fontSize: 14.5,
    color: colors.accent,
    letterSpacing: -0.07,
  },
});
