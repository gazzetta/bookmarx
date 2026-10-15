import { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Modal, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import { useBookmarkStore } from '../../store/bookmarkStore';
import { Atmosphere } from '../../components/Atmosphere';
import { Field, Pill, PrimaryButton, Reveal, SecondaryButton } from '../../components/ui';
import { colors, fonts, radius, shadow, spacing, type as ty } from '../../constants/theme';
import type { Collection } from '../../types';

export default function CollectionsScreen() {
  const router = useRouter();
  const { isPremium } = useAuthStore();
  const {
    collections, canCreateCollections, activeCollectionId,
    fetchCollections, setActiveCollection,
    createCollection, renameCollection, archiveCollection, deleteCollection,
  } = useBookmarkStore();

  const [refreshing, setRefreshing] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<Collection | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    void fetchCollections();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchCollections();
    setRefreshing(false);
  };

  const openForm = (collection: Collection | null) => {
    setEditing(collection);
    setName(collection?.name ?? '');
    setDescription(collection?.description ?? '');
    setFormVisible(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setIsSaving(true);
    const result = editing
      ? await renameCollection(editing.id, name.trim(), description.trim() || undefined)
      : await createCollection(name.trim(), description.trim() || undefined);
    setIsSaving(false);
    if (result.success) {
      setFormVisible(false);
      setEditing(null);
    } else {
      Alert.alert('Could not save', result.error || 'Something went wrong');
    }
  };

  const collectionActions = (collection: Collection) => {
    if (collection.isDefault) return;
    const buttons: any[] = [
      { text: 'Open', onPress: () => void setActiveCollection(collection.id).then(() => router.back()) },
      { text: 'Rename', onPress: () => openForm(collection) },
      {
        text: 'Archive', onPress: () => {
          Alert.alert('Archive collection?', `"${collection.name}" will be archived. Data is kept for 30 days.`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Archive', onPress: () => void archiveCollection(collection.id) },
          ]);
        }
      },
      {
        text: 'Delete', style: 'destructive', onPress: () => {
          Alert.alert('Delete collection?', `"${collection.name}" will be permanently deleted.`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => void deleteCollection(collection.id) },
          ]);
        }
      },
      { text: 'Cancel', style: 'cancel' },
    ];
    Alert.alert(collection.name, collection.description || undefined, buttons);
  };

  const canWrite = isPremium || canCreateCollections;

  const renderCollection = ({ item, index }: { item: Collection; index: number }) => {
    const isActive = item.isDefault ? activeCollectionId === null : activeCollectionId === item.id;
    const isLast = index === collections.length - 1;
    return (
      <TouchableOpacity
        style={[styles.row, !isLast && styles.rowBorder]}
        onPress={() => void setActiveCollection(item.isDefault ? null : item.id).then(() => router.back())}
        onLongPress={() => canWrite && collectionActions(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.tile, item.isDefault ? styles.tileMain : styles.tileAlbum]}>
          <Ionicons
            name={item.isDefault ? 'bookmark' : 'albums'}
            size={15}
            color={item.isDefault ? colors.terra : colors.sage}
          />
        </View>
        <View style={styles.rowInfo}>
          <View style={styles.rowTitle}>
            <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
            {item.isDefault && <Pill label="Default" tone="neutral" />}
            {isActive && <Pill label="Viewing" tone="terra" />}
          </View>
          {item.description ? (
            <Text style={styles.rowDescription} numberOfLines={1}>{item.description}</Text>
          ) : null}
        </View>
        {canWrite && !item.isDefault ? (
          <TouchableOpacity onPress={() => collectionActions(item)} hitSlop={8}>
            <Ionicons name="ellipsis-horizontal" size={18} color={colors.inkFaint} />
          </TouchableOpacity>
        ) : (
          <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Atmosphere subtle />
      <Reveal style={styles.listWrap}>
        <View style={styles.listCard}>
        <FlatList
          data={collections}
          keyExtractor={(item) => item.id}
          renderItem={renderCollection}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.terra} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <ActivityIndicator color={colors.terra} />
            </View>
          }
        />
        </View>
      </Reveal>

      <View style={styles.footer}>
        {canWrite ? (
          <SecondaryButton
            label="New collection"
            icon="add"
            onPress={() => openForm(null)}
          />
        ) : (
          <TouchableOpacity style={styles.membershipHint} onPress={() => router.push('/membership')}>
            <Ionicons name="information-circle-outline" size={14} color={colors.inkMuted} />
            <Text style={styles.membershipHintText}>
              Multiple collections require a Premium membership
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={formVisible} transparent animationType="fade" onRequestClose={() => setFormVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalEyebrow}>{editing ? 'RENAME' : 'CREATE'}</Text>
            <Text style={styles.modalTitle}>{editing ? 'Rename collection' : 'New collection'}</Text>
            <Field
              label="Name"
              placeholder="Collection name"
              value={name}
              onChangeText={setName}
              autoFocus
              autoCapitalize="sentences"
            />
            <Field
              label="Description"
              placeholder="Optional"
              value={description}
              onChangeText={setDescription}
              multiline
              autoCapitalize="sentences"
              style={styles.modalField}
            />
            <View style={styles.modalButtons}>
              <SecondaryButton label="Cancel" onPress={() => setFormVisible(false)} style={styles.modalCancel} />
              <PrimaryButton
                label={editing ? 'Save' : 'Create'}
                onPress={handleSave}
                loading={isSaving}
                disabled={!name.trim()}
                style={styles.modalSave}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  listWrap: {
    maxHeight: '75%',
  },
  listCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: 'hidden',
    ...shadow.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  tile: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileMain: {
    backgroundColor: colors.terraWash,
    borderWidth: 1,
    borderColor: colors.terraTint,
  },
  tileAlbum: {
    backgroundColor: colors.sageTint,
  },
  rowInfo: {
    flex: 1,
  },
  rowTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowName: {
    ...ty.bodyMedium,
    fontFamily: fonts.semibold,
    flexShrink: 1,
  },
  rowDescription: {
    ...ty.caption,
    marginTop: 2,
  },
  empty: {
    padding: 60,
    alignItems: 'center',
  },
  footer: {
    padding: spacing.lg,
  },
  membershipHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
  },
  membershipHintText: {
    ...ty.small,
    color: colors.inkMuted,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(26,26,26,0.45)',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
  },
  modalEyebrow: {
    ...ty.eyebrow,
    marginBottom: 4,
  },
  modalTitle: {
    ...ty.heading,
    marginBottom: spacing.lg,
  },
  modalField: {
    marginTop: spacing.md,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  modalCancel: {
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
  },
  modalSave: {
    paddingVertical: 12,
    paddingHorizontal: spacing.xl,
    minWidth: 96,
  },
});
