import { useCallback, useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PuzzleKind, Space } from '@pachu/shared';
import { palette } from '@pachu/shared';
import { ScreenShell } from '../components/ScreenShell';
import { TopBar } from '../components/TopBar';
import { useNavigation } from '../navigation/NavigationContext';
import { useSpaces } from '../state/session';
import { colors, fonts, radii, shadows, spacing, typography } from '../theme';

const KIND_LABEL: Record<PuzzleKind, string> = {
  crossword: 'Crossword',
  cloze: 'Cloze',
  flashcards: 'Flashcards',
};

const KIND_ORDER: PuzzleKind[] = ['crossword', 'cloze', 'flashcards'];

type BadgeStatus = 'ready' | 'done' | 'unavailable';

function kindStatus(space: Space, kind: PuzzleKind): BadgeStatus {
  if (space.summary.playedTodayKinds.includes(kind)) return 'done';
  if (space.summary.dueCount === 0 && space.summary.termCount === 0) return 'unavailable';
  return 'ready';
}

/**
 * Sort: spaces with un-finished due-today work first, then by streak desc,
 * then by lastReviewedAt desc. One fixed order, no user toggle, per
 * docs/SCREENS.md SpacesScreen MVP.
 */
function sortSpaces(spaces: Space[]): Space[] {
  return [...spaces].sort((a, b) => {
    const aUrgent =
      a.summary.dueToday > 0 && a.summary.playedTodayKinds.length < KIND_ORDER.length;
    const bUrgent =
      b.summary.dueToday > 0 && b.summary.playedTodayKinds.length < KIND_ORDER.length;
    if (aUrgent !== bUrgent) return aUrgent ? -1 : 1;
    if (a.summary.streakDays !== b.summary.streakDays) {
      return b.summary.streakDays - a.summary.streakDays;
    }
    const aLast = a.summary.lastReviewedAt ? Date.parse(a.summary.lastReviewedAt) : 0;
    const bLast = b.summary.lastReviewedAt ? Date.parse(b.summary.lastReviewedAt) : 0;
    return bLast - aLast;
  });
}

export function SpacesScreen() {
  const insets = useSafeAreaInsets();
  const { navigate, goBack } = useNavigation();
  const {
    spaces,
    loading,
    error,
    refreshSpaces,
    setActiveSpaceId,
    renameSpace,
    deleteSpace,
  } = useSpaces();

  const [refreshing, setRefreshing] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Space | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [mutationError, setMutationError] = useState<string | null>(null);

  const sorted = useMemo(() => sortSpaces(spaces), [spaces]);
  const totalDue = useMemo(
    () => spaces.reduce((acc, s) => acc + s.summary.dueCount, 0),
    [spaces],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshSpaces();
    } finally {
      setRefreshing(false);
    }
  }, [refreshSpaces]);

  const openSpace = (space: Space) => {
    setActiveSpaceId(space.id);
    navigate({ name: 'space', spaceId: space.id });
  };

  const promptRename = (space: Space) => {
    setRenameTarget(space);
    setRenameDraft(space.title);
  };

  const submitRename = async () => {
    if (!renameTarget) return;
    const next = renameDraft.trim();
    if (!next || next === renameTarget.title) {
      setRenameTarget(null);
      return;
    }
    try {
      await renameSpace(renameTarget.id, next);
      setRenameTarget(null);
    } catch (err) {
      setMutationError(`Rename failed: ${(err as Error).message}`);
      setRenameTarget(null);
    }
  };

  const confirmDelete = (space: Space) => {
    const message = 'This deletes terms, FSRS history, and all puzzles. Cannot be undone.';
    const doDelete = async () => {
      try {
        await deleteSpace(space.id);
      } catch (err) {
        setMutationError(`Delete failed: ${(err as Error).message}`);
      }
    };
    Alert.alert(`Delete "${space.title}"?`, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void doDelete() },
    ]);
  };

  const openActionSheet = (space: Space) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Rename space', 'Delete space'],
          destructiveButtonIndex: 2,
          cancelButtonIndex: 0,
          title: space.title,
        },
        (index) => {
          if (index === 1) promptRename(space);
          if (index === 2) confirmDelete(space);
        },
      );
      return;
    }
    Alert.alert(space.title, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Rename space', onPress: () => promptRename(space) },
      { text: 'Delete space', style: 'destructive', onPress: () => confirmDelete(space) },
    ]);
  };

  return (
    <ScreenShell dither={{ intensity: 'low', gradient: 'radial' }}>
      <TopBar
        title="My spaces"
        onBack={goBack}
        right={
          <Pressable
            onPress={() => navigate({ name: 'import' })}
            accessibilityRole="button"
            accessibilityLabel="New space"
            hitSlop={8}
            style={styles.addBtn}
          >
            <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
              <Path
                d="M8 3v10M3 8h10"
                stroke={colors.textOnAccent}
                strokeWidth={2}
                strokeLinecap="round"
              />
            </Svg>
          </Pressable>
        }
      />

      <View style={styles.headerRow}>
        <Text style={styles.h2}>
          {spaces.length} {spaces.length === 1 ? 'space' : 'spaces'}
        </Text>
        <Text style={styles.h2Sub}>
          {totalDue} {totalDue === 1 ? 'item' : 'items'} due across all spaces
        </Text>
      </View>

      {error && <Text style={styles.errorBanner}>Couldn't load spaces — {error}</Text>}
      {mutationError && <Text style={styles.errorBanner}>{mutationError}</Text>}

      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: spacing.xl + insets.bottom }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
      >
        {!loading && sorted.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No spaces yet</Text>
            <Text style={styles.emptyHint}>
              Register notes to create your first space.
            </Text>
            <Pressable
              onPress={() => navigate({ name: 'import' })}
              style={styles.emptyCta}
            >
              <Text style={styles.emptyCtaLabel}>Register notes</Text>
            </Pressable>
          </View>
        ) : (
          sorted.map((space) => (
            <SpaceRow
              key={space.id}
              space={space}
              onOpen={() => openSpace(space)}
              onLongPress={() => openActionSheet(space)}
            />
          ))
        )}
      </ScrollView>

      {renameTarget && (
        <View style={styles.renameOverlay}>
          <View style={styles.renameCard}>
            <Text style={styles.renameTitle}>Rename space</Text>
            <TextInput
              value={renameDraft}
              onChangeText={setRenameDraft}
              autoFocus
              style={styles.renameInput}
              placeholder="Space title"
              placeholderTextColor={colors.muted}
            />
            <View style={styles.renameActions}>
              <Pressable onPress={() => setRenameTarget(null)} style={styles.renameCancel}>
                <Text style={styles.renameCancelLabel}>Cancel</Text>
              </Pressable>
              <Pressable onPress={submitRename} style={styles.renameSave}>
                <Text style={styles.renameSaveLabel}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </ScreenShell>
  );
}

function SpaceRow({
  space,
  onOpen,
  onLongPress,
}: {
  space: Space;
  onOpen: () => void;
  onLongPress: () => void;
}) {
  const { summary } = space;
  const ratio =
    summary.termCount > 0
      ? Math.max(0.03, 1 - summary.dueCount / summary.termCount)
      : 0.03;

  const todayLine =
    summary.dueToday > 0
      ? `Today: ${summary.dueToday} ${summary.dueToday === 1 ? 'card' : 'cards'} due`
      : summary.dueCount === 0
        ? 'All caught up'
        : `${summary.dueCount} ${summary.dueCount === 1 ? 'card' : 'cards'} due`;

  return (
    <Pressable
      onPress={onOpen}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={styles.row}
    >
      <View style={styles.rowHeader}>
        <View style={styles.rowTitleWrap}>
          <Text style={styles.rowTitle}>{space.title}</Text>
          <Text style={styles.rowMeta}>
            {summary.termCount} {summary.termCount === 1 ? 'term' : 'terms'}
            <Text style={styles.metaDot}>{'  ·  '}</Text>
            {todayLine}
          </Text>
        </View>
        {summary.dueToday > 0 ? (
          <View style={styles.duePill}>
            <Text style={styles.duePillLabel}>{summary.dueToday} due</Text>
          </View>
        ) : (
          <Text style={styles.caughtUp}>caught up</Text>
        )}
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${ratio * 100}%` }]} />
      </View>

      <View style={styles.badgesRow}>
        {KIND_ORDER.map((kind) => {
          const status = kindStatus(space, kind);
          return (
            <View key={kind} style={[styles.badge, badgeStyle(status)]}>
              <Text style={[styles.badgeLabel, badgeLabelStyle(status)]}>
                {KIND_LABEL[kind]}
                {status === 'done' ? ' ✓' : ''}
              </Text>
            </View>
          );
        })}
        {summary.streakDays > 0 && (
          <View style={styles.streakChip}>
            <Text style={styles.streakLabel}>🔥 {summary.streakDays}d</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

function badgeStyle(status: BadgeStatus) {
  if (status === 'ready') return { backgroundColor: 'rgba(0,104,255,0.08)' };
  if (status === 'done') return { backgroundColor: 'rgba(127,176,105,0.14)' };
  return { backgroundColor: palette.ink06 };
}

function badgeLabelStyle(status: BadgeStatus) {
  if (status === 'ready') return { color: colors.accent };
  if (status === 'done') return { color: palette.sage };
  return { color: colors.subtle };
}

const styles = StyleSheet.create({
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.pill,
  },
  headerRow: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  h2: {
    color: colors.text,
    fontFamily: fonts.display.semibold,
    fontWeight: '600',
    fontSize: 30,
    letterSpacing: -0.75,
    marginBottom: 4,
  },
  h2Sub: {
    color: colors.muted,
    fontFamily: fonts.ui.regular,
    fontSize: typography.bodySm,
  },
  errorBanner: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    color: colors.text,
    backgroundColor: 'rgba(177,8,4,0.08)',
    padding: spacing.sm,
    borderRadius: radii.sm,
    fontFamily: fonts.ui.medium,
    fontSize: typography.caption,
  },
  list: {
    paddingHorizontal: spacing.lg,
    gap: 10,
    flexGrow: 1,
  },
  empty: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  emptyTitle: {
    color: colors.text,
    fontFamily: fonts.display.semibold,
    fontWeight: '600',
    fontSize: typography.title,
  },
  emptyHint: {
    color: colors.muted,
    fontFamily: fonts.ui.regular,
    fontSize: typography.body,
    textAlign: 'center',
  },
  emptyCta: {
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: 14,
    paddingHorizontal: 22,
    ...shadows.button,
  },
  emptyCtaLabel: {
    color: colors.textOnAccent,
    fontFamily: fonts.ui.semibold,
    fontWeight: '600',
    fontSize: typography.body,
  },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 12,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    color: colors.text,
    fontFamily: fonts.display.semibold,
    fontWeight: '600',
    fontSize: typography.subheading,
    lineHeight: 22,
    letterSpacing: -0.25,
    marginBottom: 4,
  },
  rowMeta: {
    color: colors.muted,
    fontFamily: fonts.ui.regular,
    fontSize: typography.caption,
  },
  metaDot: {
    color: palette.ink25,
  },
  duePill: {
    backgroundColor: 'rgba(0,104,255,0.08)',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
  },
  duePillLabel: {
    color: colors.accent,
    fontFamily: fonts.ui.bold,
    fontWeight: '700',
    fontSize: 13,
  },
  caughtUp: {
    color: colors.subtle,
    fontFamily: fonts.ui.semibold,
    fontWeight: '600',
    fontSize: typography.caption,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  progressTrack: {
    position: 'relative',
    height: 4,
    backgroundColor: palette.ink06,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: radii.pill,
  },
  badgeLabel: {
    fontFamily: fonts.ui.semibold,
    fontWeight: '600',
    fontSize: 11,
  },
  streakChip: {
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(251,64,7,0.08)',
  },
  streakLabel: {
    color: '#c64614',
    fontFamily: fonts.ui.semibold,
    fontWeight: '600',
    fontSize: 11,
  },
  renameOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11,15,25,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    zIndex: 10,
  },
  renameCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.hero,
  },
  renameTitle: {
    color: colors.text,
    fontFamily: fonts.display.semibold,
    fontWeight: '600',
    fontSize: typography.heading,
  },
  renameInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: colors.text,
    fontFamily: fonts.ui.medium,
    fontSize: typography.body,
  },
  renameActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  renameCancel: {
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  renameCancelLabel: {
    color: colors.muted,
    fontFamily: fonts.ui.semibold,
    fontWeight: '600',
    fontSize: typography.body,
  },
  renameSave: {
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
    ...shadows.button,
  },
  renameSaveLabel: {
    color: colors.textOnAccent,
    fontFamily: fonts.ui.semibold,
    fontWeight: '600',
    fontSize: typography.body,
  },
});
