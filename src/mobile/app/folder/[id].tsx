import { useEffect } from 'react';
import {
  View, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useBookmarkStore } from '../../store/bookmarkStore';
import { FolderRow, BookmarkRow, isBookmark } from '../../components/ListItem';
import { OfflineBanner } from '../../components/OfflineBanner';
import { EmptyState } from '../../components/ui';
import { colors, radius, shadow, spacing } from '../../constants/theme';
import type { Bookmark, Folder } from '../../types';

export default function FolderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const {
    folders, bookmarks, isLoading, lastFetched,
    fetchMasterCollection, getFoldersInFolder, getBookmarksInFolder, getFolderById,
    deleteBookmark, deleteFolder, isPending,
  } = useBookmarkStore();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!lastFetched && !isLoading) {
      void fetchMasterCollection();
    }
  }, []);

  const currentFolder = id ? getFolderById(id) : undefined;
  const items = id ? [...getFoldersInFolder(id), ...getBookmarksInFolder(id)] : [];

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
    Alert.alert('Delete folder?', `"${folder.title}" and everything inside it will be deleted.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: () => {
          const wasCurrent = folder.masterId === id;
          void deleteFolder(folder.masterId);
          if (wasCurrent) router.back();
        }
      },
    ]);
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
    Alert.alert('Add to this folder', undefined, [
      { text: 'Add Bookmark', onPress: () => router.push({ pathname: '/add-bookmark', params: { parentId: id } }) },
      { text: 'New Subfolder', onPress: () => router.push({ pathname: '/add-folder', params: { parentId: id } }) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchMasterCollection(true);
    setRefreshing(false);
  };

  if (isLoading && !lastFetched) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.terra} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: currentFolder?.title || 'Folder' }} />
      <View style={styles.container}>
        <OfflineBanner />
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
                icon="folder-open-outline"
                title="This folder is empty"
                hint="Tap + to add a bookmark or subfolder."
              />
            }
          />
        </View>
        <TouchableOpacity style={styles.fab} onPress={addActions} activeOpacity={0.85}>
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      </View>
    </>
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
    ...shadow.fab,
  },
});
