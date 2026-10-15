import React, { useMemo } from 'react';
import { View, Text, Modal, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Folder } from '../types';
import { colors, fonts, radius, spacing, type as ty } from '../constants/theme';

interface FolderPickerProps {
  visible: boolean;
  folders: Folder[];
  selectedId: string | null;
  /** masterId of a folder being moved — it and its descendants are excluded. */
  excludeId?: string;
  onSelect: (masterId: string | null) => void;
  onClose: () => void;
}

interface FlatRow {
  folder: Folder | null; // null = the "Root" pseudo-row
  depth: number;
}

export function FolderPicker({ visible, folders, selectedId, excludeId, onSelect, onClose }: FolderPickerProps) {
  const rows = useMemo<FlatRow[]>(() => {
    const excluded = new Set<string>();
    if (excludeId) {
      excluded.add(excludeId);
      let grew = true;
      while (grew) {
        grew = false;
        for (const f of folders) {
          if (f.masterParentId && excluded.has(f.masterParentId) && !excluded.has(f.masterId)) {
            excluded.add(f.masterId);
            grew = true;
          }
        }
      }
    }

    const active = folders.filter(f => f.status === 'active' && !excluded.has(f.masterId));
    const result: FlatRow[] = [{ folder: null, depth: 0 }];

    const walk = (parentId: string | null, depth: number) => {
      const children = active
        .filter(f => (f.masterParentId ?? null) === parentId)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.title.localeCompare(b.title));
      for (const child of children) {
        result.push({ folder: child, depth });
        walk(child.masterId, depth + 1);
      }
    };
    walk(null, 1);
    return result;
  }, [folders, excludeId]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <Text style={styles.title}>Move to</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <Ionicons name="close" size={18} color={colors.inkSoft} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={rows}
            keyExtractor={(row) => row.folder?.masterId ?? 'root'}
            renderItem={({ item }) => {
              const id = item.folder?.masterId ?? null;
              const isSelected = id === selectedId;
              return (
                <TouchableOpacity
                  style={[styles.row, isSelected && styles.rowSelected]}
                  onPress={() => {
                    onSelect(id);
                    onClose();
                  }}
                >
                  <View style={{ width: item.depth * 18 }} />
                  <View style={[styles.rowIcon, item.folder ? styles.rowIconFolder : styles.rowIconRoot]}>
                    <Ionicons
                      name={item.folder ? 'folder' : 'bookmark'}
                      size={14}
                      color={item.folder ? colors.sage : colors.terra}
                    />
                  </View>
                  <Text style={[styles.rowText, isSelected && styles.rowTextSelected]}>
                    {item.folder?.title ?? 'Top level'}
                  </Text>
                  {isSelected && <Ionicons name="checkmark" size={18} color={colors.terra} />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '72%',
    paddingBottom: spacing.xl,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginTop: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: {
    ...ty.heading,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.creamDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  rowSelected: {
    backgroundColor: colors.terraWash,
  },
  rowIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconFolder: {
    backgroundColor: colors.sageTint,
  },
  rowIconRoot: {
    backgroundColor: colors.terraWash,
    borderWidth: 1,
    borderColor: colors.terraTint,
  },
  rowText: {
    flex: 1,
    ...ty.bodyMedium,
  },
  rowTextSelected: {
    color: colors.terraDark,
    fontFamily: fonts.semibold,
  },
});
