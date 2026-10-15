import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Bookmark, Folder } from '../types';
import { colors, fonts, spacing, type as ty } from '../constants/theme';

interface RowProps {
  onPress?: () => void;
  onLongPress?: () => void;
  pending?: boolean;
  isLast?: boolean;
}

function domainOf(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/i, '').split('/')[0];
}

function monogram(title: string, url: string): string {
  const source = title.trim() || domainOf(url);
  return (source[0] || '#').toUpperCase();
}

export function FolderRow({ folder, onPress, onLongPress, pending, isLast }: RowProps & { folder: Folder }) {
  return (
    <TouchableOpacity
      style={[styles.item, !isLast && styles.itemBorder]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      activeOpacity={0.7}
    >
      <View style={[styles.tile, styles.folderTile]}>
        <Ionicons name="folder" size={17} color={colors.sage} />
      </View>
      <Text style={[styles.itemText, pending && styles.pendingText]} numberOfLines={1}>
        {folder.title}
      </Text>
      {pending ? <Ionicons name="time-outline" size={15} color={colors.inkFaint} /> : null}
      <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
    </TouchableOpacity>
  );
}

export function BookmarkRow({ bookmark, onPress, onLongPress, pending, isLast }: RowProps & { bookmark: Bookmark }) {
  return (
    <TouchableOpacity
      style={[styles.item, !isLast && styles.itemBorder]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      activeOpacity={0.7}
    >
      <View style={[styles.tile, styles.bookmarkTile]}>
        <Text style={styles.monogram}>{monogram(bookmark.title, bookmark.url)}</Text>
      </View>
      <View style={styles.bookmarkInfo}>
        <Text style={[styles.itemText, pending && styles.pendingText]} numberOfLines={1}>
          {bookmark.title}
        </Text>
        <Text style={styles.urlText} numberOfLines={1}>{domainOf(bookmark.url)}</Text>
      </View>
      {pending ? <Ionicons name="time-outline" size={15} color={colors.inkFaint} /> : null}
    </TouchableOpacity>
  );
}

export function isBookmark(item: Bookmark | Folder): item is Bookmark {
  return 'url' in item;
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    gap: spacing.md,
  },
  itemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  tile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderTile: {
    backgroundColor: colors.sageTint,
  },
  bookmarkTile: {
    backgroundColor: colors.terraWash,
    borderWidth: 1,
    borderColor: colors.terraTint,
  },
  monogram: {
    fontFamily: fonts.displayItalic,
    fontSize: 16,
    color: colors.terra,
    marginTop: -2,
  },
  itemText: {
    flex: 1,
    ...ty.bodyMedium,
  },
  pendingText: {
    color: colors.inkFaint,
    fontStyle: 'italic',
  },
  bookmarkInfo: {
    flex: 1,
  },
  urlText: {
    ...ty.caption,
    marginTop: 1,
  },
});
