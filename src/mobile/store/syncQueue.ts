import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { STORAGE_KEYS } from '../constants/config';
import { api } from '../services/api';
import type { QueuedChange } from '../types';

type ReplayCallback = (change: QueuedChange, result: any) => void;

interface SyncQueueStore {
  queue: QueuedChange[];
  isOnline: boolean;
  isReplaying: boolean;
  /** Server-side failures from the most recent replay (dropped changes). */
  lastDroppedCount: number;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  setOnline: (online: boolean) => void;
  enqueue: (change: Omit<QueuedChange, 'queueId' | 'queuedAt'>) => Promise<QueuedChange>;
  clearDroppedFlag: () => void;
  replay: (onApplied?: ReplayCallback) => Promise<void>;
}

async function persist(queue: QueuedChange[]) {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify(queue));
  } catch (error) {
    console.error('Failed to persist sync queue:', error);
  }
}

async function applyQueued(change: QueuedChange) {
  const p = change.payload as any;
  const collectionId = change.collectionId;
  switch (change.kind) {
    case 'createBookmark':
      return api.createBookmark({ url: p.url, title: p.title, masterParentId: p.masterParentId }, collectionId);
    case 'updateBookmark':
      return api.updateBookmark(p.masterId, { title: p.title, url: p.url, masterParentId: p.masterParentId }, collectionId);
    case 'deleteBookmark':
      return api.deleteBookmark(p.masterId, collectionId);
    case 'createFolder':
      return api.createFolder(p.title, p.masterParentId ?? null, collectionId);
    case 'updateFolder':
      return api.updateFolder(p.masterId, { title: p.title, masterParentId: p.masterParentId }, collectionId);
    case 'deleteFolder':
      return api.deleteFolder(p.masterId, collectionId);
    default:
      return { success: false, error: { message: 'Unknown queued change' } };
  }
}

export const useSyncQueue = create<SyncQueueStore>((set, get) => ({
  queue: [],
  isOnline: true,
  isReplaying: false,
  lastDroppedCount: 0,
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.SYNC_QUEUE);
      const queue = raw ? (JSON.parse(raw) as QueuedChange[]) : [];
      set({ queue, hydrated: true });
    } catch (error) {
      console.error('Failed to load sync queue:', error);
      set({ hydrated: true });
    }
  },

  setOnline: (online) => {
    const wasOffline = !get().isOnline;
    set({ isOnline: online });
    if (online && wasOffline && get().queue.length > 0) {
      void get().replay();
    }
  },

  enqueue: async (change) => {
    const queued: QueuedChange = {
      ...change,
      queueId: Crypto.randomUUID(),
      queuedAt: Date.now(),
    };
    const queue = [...get().queue, queued];
    set({ queue });
    await persist(queue);
    return queued;
  },

  clearDroppedFlag: () => set({ lastDroppedCount: 0 }),

  replay: async (onApplied) => {
    const { isReplaying, isOnline } = get();
    if (isReplaying || !isOnline) return;
    set({ isReplaying: true });

    let dropped = 0;
    try {
      // Re-read inside loop: queue shrinks as entries flush.
      for (;;) {
        const [next, ...rest] = get().queue;
        if (!next) break;

        const response = await applyQueued(next);
        if (response.success) {
          set({ queue: rest });
          await persist(rest);
          onApplied?.(next, response.data);
          continue;
        }

        if (response.error?.code === 'NETWORK_ERROR') {
          // Still effectively offline — stop, keep the rest queued.
          break;
        }

        // Server rejected the change (item gone elsewhere, limit hit, …).
        // Drop it rather than retry-loop; count it for the UI summary.
        dropped += 1;
        set({ queue: rest });
        await persist(rest);
      }
    } finally {
      set({ isReplaying: false, lastDroppedCount: dropped });
    }
  },
}));
