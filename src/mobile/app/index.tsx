import { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, RefreshControl, Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/authStore';
import { useBookmarkStore } from '../store/bookmarkStore';
import { PremiumBadge, UsageLimitBar } from '../components/PremiumGate';
import { FolderRow, BookmarkRow, isBookmark } from '../components/ListItem';
import { OfflineBanner } from '../components/OfflineBanner';
import { EmptyState, IconButton, LogoMark, Reveal } from '../components/ui';
import { Atmosphere } from '../components/Atmosphere';
import { colors, fonts, radius, shadow, spacing, type as ty } from '../constants/theme';
import type { Bookmark, Folder } from '../types';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading: authLoading, user, stats } = useAuthStore();
  const {
    folders, bookmarks, collections, activeCollectionId,
    isLoading, error, hydrated, lastFetched,
    fetchMasterCollection, fetchCollections, setActiveCollection,
    getFoldersInFolder, getBookmarksInFolder, getActiveCollection,
    deleteBookmark, deleteFolder, isPending,
  } = useBookmarkStore();

  const [collectionPickerVisible, setCollectionPickerVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && hydrated) {
      void fetchCollections();
      void fetchMasterCollection();
    }
  }, [isAuthenticated, hydrated]);

  if (authLoading || !isAuthenticated) {
    return (
      <View style={styles.centered}>
        <Atmosphere />
        <ActivityIndicator size="large" color={colors.terra} />
      </View>
    );
  }

  const activeCollection = getActiveCollection();
  const items = [...getFoldersInFolder(null), ...getBookmarksInFolder(null)];

  const openBookmark = (bookmark: Bookmark) => {
    void WebBrowser.openBrowserAsync(bookmark.url);
  };

  const confirmDeleteBookmark = (bookmark: Bookmark) => {
    Alert.alert('Delete bookmark?', bookmark.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deleteBookmark(bookmark.masterId) },
    ]);
  };

  const confirmDeleteFolder = (folder: Folder) => {
    Alert.alert(
      'Delete folder?',
      `"${folder.title}" and everything inside it will be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void deleteFolder(folder.masterId) },
      ]
    );
  };

  const bookmarkActions = (bookmark: Bookmark) => {
    if (isPending(bookmark.masterId)) return;
    Alert.alert(bookmark.title, undefined, [
      { text: 'Open', onPress: () => openBookmark(bookmark) },
      { text: 'Edit', onPress: () => router.push(`/edit-bookmark/${bookmark.masterId}`) },
      { text: 'Delete', style: 'destructive', onPress: () => confirmDeleteBookmark(bookmark) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const folderActions = (folder: Folder) => {
    if (isPending(folder.masterId)) return;
    Alert.alert(folder.title, undefined, [
      { text: 'Open', onPress: () => router.push(`/folder/${folder.masterId}`) },
      { text: 'Edit', onPress: () => router.push(`/edit-folder/${folder.masterId}`) },
      { text: 'Delete', style: 'destructive', onPress: () => confirmDeleteFolder(folder) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const addActions = () => {
    Alert.alert('Add to BookMarx', undefined, [
      { text: 'Add Bookmark', onPress: () => router.push('/add-bookmark') },
      { text: 'New Folder', onPress: () => router.push('/add-folder') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchMasterCollection(true), fetchCollections()]);
    setRefreshing(false);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Atmosphere subtle />
      <Reveal style={styles.header} delay={0}>
        <View style={styles.headerLeft}>
          <LogoMark size={32} />
          <TouchableOpacity style={styles.collectionButton} onPress={() => setCollectionPickerVisible(true)}>
            <Text style={styles.collectionName} numberOfLines={1}>
              {activeCollection?.name ?? 'Bookmarks'}
            </Text>
            <Ionicons name="chevron-down" size={15} color={colors.inkMuted} />
          </TouchableOpacity>
          <PremiumBadge tier={(user?.subscriptionTier || 'free') as 'free' | 'premium' | 'lifetime'} size="small" />
        </View>
        <View style={styles.headerRight}>
          <IconButton name="search-outline" onPress={() => router.push('/search')} />
          <IconButton name="settings-outline" onPress={() => router.push('/settings')} />
        </View>
      </Reveal>

      <OfflineBanner />

      {stats && (
        <View style={styles.usageSection}>
          <UsageLimitBar
            current={stats.bookmarkCount}
            max={stats.limits.maxBookmarks}
            label="Bookmarks"
          />
        </View>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {isLoading && !lastFetched ? (
        <ActivityIndicator size="large" color={colors.terra} style={styles.loader} />
      ) : (
        <Reveal delay={110} style={styles.listWrap}>
          <View style={styles.listCard}>
          <FlatList
            data={items}
            keyExtractor={(item) => item.masterId}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.terra} />
            }
            renderItem={({ item, index }) =>
              isBookmark(item) ? (
                <BookmarkRow
                  bookmark={item}
                  pending={isPending(item.masterId)}
                  isLast={index === items.length - 1}
                  onPress={() => openBookmark(item)}
                  onLongPress={() => bookmarkActions(item)}
                />
              ) : (
                <FolderRow
                  folder={item}
                  pending={isPending(item.masterId)}
                  isLast={index === items.length - 1}
                  onPress={() => router.push(`/folder/${item.masterId}`)}
                  onLongPress={() => folderActions(item)}
                />
              )
            }
            ListEmptyComponent={
              <EmptyState
                icon="bookmark-outline"
                title="Nothing here yet"
                hint="Tap + to add your first bookmark — it syncs to your BookMarx account."
              />
            }
          />
          </View>
        </Reveal>
      )}

      <TouchableOpacity style={styles.fab} onPress={addActions} activeOpacity={0.85}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <CollectionPickerModal
        visible={collectionPickerVisible}
        collections={collections}
        activeCollectionId={activeCollectionId}
        onSelect={(id) => {
          setCollectionPickerVisible(false);
          void setActiveCollection(id);
        }}
        onManage={() => {
          setCollectionPickerVisible(false);
          router.push('/collections');
        }}
        onClose={() => setCollectionPickerVisible(false)}
      />
    </View>
  );
}

interface CollectionPickerModalProps {
  visible: boolean;
  collections: { id: string; name: string; isDefault: boolean }[];
  activeCollectionId: string | null;
  onSelect: (id: string | null) => void;
  onManage: () => void;
  onClose: () => void;
}

function CollectionPickerModal({ visible, collections, activeCollectionId, onSelect, onManage, onClose }: CollectionPickerModalProps) {
  const defaultCollection = collections.find(c => c.isDefault);
  const others = collections.filter(c => !c.isDefault);

  const renderRow = (id: string | null, name: string, isActive: boolean) => (
    <TouchableOpacity key={id ?? 'default'} style={[styles.collectionRow, isActive && styles.collectionRowActive]} onPress={() => onSelect(id)}>
      <View style={[styles.collectionIcon, id ? styles.collectionIconAlbum : styles.collectionIconMain]}>
        <Ionicons name={id ? 'albums' : 'bookmark'} size={14} color={id ? colors.sage : colors.terra} />
      </View>
      <Text style={[styles.collectionRowText, isActive && styles.collectionRowTextActive]} numberOfLines={1}>
        {name}
      </Text>
      {isActive && <Ionicons name="checkmark" size={18} color={colors.terra} />}
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.pickerBackdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.pickerSheet}>
          <View style={styles.grabber} />
          <Text style={styles.pickerEyebrow}>COLLECTION</Text>
          <Text style={styles.pickerTitle}>Where to look</Text>
          <View style={styles.pickerList}>
            {defaultCollection && renderRow(null, defaultCollection.name, activeCollectionId === null)}
            {!defaultCollection && renderRow(null, 'Bookmarks', activeCollectionId === null)}
            {others.map(c => renderRow(c.id, c.name, activeCollectionId === c.id))}
          </View>
          <TouchableOpacity style={styles.manageRow} onPress={onManage}>
            <Ionicons name="settings-outline" size={16} color={colors.terra} />
            <Text style={styles.manageRowText}>Manage collections</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.cream,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  collectionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '62%',
  },
  collectionName: {
    ...ty.heading,
  },
  usageSection: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  errorText: {
    ...ty.captionMedium,
    color: colors.danger,
    textAlign: 'center',
    padding: spacing.sm,
  },
  loader: {
    marginTop: 48,
  },
  listWrap: {
    flex: 1,
  },
  listCard: {
    flex: 1,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: 'hidden',
    ...shadow.card,
  },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    bottom: spacing.xxl + 8,
    width: 58,
    height: 58,
    borderRadius: radius.pill,
    backgroundColor: colors.terra,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadow.glow,
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(26,26,26,0.45)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: spacing.xxl,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginTop: spacing.md,
  },
  pickerEyebrow: {
    ...ty.eyebrow,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  pickerTitle: {
    ...ty.heading,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: spacing.md,
  },
  pickerList: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: 'hidden',
  },
  collectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  collectionRowActive: {
    backgroundColor: colors.terraWash,
  },
  collectionIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collectionIconAlbum: {
    backgroundColor: colors.sageTint,
  },
  collectionIconMain: {
    backgroundColor: colors.terraWash,
    borderWidth: 1,
    borderColor: colors.terraTint,
  },
  collectionRowText: {
    flex: 1,
    ...ty.bodyMedium,
  },
  collectionRowTextActive: {
    color: colors.terraDark,
    fontFamily: fonts.semibold,
  },
  manageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    marginTop: spacing.xs,
  },
  manageRowText: {
    ...ty.smallMedium,
    color: colors.terra,
    fontFamily: fonts.semibold,
  },
});
