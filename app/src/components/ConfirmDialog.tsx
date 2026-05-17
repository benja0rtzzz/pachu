import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from 'react-native';
import { colors, fonts, radii, shadows, spacing, typography } from '../theme';

// Cross-platform confirm modal. RN's Alert button callbacks don't fire on
// react-native-web (and ActionSheetIOS is iOS-only), so anything that needs a
// reliable yes/no — "end session early?", "delete?" — uses this instead.

type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
  onCancel,
}: Props) {
  if (!visible) return null;
  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{message}</Text>
        <View style={styles.actions}>
          <Pressable onPress={onCancel} style={styles.cancel}>
            <Text style={styles.cancelLabel}>{cancelLabel}</Text>
          </Pressable>
          <Pressable
            onPress={onConfirm}
            style={[styles.confirm, tone === 'danger' && styles.confirmDanger]}
          >
            <Text
              style={[
                styles.confirmLabel,
                tone === 'danger' && styles.confirmDangerLabel,
              ]}
            >
              {confirmLabel}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11,15,25,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    zIndex: 50,
  },
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.hero,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.display.semibold,
    fontWeight: '600',
    fontSize: typography.heading,
  },
  body: {
    color: colors.muted,
    fontFamily: fonts.ui.regular,
    fontSize: typography.bodySm,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  cancel: {
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  cancelLabel: {
    color: colors.muted,
    fontFamily: fonts.ui.semibold,
    fontWeight: '600',
    fontSize: typography.body,
  },
  confirm: {
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
    ...shadows.button,
  },
  confirmDanger: {
    backgroundColor: '#b10804',
  },
  confirmLabel: {
    color: colors.textOnAccent,
    fontFamily: fonts.ui.semibold,
    fontWeight: '600',
    fontSize: typography.body,
  },
  confirmDangerLabel: {
    color: '#fff',
  },
});
