import React from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSyncQueue } from '../store/syncQueue';
import { colors, fonts, radius, spacing } from '../constants/theme';

/**
 * Persistent strip shown while offline, while changes are queued,
 * or after a replay dropped server-rejected changes.
 */
export function OfflineBanner() {
  const isOnline = useSyncQueue(s => s.isOnline);
  const pendingCount = useSyncQueue(s => s.queue.length);
  const dropped = useSyncQueue(s => s.lastDroppedCount);
  const lastError = useSyncQueue(s => s.lastError);

  if (isOnline && pendingCount === 0 && dropped === 0) return null;

  let message: string;
  let icon: keyof typeof Ionicons.glyphMap = 'cloud-offline-outline';
  let tone = tones.offline;
  if (!isOnline) {
    message = pendingCount > 0
      ? `Offline — ${pendingCount} change${pendingCount === 1 ? '' : 's'} will sync when you're back`
      : 'Offline — showing cached bookmarks';
  } else if (pendingCount > 0) {
    message = lastError
      ? `${pendingCount} change${pendingCount === 1 ? '' : 's'} waiting to sync. We'll retry automatically.`
      : `Syncing ${pendingCount} pending change${pendingCount === 1 ? '' : 's'}…`;
    icon = 'sync-outline';
    tone = tones.syncing;
  } else {
    message = `${dropped} change${dropped === 1 ? '' : 's'} couldn't be applied and were dropped`;
    icon = 'alert-circle-outline';
    tone = tones.dropped;
  }

  return (
    <View style={[styles.banner, tone.box]}>
      <Ionicons name={icon} size={15} color={tone.fg} style={styles.icon} />
      <Text style={[styles.text, { color: tone.fg }]}>{message}</Text>
    </View>
  );
}

const tones: Record<'offline' | 'syncing' | 'dropped', { box: ViewStyle; fg: string }> = {
  offline: {
    box: { backgroundColor: colors.creamDeep, borderColor: colors.border },
    fg: colors.inkSoft,
  },
  syncing: {
    box: { backgroundColor: colors.amberTint, borderColor: '#F3E3B3' },
    fg: colors.amberText,
  },
  dropped: {
    box: { backgroundColor: colors.dangerTint, borderColor: '#F3D4CE' },
    fg: colors.danger,
  },
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: spacing.lg,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  icon: {
    marginRight: spacing.sm,
  },
  text: {
    fontFamily: fonts.medium,
    fontSize: 13,
    flex: 1,
  },
});
