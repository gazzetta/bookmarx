import { useState } from 'react';
import {
  View, Text, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useBookmarkStore } from '../store/bookmarkStore';
import { FolderPicker } from '../components/FolderPicker';
import { Atmosphere } from '../components/Atmosphere';
import { Card, Field, PrimaryButton, Reveal, SelectField } from '../components/ui';
import { colors, spacing, type as ty } from '../constants/theme';

function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

export default function AddBookmarkScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ url?: string; title?: string; parentId?: string }>();
  const { folders, addBookmark, getFolderById } = useBookmarkStore();

  const [url, setUrl] = useState(params.url ?? '');
  const [title, setTitle] = useState(params.title ?? '');
  const [parentId, setParentId] = useState<string | null>(params.parentId ?? null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const parentName = parentId ? getFolderById(parentId)?.title ?? 'Selected folder' : 'Top level';

  const handleSave = async () => {
    setError('');
    const normalized = normalizeUrl(url);
    if (!normalized) {
      setError('Enter a valid web address (e.g. https://example.com)');
      return;
    }
    setIsSaving(true);
    const result = await addBookmark(normalized, title.trim() || undefined, parentId);
    setIsSaving(false);
    if (result.success) {
      router.back();
    } else {
      setError(result.error || 'Could not save bookmark');
    }
  };

  return (
    <View style={styles.container}>
      <Atmosphere />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Reveal>
          <Card style={styles.card}>
          <Field
            label="URL"
            placeholder="https://example.com"
            value={url}
            onChangeText={setUrl}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus={!params.url}
          />
          <Field
            label="Title"
            placeholder="Defaults to the URL"
            value={title}
            onChangeText={setTitle}
            autoCapitalize="sentences"
          />
          <SelectField
            label="Folder"
            value={parentName}
            onPress={() => setPickerVisible(true)}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton label="Save bookmark" onPress={handleSave} loading={isSaving} icon="bookmark" />
          </Card>
        </Reveal>
      </ScrollView>

      <FolderPicker
        visible={pickerVisible}
        folders={folders}
        selectedId={parentId}
        onSelect={setParentId}
        onClose={() => setPickerVisible(false)}
      />
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  flex: { flex: 1 },
  content: {
    padding: spacing.lg,
  },
  card: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
  error: {
    ...ty.smallMedium,
    color: colors.danger,
  },
});
