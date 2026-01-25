import { useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { useBookmarks } from '../hooks/useBookmarks';

export default function HomeScreen() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading, user, logout } = useAuth();
  const { folders, bookmarks, isLoading, fetchMasterCollection, getFoldersInFolder, getBookmarksInFolder } = useBookmarks();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchMasterCollection();
    }
  }, [isAuthenticated]);

  if (authLoading || !isAuthenticated) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  const rootFolders = getFoldersInFolder(null);
  const rootBookmarks = getBookmarksInFolder(null);

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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.welcome}>Welcome, {user?.displayName || user?.email}</Text>
        <TouchableOpacity onPress={logout}>
          <Ionicons name="log-out-outline" size={24} color="#EF4444" />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color="#3B82F6" style={styles.loader} />
      ) : (
        <FlatList
          data={[...rootFolders, ...rootBookmarks]}
          keyExtractor={(item) => item.masterId}
          renderItem={({ item }) => 
            'url' in item ? renderBookmark({ item }) : renderFolder({ item })
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No bookmarks yet</Text>
              <Text style={styles.emptySubtext}>Sync from your browser extension to see bookmarks here</Text>
            </View>
          }
        />
      )}
    </View>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  welcome: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  loader: {
    marginTop: 40,
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
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7280',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 8,
    textAlign: 'center',
  },
});
