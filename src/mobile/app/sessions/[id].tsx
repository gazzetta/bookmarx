import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../services/api';
import type { Session } from '../../types';

interface SessionItem {
  type: string;
  itemId: string;
  title: string;
  action: string;
}

export default function SessionDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isPremium } = useAuth();
  const [session, setSession] = useState<Session | null>(null);
  const [items, setItems] = useState<SessionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    fetchSessionDetails();
  }, [id]);

  const fetchSessionDetails = async () => {
    if (!id) return;
    
    const response = await api.getSessionDetails(parseInt(id));
    if (response.success && response.data) {
      setSession(response.data.session);
      setItems(response.data.items || []);
    }
    setIsLoading(false);
  };

  const handleRollback = async () => {
    if (!session) return;

    Alert.alert(
      'Rollback Session',
      'This will undo all changes from this sync session. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Rollback',
          style: 'destructive',
          onPress: async () => {
            setIsRollingBack(true);
            const response = await api.rollbackSession(session.id);
            setIsRollingBack(false);
            
            if (response.success) {
              Alert.alert('Success', `Rolled back ${response.data?.affectedItems || 0} items`);
              fetchSessionDetails();
            } else {
              Alert.alert('Error', response.error?.message || 'Failed to rollback');
            }
          },
        },
      ]
    );
  };

  const handleRestore = async () => {
    if (!session) return;

    Alert.alert(
      'Restore Session',
      'This will re-apply the changes from this rolled-back session. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: async () => {
            setIsRestoring(true);
            const response = await api.restoreSession(session.id);
            setIsRestoring(false);
            
            if (response.success) {
              Alert.alert('Success', `Restored ${response.data?.affectedItems || 0} items`);
              fetchSessionDetails();
            } else {
              Alert.alert('Error', response.error?.message || 'Failed to restore');
            }
          },
        },
      ]
    );
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

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'CREATE':
        return 'add-circle';
      case 'UPDATE':
        return 'create';
      case 'DELETE':
        return 'trash';
      case 'MOVE':
        return 'move';
      default:
        return 'ellipse';
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.centered}>
        <Text>Session not found</Text>
      </View>
    );
  }

  const isRolledBack = session.status === 'ROLLED_BACK';
  const canRollback = session.status === 'SUCCESS' || session.status === 'PARTIAL';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.title}>Session Details</Text>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.sessionType}>{session.type.replace(/_/g, ' ')}</Text>
            <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor(session.status)}20` }]}>
              <Text style={[styles.statusText, { color: getStatusColor(session.status) }]}>
                {session.status}
              </Text>
            </View>
          </View>
          
          <Text style={styles.timestamp}>{formatDate(session.timestamp)}</Text>
          
          <View style={styles.stats}>
            <View style={styles.statItem}>
              <Ionicons name="bookmark" size={20} color="#3B82F6" />
              <Text style={styles.statValue}>{session.bookmarksProcessed}</Text>
              <Text style={styles.statLabel}>Bookmarks</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="folder" size={20} color="#F59E0B" />
              <Text style={styles.statValue}>{session.foldersProcessed}</Text>
              <Text style={styles.statLabel}>Folders</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="git-commit" size={20} color="#8B5CF6" />
              <Text style={styles.statValue}>{session.changesCount}</Text>
              <Text style={styles.statLabel}>Changes</Text>
            </View>
          </View>
        </View>

        {items.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Changed Items</Text>
            {items.map((item, index) => (
              <View key={index} style={styles.itemRow}>
                <Ionicons 
                  name={getActionIcon(item.action)} 
                  size={18} 
                  color={
                    item.action === 'CREATE' ? '#10B981' :
                    item.action === 'DELETE' ? '#EF4444' :
                    '#3B82F6'
                  } 
                />
                <View style={styles.itemInfo}>
                  <Text style={styles.itemTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.itemMeta}>
                    {item.type} • {item.action}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.actions}>
          {canRollback && (
            <TouchableOpacity 
              style={[styles.actionButton, styles.rollbackButton]}
              onPress={handleRollback}
              disabled={isRollingBack}
            >
              {isRollingBack ? (
                <ActivityIndicator color="#EF4444" />
              ) : (
                <>
                  <Ionicons name="arrow-undo" size={20} color="#EF4444" />
                  <Text style={styles.rollbackText}>Rollback Session</Text>
                </>
              )}
            </TouchableOpacity>
          )}
          
          {isRolledBack && (
            <TouchableOpacity 
              style={[styles.actionButton, styles.restoreButton]}
              onPress={handleRestore}
              disabled={isRestoring}
            >
              {isRestoring ? (
                <ActivityIndicator color="#10B981" />
              ) : (
                <>
                  <Ionicons name="arrow-redo" size={20} color="#10B981" />
                  <Text style={styles.restoreText}>Restore Session</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.footer}>
          <Ionicons name="information-circle" size={16} color="#9CA3AF" />
          <Text style={styles.footerText}>
            {canRollback 
              ? 'Rolling back will undo all changes made during this sync session.'
              : isRolledBack
              ? 'This session has been rolled back. You can restore it to re-apply the changes.'
              : 'This session cannot be rolled back.'}
          </Text>
        </View>
      </ScrollView>
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
  content: {
    flex: 1,
  },
  card: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 20,
    borderRadius: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sessionType: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    textTransform: 'capitalize',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  timestamp: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 20,
  },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    marginTop: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  itemInfo: {
    flex: 1,
    marginLeft: 12,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  itemMeta: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
    textTransform: 'capitalize',
  },
  actions: {
    paddingHorizontal: 16,
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
  },
  rollbackButton: {
    backgroundColor: '#FEE2E2',
  },
  rollbackText: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  restoreButton: {
    backgroundColor: '#D1FAE5',
  },
  restoreText: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    paddingBottom: 32,
  },
  footerText: {
    flex: 1,
    fontSize: 13,
    color: '#9CA3AF',
    marginLeft: 8,
    lineHeight: 18,
  },
});
