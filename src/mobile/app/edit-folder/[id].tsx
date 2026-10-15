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

export default function EditFolderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { folders, getFolderById, updateFolder, deleteFolder } = useBookmarkStore();

  const folder = id ? getFolderById(id) : undefined;

  const [title, setTitle] = useState(folder?.title ?? '');
  const [parentId, setParentId] = useState<string | null>(folder?.masterParentId ?? null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  if (!folder) {
    return (
      <View style={styles.centered}>
        <Text style={styles.missingText}>Folder not found — it may have been deleted.</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.missingLink}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Root folders provisioned by the server (rootKind) can't be renamed/moved.
  const isRootFolder = !!(folder as any).rootKind;
  const parentName = parentId ? getFolderById(parentId)?.title ?? 'Selected folder' : 'Top level';

  const handleSave = async () => {
    setError('');
    if (!title.trim()) {
      setError('Folder name is required');
      return;
    }
    setIsSaving(true);
    const result = await updateFolder(folder.masterId, {
      title: title.trim(),
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
    Alert.alert('Delete folder?', `"${folder.title}" and everything inside it will be deleted.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteFolder(folder.masterId);
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
            label="Folder name"
            value={title}
            onChangeText={setTitle}
            autoCapitalize="sentences"
            editable={!isRootFolder}
          />
          {isRootFolder ? (
            <Text style={styles.hint}>This is a built-in root folder and can't be renamed or moved.</Text>
          ) : null}

          {!isRootFolder && (
            <SelectField
              label="Inside"
              value={parentName}
              onPress={() => setPickerVisible(true)}
            />
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {!isRootFolder && (
            <PrimaryButton label="Save changes" onPress={handleSave} loading={isSaving} />
          )}
          </Card>
        </Reveal>

        {!isRootFolder && (
          <Reveal delay={110}>
            <DangerButton label="Delete folder" icon="trash-outline" onPress={handleDelete} style={styles.delete} />
          </Reveal>
        )}
      </ScrollView>

      <FolderPicker
        visible={pickerVisible}
        folders={folders}
        selectedId={parentId}
        excludeId={folder.masterId}
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
  hint: {
    ...ty.caption,
    marginTop: -spacing.sm,
  },
  delete: {
    marginTop: spacing.lg,
  },
});
