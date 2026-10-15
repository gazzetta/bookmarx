import { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShareIntentContext } from 'expo-share-intent';
import { useBookmarkStore } from '../store/bookmarkStore';
import { useAuthStore } from '../store/authStore';
import { destinationFor } from '../services/access';
import { FolderPicker } from '../components/FolderPicker';
import { Atmosphere } from '../components/Atmosphere';
import { Card, Field, PrimaryButton, Reveal, SelectField } from '../components/ui';
import { colors, radius, spacing, type as ty } from '../constants/theme';

const URL_RE = /https?:\/\/[^\s<>"']+/i;

export default function ShareScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { shareIntent, resetShareIntent } = useShareIntentContext();
  const { isAuthenticated, access } = useAuthStore();
  const { folders, addBookmark, getFolderById, getActiveCollection } = useBookmarkStore();

  const sharedUrl = useMemo(() => {
    if (shareIntent.webUrl) return shareIntent.webUrl;
    const match = shareIntent.text?.match(URL_RE);
    return match ? match[0] : '';
  }, [shareIntent]);

  const [url, setUrl] = useState(sharedUrl);
  const [title, setTitle] = useState(shareIntent.meta?.title ?? '');
  const [parentId, setParentId] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const parentName = parentId ? getFolderById(parentId)?.title ?? 'Selected folder' : 'Top level';
  const activeCollection = getActiveCollection();

  const finish = () => {
    resetShareIntent();
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const handleSave = async () => {
    setError('');
    if (!url.trim()) {
      setError('No URL found in the shared content');
      return;
    }
    setIsSaving(true);
    const result = await addBookmark(url.trim(), title.trim() || undefined, parentId);
    setIsSaving(false);
    if (result.success) {
      finish();
    } else {
      setError(result.error || 'Could not save bookmark');
    }
  };

  // Saving a shared link still requires auth + verification + membership.
  // The pending share intent is left untouched so it survives the detour.
  if (!isAuthenticated) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Atmosphere />
        <Reveal style={styles.centeredContent}>
          <View style={styles.lockIcon}>
            <Ionicons name="lock-closed-outline" size={28} color={colors.terra} />
          </View>
          <Text style={styles.centeredTitle}>Sign in to save</Text>
          <Text style={styles.centeredText}>Shared links can only be saved to your BookMarx library when you're signed in.</Text>
          <PrimaryButton label="Go to sign in" onPress={() => router.replace('/login')} style={styles.lockButton} />
        </Reveal>
      </View>
    );
  }

  if (access !== 'allowed') {
    const verify = access === 'verify-email';
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Atmosphere />
        <Reveal style={styles.centeredContent}>
          <View style={styles.lockIcon}>
            <Ionicons name={verify ? 'mail-unread-outline' : 'bookmark-outline'} size={28} color={colors.terra} />
          </View>
          <Text style={styles.centeredTitle}>{verify ? 'Verify your email to save' : 'Membership required'}</Text>
          <Text style={styles.centeredText}>
            {verify
              ? 'Confirm your email address before saving shared links.'
              : 'Saving to this app requires a BookMarx Premium membership.'}
          </Text>
          <PrimaryButton
            label={verify ? 'Go to verification' : 'Check membership'}
            onPress={() => router.replace(destinationFor(access) ?? '/')}
            style={styles.lockButton}
          />
        </Reveal>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Atmosphere />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <View style={styles.header}>
        <TouchableOpacity onPress={finish} hitSlop={8} style={styles.closeBtn}>
          <Ionicons name="close" size={18} color={colors.inkSoft} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Save to <Text style={styles.headerAccent}>BookMarx</Text></Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Reveal>
          <Card style={styles.card}>
          <Field
            label="URL"
            value={url}
            onChangeText={setUrl}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="https://example.com"
          />
          <Field
            label="Title"
            value={title}
            onChangeText={setTitle}
            autoCapitalize="sentences"
            placeholder="Defaults to the URL"
          />
          <SelectField
            label="Folder"
            value={parentName}
            onPress={() => setPickerVisible(true)}
          />

          <Text style={styles.collectionHint}>
            Saving to {activeCollection?.name ?? 'your default collection'}
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton
            label="Save bookmark"
            icon="bookmark"
            onPress={handleSave}
            loading={isSaving}
            disabled={!url.trim()}
          />
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxl,
    backgroundColor: colors.cream,
  },
  centeredContent: {
    alignItems: 'center',
  },
  lockIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.terraWash,
    borderWidth: 1,
    borderColor: colors.terraTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  centeredTitle: {
    ...ty.heading,
    marginBottom: spacing.xs,
  },
  centeredText: {
    ...ty.small,
    color: colors.inkMuted,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  lockButton: {
    paddingHorizontal: spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: {
    ...ty.heading,
  },
  headerAccent: {
    fontFamily: ty.accent.fontFamily,
    color: colors.terra,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.creamDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: spacing.lg,
  },
  card: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
  collectionHint: {
    ...ty.caption,
    marginTop: -spacing.sm,
  },
  error: {
    ...ty.smallMedium,
    color: colors.danger,
  },
});
