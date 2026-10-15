import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants/config';
import { api } from '../services/api';
import { useSyncQueue } from './syncQueue';
import type { Bookmark, Folder, Collection, QueuedChange } from '../types';

const FETCH_THROTTLE_MS = 15000;
const TEMP_PREFIX = 'temp-';

type ListItem = Bookmark | Folder;

interface CacheShape {
  folders: Folder[];
  bookmarks: Bookmark[];
  timestamp: number;
}

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

const cacheKey = (collectionId: string | null) =>
  `${STORAGE_KEYS.COLLECTION_CACHE_PREFIX}${collectionId ?? 'default'}`;

function sortItems<T extends ListItem>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const pa = a.position ?? 0;
    const pb = b.position ?? 0;
    if (pa !== pb) return pa - pb;
    return (a.title || '').localeCompare(b.title || '');
  });
}

export const useBookmarkStore = create<BookmarkStore>((set, get) => {
  async function readCache(collectionId: string | null): Promise<CacheShape | null> {
    try {
      const raw = await AsyncStorage.getItem(cacheKey(collectionId));
      return raw ? (JSON.parse(raw) as CacheShape) : null;
    } catch {
      return null;
    }
  }

  async function writeCache(collectionId: string | null, data: CacheShape) {
    try {
      await AsyncStorage.setItem(cacheKey(collectionId), JSON.stringify(data));
    } catch (error) {
      console.error('Failed to cache collection:', error);
    }
  }

  /** Re-apply optimistic state for queued changes onto the fetched lists. */
  function applyQueueOverlay(folders: Folder[], bookmarks: Bookmark[]) {
    const activeId = get().activeCollectionId;
    for (const change of useSyncQueue.getState().queue) {
      if ((change.collectionId ?? null) !== activeId) continue;
      const p = change.payload as any;
      switch (change.kind) {
        case 'createBookmark':
          if (change.tempMasterId && !bookmarks.some(b => b.masterId === change.tempMasterId)) {
            bookmarks.push({
              id: -1, masterId: change.tempMasterId, browserId: '', userId: '',
              url: p.url, title: p.title || p.url, parentId: '',
              masterParentId: p.masterParentId ?? null, position: 0,
              dateAdded: change.queuedAt, status: 'active', syncVersion: 0,
              createdAt: change.queuedAt, updatedAt: change.queuedAt,
            } as Bookmark);
          }
          break;
        case 'updateBookmark': {
          const b = bookmarks.find(x => x.masterId === p.masterId);
          if (b) {
            if (p.title !== undefined) b.title = p.title;
            if (p.url !== undefined) b.url = p.url;
            if (p.masterParentId !== undefined) b.masterParentId = p.masterParentId;
          }
          break;
        }
        case 'deleteBookmark':
          bookmarks = bookmarks.filter(x => x.masterId !== p.masterId);
          break;
        case 'createFolder':
          if (change.tempMasterId && !folders.some(f => f.masterId === change.tempMasterId)) {
            folders.push({
              id: -1, masterId: change.tempMasterId, browserId: '', userId: '',
              title: p.title, parentId: null, masterParentId: p.masterParentId ?? null,
              position: 0, dateAdded: change.queuedAt, status: 'active',
              syncVersion: 0, createdAt: change.queuedAt, updatedAt: change.queuedAt,
            } as Folder);
          }
          break;
        case 'updateFolder': {
          const f = folders.find(x => x.masterId === p.masterId);
          if (f) {
            if (p.title !== undefined) f.title = p.title;
            if (p.masterParentId !== undefined) f.masterParentId = p.masterParentId;
          }
          break;
        }
        case 'deleteFolder':
          folders = folders.filter(x => x.masterId !== p.masterId);
          break;
      }
    }
    return { folders, bookmarks };
  }

  function descendantIds(rootFolderId: string, folders: Folder[]): Set<string> {
    const ids = new Set<string>([rootFolderId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const f of folders) {
        if (f.masterParentId && ids.has(f.masterParentId) && !ids.has(f.masterId)) {
          ids.add(f.masterId);
          grew = true;
        }
      }
    }
    return ids;
  }

  /** Enqueue a change and try to flush immediately when online. */
  async function runChange(
    change: Omit<QueuedChange, 'queueId' | 'queuedAt'>
  ): Promise<{ success: boolean; error?: string }> {
    const queued = await useSyncQueue.getState().enqueue(change);
    const { isOnline, replay } = useSyncQueue.getState();

    if (!isOnline) return { success: true };

    let applied: any = null;
    await replay((_change, result) => {
      if (_change.queueId === queued.queueId) applied = result;
    });

    if (!applied) {
      const { queue } = useSyncQueue.getState();
      if (!queue.some(c => c.queueId === queued.queueId)) {
        return { success: false, error: useSyncQueue.getState().lastDroppedCount > 0 ? 'Change was rejected by the server' : 'Change failed' };
      }
      // Still queued — will flush on reconnect.
      return { success: true };
    }

    // Server applied it — reconcile temp id with the real masterId.
    if (change.tempMasterId) {
      const realId = applied?.results?.[0]?.masterId;
      if (realId) {
        set(state => ({
          folders: state.folders.map(f => f.masterId === change.tempMasterId ? { ...f, masterId: realId } : f),
          bookmarks: state.bookmarks.map(b => b.masterId === change.tempMasterId ? { ...b, masterId: realId } : b),
        }));
      }
    }
    return { success: true };
  }

  return {
    folders: [],
    bookmarks: [],
    collections: [],
    activeCollectionId: null,
    canCreateCollections: false,
    isLoading: false,
    error: null,
    lastFetched: null,
    hydrated: false,

    hydrate: async () => {
      const queue = useSyncQueue.getState();
      if (!queue.hydrated) await queue.hydrate();

      const saved = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_COLLECTION);
      const activeCollectionId = saved && saved !== 'default' ? saved : null;
      const cached = await readCache(activeCollectionId);
      set({
        activeCollectionId,
        folders: cached?.folders ?? [],
        bookmarks: cached?.bookmarks ?? [],
        lastFetched: cached?.timestamp ?? null,
        hydrated: true,
      });
    },

    fetchCollections: async () => {
      const response = await api.getCollections();
      if (response.success && response.data) {
        const { collections, canCreate } = response.data;
        const activeId = get().activeCollectionId;
        const stillValid = !activeId || collections.some(c => c.id === activeId);
        set({ collections, canCreateCollections: canCreate });
        if (!stillValid) await get().setActiveCollection(null);
      }
    },

    setActiveCollection: async (id) => {
      await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_COLLECTION, id ?? 'default');
      const cached = await readCache(id);
      set({
        activeCollectionId: id,
        folders: cached?.folders ?? [],
        bookmarks: cached?.bookmarks ?? [],
        lastFetched: cached?.timestamp ?? null,
        error: null,
      });
      await get().fetchMasterCollection(true);
    },

    fetchMasterCollection: async (force = false) => {
      const { lastFetched, isLoading, activeCollectionId } = get();
      if (!force && lastFetched && Date.now() - lastFetched < FETCH_THROTTLE_MS) return;
      if (isLoading) return;

      set({ isLoading: true, error: null });
      const response = await api.getMasterCollection(activeCollectionId);

      if (response.success && response.data) {
        const overlaid = applyQueueOverlay(response.data.folders, response.data.bookmarks);
        const timestamp = Date.now();
        set({
          folders: sortItems(overlaid.folders),
          bookmarks: sortItems(overlaid.bookmarks),
          isLoading: false,
          lastFetched: timestamp,
        });
        void writeCache(activeCollectionId, {
          folders: overlaid.folders,
          bookmarks: overlaid.bookmarks,
          timestamp,
        });
      } else {
        set({
          isLoading: false,
          error: response.error?.message || 'Failed to load bookmarks',
        });
      }
    },

    getBookmarksInFolder: (masterParentId) =>
      get().bookmarks.filter(b => (b.masterParentId ?? null) === masterParentId && b.status === 'active'),

    getFoldersInFolder: (masterParentId) =>
      get().folders.filter(f => (f.masterParentId ?? null) === masterParentId && f.status === 'active'),

    getFolderById: (masterId) => get().folders.find(f => f.masterId === masterId),
    getBookmarkById: (masterId) => get().bookmarks.find(b => b.masterId === masterId),

    getActiveCollection: () => {
      const { collections, activeCollectionId } = get();
      if (!activeCollectionId) return collections.find(c => c.isDefault) ?? null;
      return collections.find(c => c.id === activeCollectionId) ?? null;
    },

    isPending: (masterId) => masterId.startsWith(TEMP_PREFIX),

    addBookmark: async (url, title, masterParentId) => {
      const tempMasterId = `${TEMP_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const optimistic: Bookmark = {
        id: -1, masterId: tempMasterId, browserId: '', userId: '',
        url, title: title || url, parentId: '', masterParentId,
        position: 0, dateAdded: Date.now(), status: 'active',
        syncVersion: 0, createdAt: Date.now(), updatedAt: Date.now(),
      };
      set(state => ({ bookmarks: sortItems([...state.bookmarks, optimistic]) }));
      return runChange({
        kind: 'createBookmark',
        payload: { url, title, masterParentId },
        collectionId: get().activeCollectionId,
        tempMasterId,
      });
    },

    updateBookmark: async (masterId, data) => {
      set(state => ({
        bookmarks: state.bookmarks.map(b =>
          b.masterId === masterId
            ? { ...b, title: data.title ?? b.title, url: data.url ?? b.url, masterParentId: data.masterParentId !== undefined ? data.masterParentId : b.masterParentId }
            : b
        ),
      }));
      return runChange({
        kind: 'updateBookmark',
        payload: { masterId, ...data },
        collectionId: get().activeCollectionId,
      });
    },

    deleteBookmark: async (masterId) => {
      set(state => ({ bookmarks: state.bookmarks.filter(b => b.masterId !== masterId) }));
      return runChange({
        kind: 'deleteBookmark',
        payload: { masterId },
        collectionId: get().activeCollectionId,
      });
    },

    createFolder: async (title, masterParentId) => {
      const tempMasterId = `${TEMP_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const optimistic: Folder = {
        id: -1, masterId: tempMasterId, browserId: '', userId: '', title,
        parentId: null, masterParentId, position: 0, dateAdded: Date.now(),
        status: 'active', syncVersion: 0, createdAt: Date.now(), updatedAt: Date.now(),
      };
      set(state => ({ folders: sortItems([...state.folders, optimistic]) }));
      return runChange({
        kind: 'createFolder',
        payload: { title, masterParentId },
        collectionId: get().activeCollectionId,
        tempMasterId,
      });
    },

    updateFolder: async (masterId, data) => {
      set(state => ({
        folders: state.folders.map(f =>
          f.masterId === masterId
            ? { ...f, title: data.title ?? f.title, masterParentId: data.masterParentId !== undefined ? data.masterParentId : f.masterParentId }
            : f
        ),
      }));
      return runChange({
        kind: 'updateFolder',
        payload: { masterId, ...data },
        collectionId: get().activeCollectionId,
      });
    },

    deleteFolder: async (masterId) => {
      set(state => {
        const doomed = descendantIds(masterId, state.folders);
        return {
          folders: state.folders.filter(f => !doomed.has(f.masterId)),
          bookmarks: state.bookmarks.filter(b => !(b.masterParentId && doomed.has(b.masterParentId))),
        };
      });
      return runChange({
        kind: 'deleteFolder',
        payload: { masterId },
        collectionId: get().activeCollectionId,
      });
    },

    createCollection: async (name, description) => {
      const response = await api.createCollection(name, description);
      if (response.success) {
        await get().fetchCollections();
        return { success: true };
      }
      return { success: false, error: response.error?.message || 'Failed to create collection' };
    },

    renameCollection: async (collectionId, name, description) => {
      const response = await api.updateCollection(collectionId, { name, description });
      if (response.success) {
        await get().fetchCollections();
        return { success: true };
      }
      return { success: false, error: response.error?.message || 'Failed to rename collection' };
    },

    archiveCollection: async (collectionId) => {
      const response = await api.archiveCollection(collectionId);
      if (response.success) {
        if (get().activeCollectionId === collectionId) await get().setActiveCollection(null);
        await get().fetchCollections();
        return { success: true };
      }
      return { success: false, error: response.error?.message || 'Failed to archive collection' };
    },

    deleteCollection: async (collectionId) => {
      const response = await api.deleteCollection(collectionId);
      if (response.success) {
        if (get().activeCollectionId === collectionId) await get().setActiveCollection(null);
        await get().fetchCollections();
        return { success: true };
      }
      return { success: false, error: response.error?.message || 'Failed to delete collection' };
    },
  };
});
