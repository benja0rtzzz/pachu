import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { palette } from '@pachu/shared';
import { ApiError } from '../api/client';
import { DitherField } from '../components/DitherField';
import {
  GhostLink,
  PrimaryButton,
} from '../components/PrimaryButton';
import { ScreenShell } from '../components/ScreenShell';
import { TopBar } from '../components/TopBar';
import { DEMO_NOTES } from '../mocks/demoNotes';
import { useNavigation } from '../navigation/NavigationContext';
import { useSpaces } from '../state/session';
import { colors, fonts, radii, shadows, spacing, typography } from '../theme';

type Stage =
  | { kind: 'idle' }
  | { kind: 'storing' }
  | { kind: 'extracting'; spaceId: string }
  | { kind: 'error'; message: string; recoverableSpaceId?: string };

const MIN_CONTENT_CHARS = 40;

function inferTitle(content: string, fallback: string): string {
  const trimmed = content.trim();
  const match = trimmed.match(/^#\s+(.+)$/m);
  if (match && match[1]) return match[1].trim();
  return fallback;
}

export function NotesImportScreen() {
  const insets = useSafeAreaInsets();
  const { navigate, goBack } = useNavigation();
  const { spaces, createSpace, extractTerms, setActiveSpaceId } = useSpaces();

  const [title, setTitle] = useState('');
  const [rawMode, setRawMode] = useState(false);
  const [rawText, setRawText] = useState('');
  const [pickedFile, setPickedFile] = useState<{ name: string; size: number; ext: string } | null>(null);
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });

  const content = rawText;
  const contentLong = content.trim().length >= MIN_CONTENT_CHARS;
  const isBusy = stage.kind === 'storing' || stage.kind === 'extracting';
  const canSubmit = contentLong && !isBusy;

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/plain', 'text/markdown', 'text/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const res = await fetch(asset.uri);
      const text = await res.text();
      const ext = (asset.name?.split('.').pop() ?? '').toLowerCase();
      setPickedFile({ name: asset.name ?? 'note.txt', size: asset.size ?? text.length, ext });
      setRawText(text);
      if (!title.trim()) setTitle(inferTitle(text, asset.name?.replace(/\.[^.]+$/, '') ?? ''));
    } catch (err) {
      setStage({ kind: 'error', message: `Couldn't read file: ${(err as Error).message}` });
    }
  };

  const removePicked = () => {
    setPickedFile(null);
    setRawText('');
  };

  const loadDemo = (demoId: string) => {
    const demo = DEMO_NOTES.find((d) => d.id === demoId);
    if (!demo) return;
    // Dedupe — if a space already exists with this title, open it instead of
    // creating a duplicate (matches the "demo set = one-tap" SCREENS.md MVP).
    const existing = spaces.find((s) => s.title === demo.title);
    if (existing) {
      setActiveSpaceId(existing.id);
      navigate({ name: 'space', spaceId: existing.id });
      return;
    }
    setTitle(demo.title);
    setRawText(demo.content);
    setRawMode(true);
    setPickedFile(null);
  };

  const runChain = async () => {
    const effectiveTitle =
      title.trim() ||
      pickedFile?.name.replace(/\.[^.]+$/, '') ||
      inferTitle(content, 'Untitled space');

    setStage({ kind: 'storing' });
    let spaceId: string;
    try {
      const space = await createSpace({ title: effectiveTitle, content });
      spaceId = space.id;
    } catch (err) {
      setStage({
        kind: 'error',
        message: `Couldn't create the space — ${(err as Error).message}`,
      });
      return;
    }

    setStage({ kind: 'extracting', spaceId });
    try {
      await extractTerms(spaceId);
      navigate({ name: 'space', spaceId });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          // Already extracted — navigate straight in.
          navigate({ name: 'space', spaceId });
          return;
        }
        if (err.status === 422) {
          setStage({
            kind: 'error',
            message:
              "Couldn't find enough to extract from these notes — try a richer source.",
            recoverableSpaceId: spaceId,
          });
          return;
        }
      }
      setStage({
        kind: 'error',
        message: `Extraction failed — ${(err as Error).message}`,
        recoverableSpaceId: spaceId,
      });
    }
  };

  const skipExtractionAndOpen = () => {
    if (stage.kind === 'error' && stage.recoverableSpaceId) {
      navigate({ name: 'space', spaceId: stage.recoverableSpaceId });
    }
  };

  return (
    <ScreenShell dither={{ intensity: 'low', gradient: 'radial' }}>
      <TopBar title="New space" onBack={goBack} />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 120 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.h2}>What are we learning?</Text>
        <Text style={styles.sub}>
          Drop the source. Puzzles come from your words — we won't invent anything.
        </Text>

        {!rawMode ? (
          <>
            <Pressable onPress={pickFile} style={styles.dropZone} accessibilityRole="button">
              <View style={styles.dropIconBubble}>
                <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
                  <Path
                    d="M11 3v11m0 0l-4-4m4 4l4-4M4 17h14"
                    stroke={colors.accent}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
              </View>
              <Text style={styles.dropTitle}>Drop your notes here</Text>
              <Text style={styles.dropHint}>or tap to browse</Text>
              <Text style={styles.dropFormats}>pdf · docx · md · txt</Text>
            </Pressable>

            {pickedFile && (
              <View style={styles.fileChip}>
                <View style={styles.fileExt}>
                  <Text style={styles.fileExtLabel}>
                    {pickedFile.ext.slice(0, 4).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.fileBody}>
                  <Text style={styles.fileName} numberOfLines={1}>
                    {pickedFile.name}
                  </Text>
                  <Text style={styles.fileSize}>
                    {Math.max(1, Math.round(pickedFile.size / 1024))} KB
                  </Text>
                </View>
                <Pressable onPress={removePicked} style={styles.fileRemove} hitSlop={8}>
                  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
                    <Path
                      d="M4 4l8 8M12 4l-8 8"
                      stroke={colors.subtle}
                      strokeWidth={1.8}
                      strokeLinecap="round"
                    />
                  </Svg>
                </Pressable>
              </View>
            )}

            <View style={styles.altCenter}>
              <GhostLink label="Input raw text instead →" onPress={() => setRawMode(true)} />
            </View>
          </>
        ) : (
          <>
            <TextInput
              value={rawText}
              onChangeText={setRawText}
              placeholder="Paste your notes here…"
              placeholderTextColor={colors.muted}
              multiline
              textAlignVertical="top"
              style={styles.textarea}
            />
            <View style={styles.altCenter}>
              <GhostLink label="← Back to file upload" onPress={() => setRawMode(false)} />
            </View>
          </>
        )}

        <View style={styles.titleRow}>
          <Text style={styles.titleLabel}>Title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Auto from first heading"
            placeholderTextColor={colors.muted}
            style={styles.titleInput}
          />
        </View>

        <View style={styles.demoBlock}>
          <Text style={styles.demoLabel}>Demo sets</Text>
          <Text style={styles.demoHint}>One tap creates the space and opens it.</Text>
          <View style={styles.demoRow}>
            {DEMO_NOTES.map((demo) => (
              <Pressable
                key={demo.id}
                onPress={() => loadDemo(demo.id)}
                style={styles.demoChip}
              >
                <Text style={styles.demoChipLabel}>{demo.title}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {stage.kind === 'error' && (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Something went wrong</Text>
            <Text style={styles.errorBody}>{stage.message}</Text>
            {stage.recoverableSpaceId && (
              <Pressable onPress={skipExtractionAndOpen} style={styles.errorOpen}>
                <Text style={styles.errorOpenLabel}>Open space anyway</Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: spacing.lg + insets.bottom },
        ]}
      >
        {isBusy && (
          <View style={styles.progressRow}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.progressLabel}>
              {stage.kind === 'storing'
                ? 'Storing notes…'
                : 'Extracting terms… (this can take ~30s)'}
            </Text>
          </View>
        )}
        {!isBusy && !contentLong && content.length > 0 && (
          <Text style={styles.progressLabel}>
            Notes look short — paste at least {MIN_CONTENT_CHARS} characters.
          </Text>
        )}
        <PrimaryButton
          full
          label="Create space"
          onPress={runChain}
          disabled={!canSubmit}
          loading={isBusy}
        />
      </View>

      {/* Soft white-to-transparent guard above the footer */}
      <View style={styles.footerGuard} pointerEvents="none" />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    gap: spacing.md,
  },
  h2: {
    color: colors.text,
    fontFamily: fonts.display.semibold,
    fontWeight: '600',
    fontSize: typography.display,
    lineHeight: 34,
    letterSpacing: -0.8,
  },
  sub: {
    color: colors.muted,
    fontFamily: fonts.ui.regular,
    fontSize: typography.bodySm,
    lineHeight: 21,
  },
  dropZone: {
    borderWidth: 1.5,
    borderColor: palette.ink25,
    borderStyle: 'dashed',
    borderRadius: radii.lg,
    paddingVertical: 36,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    backgroundColor: colors.surface,
    gap: 10,
  },
  dropIconBubble: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(0,104,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropTitle: {
    color: colors.text,
    fontFamily: fonts.ui.semibold,
    fontWeight: '600',
    fontSize: 15.5,
  },
  dropHint: {
    color: colors.muted,
    fontFamily: fonts.ui.regular,
    fontSize: 13,
  },
  dropFormats: {
    color: colors.subtle,
    fontFamily: fonts.ui.bold,
    fontWeight: '700',
    fontSize: 11.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  fileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fileExt: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(0,104,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileExtLabel: {
    color: colors.accent,
    fontFamily: fonts.ui.bold,
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  fileBody: {
    flex: 1,
    minWidth: 0,
  },
  fileName: {
    color: colors.text,
    fontFamily: fonts.ui.medium,
    fontSize: 14,
  },
  fileSize: {
    color: colors.muted,
    fontFamily: fonts.ui.regular,
    fontSize: typography.caption,
  },
  fileRemove: {
    padding: 6,
  },
  altCenter: {
    alignItems: 'center',
  },
  textarea: {
    minHeight: 220,
    padding: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    color: colors.text,
    fontFamily: fonts.ui.regular,
    fontSize: typography.bodySm,
    lineHeight: 22,
  },
  titleRow: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 6,
  },
  titleLabel: {
    color: colors.subtle,
    fontFamily: fonts.ui.bold,
    fontWeight: '700',
    fontSize: 10.5,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  titleInput: {
    color: colors.text,
    fontFamily: fonts.ui.medium,
    fontSize: typography.body,
    paddingVertical: 4,
  },
  demoBlock: {
    gap: spacing.sm,
  },
  demoLabel: {
    color: colors.subtle,
    fontFamily: fonts.ui.bold,
    fontWeight: '700',
    fontSize: 10.5,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  demoHint: {
    color: colors.muted,
    fontFamily: fonts.ui.regular,
    fontSize: typography.caption,
  },
  demoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  demoChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  demoChipLabel: {
    color: colors.text,
    fontFamily: fonts.ui.semibold,
    fontWeight: '600',
    fontSize: typography.bodySm,
  },
  errorCard: {
    backgroundColor: 'rgba(177,8,4,0.06)',
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  errorTitle: {
    color: colors.text,
    fontFamily: fonts.ui.bold,
    fontWeight: '700',
    fontSize: typography.bodySm,
  },
  errorBody: {
    color: colors.muted,
    fontFamily: fonts.ui.regular,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  errorOpen: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  errorOpenLabel: {
    color: colors.text,
    fontFamily: fonts.ui.semibold,
    fontWeight: '600',
    fontSize: typography.caption,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.surface,
    gap: spacing.sm,
    ...shadows.card,
  },
  footerGuard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 90,
    pointerEvents: 'none',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  progressLabel: {
    color: colors.muted,
    fontFamily: fonts.ui.medium,
    fontSize: typography.caption,
  },
});
