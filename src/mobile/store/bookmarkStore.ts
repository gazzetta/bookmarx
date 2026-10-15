import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants/config';
import { api } from '../services/api';
import { accountKey, getSession, isCurrentSession, subscribeSession, type AccountSession } from '../services/session';
import { writeStorage } from '../services/storage';
import { useSyncQueue, subscribeQueue } from './syncQueue';
import type { Bookmark, Folder, Collection, QueuedChange, ApiResponse } from '../types';

const FETCH_THROTTLE_MS = 15000;
const TEMP_PREFIX = 'temp-';
interface CacheShape { folders: Folder[]; bookmarks: Bookmark[]; timestamp: number }
interface BookmarkStore {
  folders: Folder[];
  bookmarks: Bookmark[];
  collections: Collection[];
  /** null = the user's default collection (no X-Collection-ID header sent). */
  activeCollectionId: string | null;
  canCreateCollections: boolean;
  isLoading: boolean;
  error: string | null;
  lastFetched: number | null;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  fetchCollections: () => Promise<void>;
  setActiveCollection: (id: string | null) => Promise<void>;
  fetchMasterCollection: (force?: boolean) => Promise<void>;

  getBookmarksInFolder: (masterParentId: string | null) => Bookmark[];
  getFoldersInFolder: (masterParentId: string | null) => Folder[];
  getFolderById: (masterId: string) => Folder | undefined;
  getBookmarkById: (masterId: string) => Bookmark | undefined;
  getActiveCollection: () => Collection | null;
  isPending: (masterId: string) => boolean;

  addBookmark: (url: string, title: string | undefined, masterParentId: string | null) => Promise<{ success: boolean; error?: string }>;
  updateBookmark: (masterId: string, data: { title?: string; url?: string; masterParentId?: string | null }) => Promise<{ success: boolean; error?: string }>;
  deleteBookmark: (masterId: string) => Promise<{ success: boolean; error?: string }>;
  createFolder: (title: string, masterParentId: string | null) => Promise<{ success: boolean; error?: string }>;
  updateFolder: (masterId: string, data: { title?: string; masterParentId?: string | null }) => Promise<{ success: boolean; error?: string }>;
  deleteFolder: (masterId: string) => Promise<{ success: boolean; error?: string }>;

  // Collection CRUD (server enforces premium for non-default writes)
  createCollection: (name: string, description?: string) => Promise<{ success: boolean; error?: string }>;
  renameCollection: (collectionId: string, name: string, description?: string) => Promise<{ success: boolean; error?: string }>;
  archiveCollection: (collectionId: string) => Promise<{ success: boolean; error?: string }>;
  deleteCollection: (collectionId: string) => Promise<{ success: boolean; error?: string }>;
}

const emptyCollection = (): CacheShape => ({ folders: [], bookmarks: [], timestamp: 0 });
const collectionKey = (id: string | null) => id ?? 'default';
const cacheKey = (id: string | null, session = getSession()) =>
  accountKey(`${STORAGE_KEYS.COLLECTION_CACHE_PREFIX}${collectionKey(id)}`, session);

function sortItems<T extends Bookmark | Folder>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || (a.title || '').localeCompare(b.title || ''));
}

function descendantIds(root: string, folders: Folder[]): Set<string> {
  const ids = new Set([root]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const folder of folders) {
      if (folder.masterParentId && ids.has(folder.masterParentId) && !ids.has(folder.masterId)) {
        ids.add(folder.masterId);
        grew = true;
      }
    }
  }
  return ids;
}

/** Render a mutation onto a copy, keeping server-confirmed data separate from pending edits. */
function applyChange(base: CacheShape, change: QueuedChange, masterId = change.tempMasterId): CacheShape {
  let folders = base.folders.map(f => ({ ...f }));
  let bookmarks = base.bookmarks.map(b => ({ ...b }));
  const p = change.payload;
  const parent = (p.masterParentId ?? null) as string | null;
  const created = {
    id: -1, masterId: masterId!, browserId: '', userId: '', title: String(p.title || p.url || ''),
    parentId: null, masterParentId: parent, position: 0, dateAdded: change.queuedAt,
    status: 'active' as const, syncVersion: 0, createdAt: change.queuedAt, updatedAt: change.queuedAt,
  };
  switch (change.kind) {
    case 'createBookmark':
      if (!bookmarks.some(b => b.masterId === masterId)) bookmarks.push({ ...created, url: String(p.url), parentId: '' });
      break;
    case 'createFolder':
      if (!folders.some(f => f.masterId === masterId)) folders.push(created);
      break;
    case 'updateBookmark':
      bookmarks = bookmarks.map(b => b.masterId === p.masterId ? { ...b, ...p } as Bookmark : b);
      break;
    case 'updateFolder':
      folders = folders.map(f => f.masterId === p.masterId ? { ...f, ...p } as Folder : f);
      break;
    case 'deleteBookmark':
      bookmarks = bookmarks.filter(b => b.masterId !== p.masterId);
      break;
    case 'deleteFolder': {
      const doomed = descendantIds(String(p.masterId), folders);
      folders = folders.filter(f => !doomed.has(f.masterId));
      bookmarks = bookmarks.filter(b => !b.masterParentId || !doomed.has(b.masterParentId));
      break;
    }
  }
  return { folders, bookmarks, timestamp: base.timestamp };
}

export const useBookmarkStore = create<BookmarkStore>((set, get) => {
  const confirmed = new Map<string, CacheShape>();
  const aliases = new Map<string, string>();
  const revisions = new Map<string, number>();
  let selectionVersion = 0;
  let fetchVersion = 0;
  const resolveId = (id: string | null) => id ? aliases.get(id) ?? id : null;

  const publish = () => {
    const id = get().activeCollectionId;
    let view = confirmed.get(collectionKey(id)) ?? emptyCollection();
    for (const change of useSyncQueue.getState().queue) {
      if (change.collectionId === id) view = applyChange(view, change);
    }
    set({ folders: sortItems(view.folders), bookmarks: sortItems(view.bookmarks) });
  };

  async function readCache(id: string | null, session: AccountSession): Promise<CacheShape> {
    try {
      const raw = await AsyncStorage.getItem(cacheKey(id, session));
      const cached = raw ? JSON.parse(raw) as CacheShape : null;
      return cached && Array.isArray(cached.folders) && Array.isArray(cached.bookmarks) ? cached : emptyCollection();
    } catch { return emptyCollection(); }
  }

  subscribeSession(() => {
    confirmed.clear(); aliases.clear(); revisions.clear();
    selectionVersion++; fetchVersion++;
    set({ folders: [], bookmarks: [], collections: [], activeCollectionId: null,
      canCreateCollections: false, isLoading: false, error: null, lastFetched: null, hydrated: false });
  });

  subscribeQueue(async ({ change, outcome }) => {
    const session = getSession();
    const key = collectionKey(change.collectionId);
    revisions.set(key, (revisions.get(key) ?? 0) + 1);
    if (outcome.success) {
      if (change.tempMasterId && outcome.masterId) aliases.set(change.tempMasterId, outcome.masterId);
      const cached = confirmed.get(key) ?? await readCache(change.collectionId, session);
      if (!isCurrentSession(session)) return;
      const base = applyChange(confirmed.get(key) ?? cached, change, outcome.masterId);
      confirmed.set(key, base);
      await writeStorage(cacheKey(change.collectionId, session), base).catch(() => {});
      if (!isCurrentSession(session)) return;
    }
    publish();
    if (!outcome.success) set({ error: outcome.error || 'A change was rejected by the server' });
  });

  async function runChange(change: Omit<QueuedChange, 'queueId' | 'queuedAt'>) {
    const session = getSession();
    try {
      const queued = await useSyncQueue.getState().enqueue(change);
      if (!isCurrentSession(session)) return { success: false, error: 'Your account changed. Please try again.' };
      publish();
      await useSyncQueue.getState().replay();
      if (!isCurrentSession(session)) return { success: false, error: 'Your account changed. Please try again.' };
      const outcome = useSyncQueue.getState().outcomes[queued.queueId];
      return outcome ? { success: outcome.success, error: outcome.error } : { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Could not save change' };
    }
  }

  async function collectionMutation(request: () => Promise<ApiResponse<unknown>>, removedId?: string) {
    const session = getSession();
    if (!session.userId) return { success: false, error: 'Sign in to edit collections' };
    const response = await request();
    if (!isCurrentSession(session)) return { success: false, error: 'Your account changed. Please try again.' };
    if (!response.success) return { success: false, error: response.error?.message || 'Could not update collection' };
    if (removedId && get().activeCollectionId === removedId) await get().setActiveCollection(null);
    await get().fetchCollections();
    return { success: true };
  }

  return {
    folders: [], bookmarks: [], collections: [], activeCollectionId: null, canCreateCollections: false,
    isLoading: false, error: null, lastFetched: null, hydrated: false,

    hydrate: async () => {
      const session = getSession();
      if (!session.userId) return;
      const selection = ++selectionVersion;
      await useSyncQueue.getState().hydrate();
      const raw = await AsyncStorage.getItem(accountKey(STORAGE_KEYS.ACTIVE_COLLECTION, session));
      const id = raw ? JSON.parse(raw) as string | null : null;
      const cached = await readCache(id, session);
      if (!isCurrentSession(session) || selection !== selectionVersion) return;
      confirmed.set(collectionKey(id), cached);
      set({ activeCollectionId: id, lastFetched: cached.timestamp || null, hydrated: true });
      publish();
    },

    fetchCollections: async () => {
      const session = getSession();
      if (!session.userId) return;
      const response = await api.getCollections();
      if (!isCurrentSession(session)) return;
      if (response.success && response.data) {
        const { collections, canCreate } = response.data;
        set({ collections, canCreateCollections: canCreate });
        const activeId = get().activeCollectionId;
        if (activeId && !collections.some(c => c.id === activeId)) await get().setActiveCollection(null);
      }
    },

    setActiveCollection: async id => {
      const session = getSession();
      if (!session.userId) return;
      const selection = ++selectionVersion;
      fetchVersion++;
      // Invalidate the old fetch before waiting for storage or the new collection.
      set({ activeCollectionId: id, folders: [], bookmarks: [], lastFetched: null, isLoading: false, error: null });
      await writeStorage(accountKey(STORAGE_KEYS.ACTIVE_COLLECTION, session), id);
      const cached = confirmed.get(collectionKey(id)) ?? await readCache(id, session);
      if (!isCurrentSession(session) || selection !== selectionVersion) return;
      confirmed.set(collectionKey(id), cached);
      set({ lastFetched: cached.timestamp || null });
      publish();
      await get().fetchMasterCollection(true);
    },

    fetchMasterCollection: async (force = false) => {
      const session = getSession();
      if (!session.userId || !get().hydrated) return;
      const { lastFetched, activeCollectionId } = get();
      if (!force && (get().isLoading || (lastFetched && Date.now() - lastFetched < FETCH_THROTTLE_MS))) return;
      const request = ++fetchVersion;
      const selection = selectionVersion;
      const key = collectionKey(activeCollectionId);
      set({ isLoading: true, error: null });
      await useSyncQueue.getState().replay();
      if (!isCurrentSession(session) || request !== fetchVersion || selection !== selectionVersion) return;
      const revision = revisions.get(key) ?? 0;
      const response = await api.getMasterCollection(activeCollectionId);
      if (!isCurrentSession(session) || request !== fetchVersion || selection !== selectionVersion) return;
      if (revision !== (revisions.get(key) ?? 0)) {
        await get().fetchMasterCollection(true);
        return;
      }
      if (response.success && response.data) {
        const base = { folders: response.data.folders, bookmarks: response.data.bookmarks, timestamp: Date.now() };
        confirmed.set(key, base);
        publish();
        set({ isLoading: false, lastFetched: base.timestamp });
        void writeStorage(cacheKey(activeCollectionId, session), base).catch(() => {});
      } else set({ isLoading: false, error: response.error?.message || 'Failed to load bookmarks' });
    },

    getBookmarksInFolder: id => get().bookmarks.filter(b => (b.masterParentId ?? null) === resolveId(id) && b.status === 'active'),
    getFoldersInFolder: id => get().folders.filter(f => (f.masterParentId ?? null) === resolveId(id) && f.status === 'active'),
    getFolderById: id => get().folders.find(f => f.masterId === resolveId(id)),
    getBookmarkById: id => get().bookmarks.find(b => b.masterId === resolveId(id)),
    getActiveCollection: () => get().collections.find(c => get().activeCollectionId ? c.id === get().activeCollectionId : c.isDefault) ?? null,
    isPending: id => id.startsWith(TEMP_PREFIX) && !aliases.has(id),

    addBookmark: (url, title, masterParentId) => runChange({
      kind: 'createBookmark', payload: { url, title, masterParentId: resolveId(masterParentId) },
      collectionId: get().activeCollectionId,
      tempMasterId: `${TEMP_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}`,
    }),
    createFolder: (title, masterParentId) => runChange({
      kind: 'createFolder', payload: { title, masterParentId: resolveId(masterParentId) },
      collectionId: get().activeCollectionId,
      tempMasterId: `${TEMP_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}`,
    }),
    updateBookmark: (masterId, data) => runChange({
      kind: 'updateBookmark',
      payload: { ...data, masterId: resolveId(masterId),
        ...(data.masterParentId !== undefined ? { masterParentId: resolveId(data.masterParentId) } : {}) },
      collectionId: get().activeCollectionId,
    }),
    updateFolder: (masterId, data) => runChange({
      kind: 'updateFolder',
      payload: { ...data, masterId: resolveId(masterId),
        ...(data.masterParentId !== undefined ? { masterParentId: resolveId(data.masterParentId) } : {}) },
      collectionId: get().activeCollectionId,
    }),
    deleteBookmark: masterId => runChange({
      kind: 'deleteBookmark', payload: { masterId: resolveId(masterId) }, collectionId: get().activeCollectionId,
    }),
    deleteFolder: masterId => runChange({
      kind: 'deleteFolder', payload: { masterId: resolveId(masterId) }, collectionId: get().activeCollectionId,
    }),
    createCollection: (name, description) => collectionMutation(() => api.createCollection(name, description)),
    renameCollection: (id, name, description) => collectionMutation(() => api.updateCollection(id, { name, description })),
    archiveCollection: id => collectionMutation(() => api.archiveCollection(id), id),
    deleteCollection: id => collectionMutation(() => api.deleteCollection(id), id),
  };
});
