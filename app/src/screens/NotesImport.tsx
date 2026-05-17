import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { ingestNotes } from '../api/notes';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { DEMO_NOTES } from '../mocks/demoNotes';
import { useNavigation } from '../navigation/NavigationContext';
import { useSession } from '../state/session';
import { colors, sharedStyles, spacing, typography } from '../theme';

export function NotesImportScreen() {
  const { navigate, goBack } = useNavigation();
  const { addNotes } = useSession();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);

  const canContinue = content.trim().length > 0;

  const finishImport = async (nextTitle: string, nextContent: string) => {
    setBusy(true);
    try {
      const notes = addNotes({ title: nextTitle, content: nextContent });
      await ingestNotes({ title: notes.title, content: notes.content });
      navigate({ name: 'picker' });
    } finally {
      setBusy(false);
    }
  };

  const loadDemo = (demoId: string) => {
    const demo = DEMO_NOTES.find((d) => d.id === demoId);
    if (!demo) return;
    setTitle(demo.title);
    setContent(demo.content);
  };

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/plain', 'text/markdown', 'text/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      const uri = asset.uri;
      const res = await fetch(uri);
      const text = await res.text();
      if (!title.trim() && asset.name) setTitle(asset.name.replace(/\.[^.]+$/, ''));
      setContent(text);
    } catch (e) {
      Alert.alert('Could not read file', (e as Error).message);
    }
  };

  return (
    <Screen
      title="Import notes"
      subtitle="Your notes are the source of truth — paste or upload raw text."
      onBack={goBack}
      footer={
        <PrimaryButton
          label="Continue to puzzles"
          onPress={() => finishImport(title, content)}
          disabled={!canContinue}
          loading={busy}
        />
      }
    >
      <View style={sharedStyles.card}>
        <Text style={sharedStyles.label}>Title (optional)</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Cardio Clinical"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
      </View>

      <View style={sharedStyles.card}>
        <Text style={sharedStyles.label}>Notes</Text>
        <TextInput
          value={content}
          onChangeText={setContent}
          placeholder="Paste lecture notes here…"
          placeholderTextColor={colors.muted}
          multiline
          textAlignVertical="top"
          style={[styles.input, styles.textarea]}
        />
        <PrimaryButton label="Choose file (.txt / .md)" onPress={pickFile} variant="secondary" />
      </View>

      <View style={sharedStyles.card}>
        <Text style={sharedStyles.label}>Demo sets</Text>
        <Text style={styles.demoHint}>Swap register to preview the hackathon demo arc.</Text>
        <View style={styles.demoRow}>
          {DEMO_NOTES.map((demo) => (
            <PrimaryButton
              key={demo.id}
              label={demo.title}
              onPress={() => loadDemo(demo.id)}
              variant="secondary"
            />
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: typography.body,
    padding: spacing.md,
  },
  textarea: {
    minHeight: 160,
    marginBottom: spacing.md,
  },
  demoHint: {
    color: colors.muted,
    fontSize: typography.caption,
    marginBottom: spacing.sm,
  },
  demoRow: {
    gap: spacing.sm,
  },
});
