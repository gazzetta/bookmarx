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

export default function AddFolderScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ parentId?: string }>();
  const { folders, createFolder, getFolderById } = useBookmarkStore();

  const [title, setTitle] = useState('');
  const [parentId, setParentId] = useState<string | null>(params.parentId ?? null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const parentName = parentId ? getFolderById(parentId)?.title ?? 'Selected folder' : 'Top level';

  const handleSave = async () => {
    setError('');
    if (!title.trim()) {
      setError('Folder name is required');
      return;
    }
    setIsSaving(true);
    const result = await createFolder(title.trim(), parentId);
    setIsSaving(false);
    if (result.success) {
      router.back();
    } else {
      setError(result.error || 'Could not create folder');
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
            label="Folder name"
            placeholder="e.g. Reading list"
            value={title}
            onChangeText={setTitle}
            autoCapitalize="sentences"
            autoFocus
          />
          <SelectField
            label="Inside"
            value={parentName}
            onPress={() => setPickerVisible(true)}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton label="Create folder" onPress={handleSave} loading={isSaving} icon="folder" />
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
