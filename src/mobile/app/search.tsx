import { useMemo, useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { useBookmarkStore } from '../store/bookmarkStore';
import { FolderRow, BookmarkRow, isBookmark } from '../components/ListItem';
import { EmptyState } from '../components/ui';
import { colors, fonts, radius, shadow, spacing, type as ty } from '../constants/theme';
import type { Bookmark, Folder } from '../types';

export default function SearchScreen() {
  const router = useRouter();
  const { folders, bookmarks, getFolderById } = useBookmarkStore();
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const matchedFolders = folders.filter(
      f => f.status === 'active' && f.title.toLowerCase().includes(q)
    );
    const matchedBookmarks = bookmarks.filter(
      b => b.status === 'active' && (b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q))
    );
    return [...matchedFolders, ...matchedBookmarks].slice(0, 100);
  }, [query, folders, bookmarks]);

  const folderPath = (item: Bookmark | Folder): string => {
    const parentId = item.masterParentId;
    if (!parentId) return '';
    const parent = getFolderById(parentId);
    return parent ? `in ${parent.title}` : '';
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={17} color={colors.inkMuted} />
        <TextInput
          style={styles.input}
          placeholder="Search bookmarks and folders"
          placeholderTextColor={colors.inkFaint}
          value={query}
          onChangeText={setQuery}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.inkFaint} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.listCard}>
        <FlatList
          data={results}
          keyExtractor={(item) => item.masterId}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item, index }) => {
            const path = folderPath(item);
            return (
              <View>
                {isBookmark(item) ? (
                  <BookmarkRow
                    bookmark={item}
                    isLast={index === results.length - 1}
                    onPress={() => void WebBrowser.openBrowserAsync(item.url)}
                    onLongPress={() => router.push(`/edit-bookmark/${item.masterId}`)}
                  />
                ) : (
                  <FolderRow
                    folder={item}
                    isLast={index === results.length - 1}
                    onPress={() => {
                      router.back();
                      router.push(`/folder/${item.masterId}`);
                    }}
                  />
                )}
                {path ? (
                  <Text style={[styles.pathText, index !== results.length - 1 && styles.pathBorder]}>
                    {path}
                  </Text>
                ) : null}
              </View>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon="search-outline"
              title={query.trim().length < 2 ? 'Search your library' : 'No matches'}
              hint={query.trim().length < 2 ? 'Type at least two characters to search titles and URLs.' : 'Try a different title or URL.'}
            />
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
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
  pathText: {
    ...ty.caption,
    fontFamily: fonts.medium,
    paddingHorizontal: spacing.lg + 48,
    paddingBottom: 10,
    backgroundColor: colors.surface,
    marginTop: -10,
  },
  pathBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
});
