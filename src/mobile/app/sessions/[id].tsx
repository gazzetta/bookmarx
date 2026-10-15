import { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/api';
import { Atmosphere } from '../../components/Atmosphere';
import { Card, DangerButton, IconButton, Reveal, SecondaryButton, SectionLabel } from '../../components/ui';
import { colors, fonts, radius, shadow, spacing, type as ty } from '../../constants/theme';
import type { Session } from '../../types';

interface SessionItem {
  type: string;
  itemId: string;
  title: string;
  action: string;
}

const STATUS_COLORS: Record<string, string> = {
  SUCCESS: colors.sage,
  PARTIAL: colors.amber,
  FAILED: colors.danger,
  ROLLED_BACK: colors.inkMuted,
};

export default function SessionDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
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
      'Rollback session',
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
              Alert.alert('Done', `Rolled back ${response.data?.affectedItems || 0} items`);
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
      'Restore session',
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
              Alert.alert('Done', `Restored ${response.data?.affectedItems || 0} items`);
              fetchSessionDetails();
            } else {
              Alert.alert('Error', response.error?.message || 'Failed to restore');
            }
          },
        },
      ]
    );
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

  const getActionColor = (action: string) => {
    switch (action) {
      case 'CREATE':
        return colors.sage;
      case 'DELETE':
        return colors.danger;
      default:
        return colors.inkSoft;
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
        <ActivityIndicator size="large" color={colors.terra} />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.centered}>
        <Text style={styles.missing}>Session not found</Text>
      </View>
    );
  }

  const statusColor = STATUS_COLORS[session.status] ?? colors.inkMuted;
  const isRolledBack = session.status === 'ROLLED_BACK';
  const canRollback = session.status === 'SUCCESS' || session.status === 'PARTIAL';

  return (
    <View style={styles.container}>
      <Atmosphere subtle />
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <IconButton name="arrow-back" onPress={() => router.back()} />
        <Text style={styles.headerTitle}>Session details</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Reveal>
          <Card style={styles.summaryCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.sessionType}>{session.type.replace(/_/g, ' ').toLowerCase()}</Text>
            <View style={[styles.statusBadge, { backgroundColor: `${statusColor}1A` }]}>
              <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                {session.status.replace(/_/g, ' ').toLowerCase()}
              </Text>
            </View>
          </View>
          <Text style={styles.timestamp}>{formatDate(session.timestamp)}</Text>

          <View style={styles.stats}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{session.bookmarksProcessed}</Text>
              <Text style={styles.statLabel}>Bookmarks</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{session.foldersProcessed}</Text>
              <Text style={styles.statLabel}>Folders</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{session.changesCount}</Text>
              <Text style={styles.statLabel}>Changes</Text>
            </View>
          </View>
          </Card>
        </Reveal>

        {items.length > 0 && (
          <Reveal delay={110} style={styles.section}>
            <SectionLabel>Changed items</SectionLabel>
            <View style={styles.itemsCard}>
              {items.map((item, index) => (
                <View key={index} style={[styles.itemRow, index !== items.length - 1 && styles.itemRowBorder]}>
                  <View style={[styles.actionTile, { backgroundColor: `${getActionColor(item.action)}1A` }]}>
                    <Ionicons name={getActionIcon(item.action)} size={14} color={getActionColor(item.action)} />
                  </View>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.itemMeta}>
                      {item.type.toLowerCase()} · {item.action.toLowerCase()}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </Reveal>
        )}

        <View style={styles.actions}>
          {canRollback && (
            <DangerButton
              label="Rollback session"
              icon="arrow-undo"
              onPress={handleRollback}
              loading={isRollingBack}
            />
          )}
          {isRolledBack && (
            <SecondaryButton
              label="Restore session"
              icon="arrow-redo"
              onPress={handleRestore}
              loading={isRestoring}
            />
          )}
        </View>

        <View style={styles.footer}>
          <Ionicons name="information-circle-outline" size={15} color={colors.inkFaint} />
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
    backgroundColor: colors.cream,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.cream,
  },
  missing: {
    ...ty.body,
    color: colors.inkMuted,
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
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  summaryCard: {
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  sessionType: {
    ...ty.heading,
    fontFamily: fonts.displayBlack,
    textTransform: 'capitalize',
    flex: 1,
    marginRight: spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  statusBadgeText: {
    ...ty.badge,
  },
  timestamp: {
    ...ty.caption,
    marginBottom: spacing.xl,
  },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.borderLight,
  },
  statValue: {
    ...ty.stat,
  },
  statLabel: {
    ...ty.badge,
    color: colors.inkMuted,
    marginTop: 2,
  },
  section: {
    marginBottom: spacing.lg,
  },
  itemsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: 'hidden',
    ...shadow.card,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  itemRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  actionTile: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
    flex: 1,
  },
  itemTitle: {
    ...ty.smallMedium,
    color: colors.ink,
  },
  itemMeta: {
    ...ty.caption,
    marginTop: 1,
    textTransform: 'capitalize',
  },
  actions: {
    gap: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  footerText: {
    flex: 1,
    ...ty.caption,
    lineHeight: 18,
  },
});
