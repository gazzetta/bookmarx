import { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import { PremiumGate } from '../components/PremiumGate';
import type { Session } from '../types';

export default function SessionsScreen() {
  const router = useRouter();
  const { isPremium } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchSessions = useCallback(async () => {
    const response = await api.getSessions(50);
    if (response.success && response.data) {
      setSessions(response.data.sessions);
    }
    setIsLoading(false);
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    if (isPremium) {
      fetchSessions();
    } else {
      setIsLoading(false);
    }
  }, [isPremium, fetchSessions]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchSessions();
  };

  const getSessionIcon = (type: string) => {
    switch (type) {
      case 'INITIAL_IMPORT':
        return 'cloud-download';
      case 'MERGE_IMPORT':
        return 'git-merge';
      case 'SYNC':
        return 'sync';
      default:
        return 'time';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return '#10B981';
      case 'PARTIAL':
        return '#F59E0B';
      case 'FAILED':
        return '#EF4444';
      case 'ROLLED_BACK':
        return '#8B5CF6';
      default:
        return '#6B7280';
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderSession = ({ item }: { item: Session }) => (
    <TouchableOpacity
      style={styles.sessionCard}
      onPress={() => router.push(`/sessions/${item.id}`)}
    >
      <View style={[styles.iconContainer, { backgroundColor: `${getStatusColor(item.status)}20` }]}>
        <Ionicons 
          name={getSessionIcon(item.type)} 
          size={24} 
          color={getStatusColor(item.status)} 
        />
      </View>
      
      <View style={styles.sessionInfo}>
        <Text style={styles.sessionType}>
          {item.type.replace(/_/g, ' ')}
        </Text>
        <Text style={styles.sessionMeta}>
          {item.bookmarksProcessed} bookmarks, {item.foldersProcessed} folders
        </Text>
        <Text style={styles.sessionDate}>{formatDate(item.timestamp)}</Text>
      </View>
      
      <View style={styles.sessionStatus}>
        <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
        <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
          {item.status}
        </Text>
      </View>
      
      <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.title}>Sync History</Text>
      </View>

      <PremiumGate
        isPremium={isPremium}
        featureName="Sync History"
        customMessage="View your sync history and roll back changes with Premium. Never lose your bookmarks again!"
      >
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#3B82F6" />
          </View>
        ) : (
          <FlatList
            data={sessions}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderSession}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor="#3B82F6"
              />
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="time-outline" size={48} color="#D1D5DB" />
                <Text style={styles.emptyText}>No sync history yet</Text>
                <Text style={styles.emptySubtext}>
                  Sync history will appear here after you sync your bookmarks
                </Text>
              </View>
            }
          />
        )}
      </PremiumGate>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    marginRight: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
  },
  sessionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sessionInfo: {
    flex: 1,
  },
  sessionType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    textTransform: 'capitalize',
  },
  sessionMeta: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  sessionDate: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  sessionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 280,
  },
});
