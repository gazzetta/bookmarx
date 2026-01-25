import { useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useBookmarks } from '../../hooks/useBookmarks';

export default function FolderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { folders, bookmarks, isLoading, fetchMasterCollection, getFoldersInFolder, getBookmarksInFolder } = useBookmarks();

  useEffect(() => {
    if (folders.length === 0) {
      fetchMasterCollection();
    }
  }, []);

  const currentFolder = folders.find(f => f.masterId === id);
  const childFolders = getFoldersInFolder(id);
  const childBookmarks = getBookmarksInFolder(id);

  const renderFolder = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.item}
      onPress={() => router.push(`/folder/${item.masterId}`)}
    >
      <Ionicons name="folder" size={24} color="#F59E0B" />
      <Text style={styles.itemText}>{item.title}</Text>
      <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
    </TouchableOpacity>
  );

  const renderBookmark = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.item}
      onPress={() => {/* Open URL */}}
    >
      <Ionicons name="bookmark" size={24} color="#3B82F6" />
      <View style={styles.bookmarkInfo}>
        <Text style={styles.itemText} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.urlText} numberOfLines={1}>{item.url}</Text>
      </View>
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: currentFolder?.title || 'Folder' }} />
      <View style={styles.container}>
        <FlatList
          data={[...childFolders, ...childBookmarks]}
          keyExtractor={(item) => item.masterId}
          renderItem={({ item }) => 
            'url' in item ? renderBookmark({ item }) : renderFolder({ item })
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>This folder is empty</Text>
            </View>
          }
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    gap: 12,
  },
  itemText: {
    flex: 1,
    fontSize: 16,
    color: '#1F2937',
  },
  bookmarkInfo: {
    flex: 1,
  },
  urlText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  empty: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
  },
});
