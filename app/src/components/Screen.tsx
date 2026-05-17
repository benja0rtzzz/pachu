import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, sharedStyles, spacing } from '../theme';
import { PrimaryButton } from './PrimaryButton';

type Props = {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  scroll?: boolean;
  onBack?: () => void;
  footer?: ReactNode;
};

export function Screen({ title, subtitle, children, scroll = true, onBack, footer }: Props) {
  const insets = useSafeAreaInsets();

  const body = (
    <>
      {onBack && (
        <PrimaryButton label="← Back" onPress={onBack} variant="ghost" />
      )}
      {title ? <Text style={sharedStyles.screenTitle}>{title}</Text> : null}
      {subtitle ? (
        <Text style={[sharedStyles.screenSubtitle, styles.subtitle]}>{subtitle}</Text>
      ) : null}
      {children}
    </>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {body}
        </ScrollView>
      ) : (
        <View style={styles.scrollContent}>{body}</View>
      )}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
    flexGrow: 1,
  },
  subtitle: {
    marginTop: -spacing.sm,
  },
  footer: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
});
