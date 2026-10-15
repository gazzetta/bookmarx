import { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../services/api';
import { PremiumGate } from '../../components/PremiumGate';
import { Atmosphere } from '../../components/Atmosphere';
import { EmptyState, IconButton } from '../../components/ui';
import { colors, fonts, radius, shadow, spacing, type as ty } from '../../constants/theme';
import type { Session } from '../../types';

const STATUS_COLORS: Record<string, string> = {
  SUCCESS: colors.sage,
  PARTIAL: colors.amber,
  FAILED: colors.danger,
  ROLLED_BACK: colors.inkMuted,
};

export default function SessionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderSession = ({ item, index }: { item: Session; index: number }) => {
    const statusColor = STATUS_COLORS[item.status] ?? colors.inkMuted;
    const isLast = index === sessions.length - 1;
    return (
      <TouchableOpacity
        style={[styles.sessionRow, !isLast && styles.sessionRowBorder]}
        onPress={() => router.push(`/sessions/${item.id}`)}
        activeOpacity={0.7}
      >
        <View style={[styles.sessionTile, { backgroundColor: `${statusColor}1A` }]}>
          <Ionicons name={getSessionIcon(item.type)} size={17} color={statusColor} />
        </View>
        <View style={styles.sessionInfo}>
          <Text style={styles.sessionType}>
            {item.type.replace(/_/g, ' ').toLowerCase()}
          </Text>
          <Text style={styles.sessionMeta}>
            {item.bookmarksProcessed} bookmarks · {item.foldersProcessed} folders
          </Text>
          <Text style={styles.sessionDate}>{formatDate(item.timestamp)}</Text>
        </View>
        <View style={styles.sessionStatus}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>
            {item.status.replace(/_/g, ' ').toLowerCase()}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Atmosphere subtle />
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <IconButton name="arrow-back" onPress={() => router.back()} />
        <Text style={styles.headerTitle}>Sync history</Text>
        <View style={{ width: 38 }} />
      </View>

      <PremiumGate
        isPremium={isPremium}
        featureName="Sync history"
        customMessage="Sync history and rollback require a BookMarx Premium membership."
      >
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.terra} />
          </View>
        ) : (
          <View style={styles.listCard}>
            <FlatList
              data={sessions}
              keyExtractor={(item) => item.id.toString()}
              renderItem={renderSession}
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={handleRefresh}
                  tintColor={colors.terra}
                />
              }
              ListEmptyComponent={
                <EmptyState
                  icon="time-outline"
                  title="No sync history yet"
                  hint="Sync history appears here after your bookmarks sync."
                />
              }
            />
          </View>
        )}
      </PremiumGate>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    ...ty.heading,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listCard: {
    flex: 1,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: 'hidden',
    ...shadow.card,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.surface,
  },
  sessionRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  sessionTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionInfo: {
    flex: 1,
  },
  sessionType: {
    ...ty.bodyMedium,
    fontFamily: fonts.semibold,
    textTransform: 'capitalize',
  },
  sessionMeta: {
    ...ty.caption,
    marginTop: 1,
  },
  sessionDate: {
    ...ty.caption,
    color: colors.inkFaint,
    marginTop: 2,
  },
  sessionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: spacing.xs,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  statusText: {
    fontFamily: fonts.medium,
    fontSize: 11,
    textTransform: 'capitalize',
  },
});
