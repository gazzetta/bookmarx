import { useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { useBookmarks } from '../hooks/useBookmarks';
import { PremiumBadge, UsageLimitBar } from '../components/PremiumGate';

export default function HomeScreen() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading, user, isPremium, stats, logout } = useAuth();
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
        <View style={styles.headerLeft}>
          <Text style={styles.welcome}>Welcome, {user?.displayName || user?.email?.split('@')[0]}</Text>
          <PremiumBadge tier={(user?.subscriptionTier || 'free') as 'free' | 'premium' | 'lifetime'} size="small" />
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={() => router.push('/sessions')} style={styles.headerButton}>
            <Ionicons name="time-outline" size={22} color="#3B82F6" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/upgrade')} style={styles.headerButton}>
            <Ionicons name={isPremium ? "settings-outline" : "star-outline"} size={22} color="#F59E0B" />
          </TouchableOpacity>
          <TouchableOpacity onPress={logout} style={styles.headerButton}>
            <Ionicons name="log-out-outline" size={22} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>

      {stats && !isPremium && (
        <View style={styles.usageSection}>
          <UsageLimitBar 
            current={stats.bookmarkCount} 
            max={stats.limits.maxBookmarks} 
            label="Bookmarks" 
            isPremium={isPremium}
          />
        </View>
      )}

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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerButton: {
    padding: 6,
  },
  welcome: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  usageSection: {
    padding: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
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
