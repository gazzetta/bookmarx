import { useState } from 'react';
import {
  View, Text, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert, TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useBookmarkStore } from '../../store/bookmarkStore';
import { FolderPicker } from '../../components/FolderPicker';
import { Atmosphere } from '../../components/Atmosphere';
import { Card, DangerButton, Field, PrimaryButton, Reveal, SelectField } from '../../components/ui';
import { colors, spacing, type as ty } from '../../constants/theme';

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

export default function EditBookmarkScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { folders, getBookmarkById, getFolderById, updateBookmark, deleteBookmark } = useBookmarkStore();

  const bookmark = id ? getBookmarkById(id) : undefined;

  const [url, setUrl] = useState(bookmark?.url ?? '');
  const [title, setTitle] = useState(bookmark?.title ?? '');
  const [parentId, setParentId] = useState<string | null>(bookmark?.masterParentId ?? null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  if (!bookmark) {
    return (
      <View style={styles.centered}>
        <Text style={styles.missingText}>Bookmark not found — it may have been deleted.</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.missingLink}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const parentName = parentId ? getFolderById(parentId)?.title ?? 'Selected folder' : 'Top level';

  const handleSave = async () => {
    setError('');
    const normalized = normalizeUrl(url);
    if (!normalized) {
      setError('Enter a valid web address');
      return;
    }
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    setIsSaving(true);
    const result = await updateBookmark(bookmark.masterId, {
      title: title.trim(),
      url: normalized,
      masterParentId: parentId,
    });
    setIsSaving(false);
    if (result.success) {
      router.back();
    } else {
      setError(result.error || 'Could not save changes');
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete bookmark?', bookmark.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteBookmark(bookmark.masterId);
          router.back();
        },
      },
    ]);
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
            label="Title"
            value={title}
            onChangeText={setTitle}
            autoCapitalize="sentences"
          />
          <Field
            label="URL"
            value={url}
            onChangeText={setUrl}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <SelectField
            label="Folder"
            value={parentName}
            onPress={() => setPickerVisible(true)}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton label="Save changes" onPress={handleSave} loading={isSaving} />
          </Card>
        </Reveal>

        <Reveal delay={110}>
          <DangerButton label="Delete bookmark" icon="trash-outline" onPress={handleDelete} style={styles.delete} />
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    backgroundColor: colors.cream,
  },
  missingText: {
    ...ty.body,
    color: colors.inkMuted,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  missingLink: {
    ...ty.bodyMedium,
    color: colors.terra,
  },
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
  delete: {
    marginTop: spacing.lg,
  },
});
