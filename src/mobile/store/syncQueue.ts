import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { STORAGE_KEYS } from '../constants/config';
import { api } from '../services/api';
import { accountKey, getSession, isCurrentSession, subscribeSession } from '../services/session';
import { writeStorage } from '../services/storage';
import type { QueuedChange } from '../types';

export interface QueueOutcome { success: boolean; error?: string; masterId?: string }
type QueueEvent = { change: QueuedChange; outcome: QueueOutcome };
const listeners = new Set<(event: QueueEvent) => void | Promise<void>>();
export function subscribeQueue(listener: (event: QueueEvent) => void | Promise<void>) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * Server rejections that mean the account lost library access — never proof
 * that the edit itself is invalid. The queue pauses and keeps the change so it
 * can replay if access is restored (verification completed, renewal, etc.).
 */
const ACCESS_DENIED_CODES = new Set(['EMAIL_NOT_VERIFIED', 'PREMIUM_REQUIRED', 'SUBSCRIPTION_EXPIRED']);
const isAccessDenied = (error?: { code?: string; status?: number }) =>
  !!error && (ACCESS_DENIED_CODES.has(error.code ?? ''));

type AccessDeniedHandler = () => void;
let accessDeniedHandler: AccessDeniedHandler | null = null;
/** Registered by the auth store so a server-side denial triggers revalidation. */
export function setAccessDeniedHandler(handler: AccessDeniedHandler | null) {
  accessDeniedHandler = handler;
}

interface SyncQueueStore {
  queue: QueuedChange[];
  isOnline: boolean;
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  isReplaying: boolean;
  lastDroppedCount: number;
  lastError: string | null;
  outcomes: Record<string, QueueOutcome>;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setOnline: (online: boolean) => void;
  enqueue: (change: Omit<QueuedChange, 'queueId' | 'queuedAt'>) => Promise<QueuedChange>;
  clearDroppedFlag: () => void;
  replay: () => Promise<void>;
}

let running: { session: ReturnType<typeof getSession>; promise: Promise<void> } | null = null;
let hydration: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = 1000;
const aliases = new Map<string, string>();
const resolvePayload = (payload: Record<string, unknown>) => ({
  ...payload,
  ...(typeof payload.masterId === 'string' ? { masterId: aliases.get(payload.masterId) ?? payload.masterId } : {}),
  ...(typeof payload.masterParentId === 'string' ? { masterParentId: aliases.get(payload.masterParentId) ?? payload.masterParentId } : {}),
});
function cancelRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

export const useSyncQueue = create<SyncQueueStore>((set, get) => {
  let mutations: Promise<void> = Promise.resolve();
  const changeQueue = (transform: (queue: QueuedChange[]) => QueuedChange[]) => {
    const session = getSession();
    const task = mutations.then(async () => {
      if (!isCurrentSession(session)) throw new Error('Your account changed. Please try again.');
      const next = transform(get().queue);
      // Publish only after the complete queue transition is durable. Concurrent
      // enqueues wait here instead of persisting a partially acknowledged queue.
      await writeStorage(accountKey(STORAGE_KEYS.SYNC_QUEUE, session), next);
      if (!isCurrentSession(session)) throw new Error('Your account changed. Please try again.');
      set({ queue: next });
    });
    mutations = task.catch(() => {});
    return task;
  };
  const notify = async (change: QueuedChange, outcome: QueueOutcome) => {
    const outcomes = Object.fromEntries(Object.entries({ ...get().outcomes, [change.queueId]: outcome }).slice(-100));
    set({ outcomes });
    await Promise.all([...listeners].map(listener => listener({ change, outcome })));
  };
  const scheduleRetry = () => {
    if (retryTimer || !getSession().userId || !get().isOnline || !get().enabled || !get().queue.length) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void get().replay();
    }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 60000);
  };

  return {
    queue: [], isOnline: true, enabled: false, isReplaying: false, lastDroppedCount: 0,
    lastError: null, outcomes: {}, hydrated: false,

    hydrate: () => {
      if (get().hydrated) return Promise.resolve();
      if (hydration) return hydration;
      const session = getSession();
      if (!session.userId) return Promise.resolve();
      const task = (async () => {
        // A read failure must not turn an existing durable queue into an empty queue.
        const raw = await AsyncStorage.getItem(accountKey(STORAGE_KEYS.SYNC_QUEUE, session));
        const queue: QueuedChange[] = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(queue)) throw new Error('Saved changes could not be read');
        if (isCurrentSession(session)) set({ queue, hydrated: true });
      })();
      hydration = task;
      void task.finally(() => { if (hydration === task) hydration = null; }).catch(() => {});
      return task;
    },

    setEnabled: enabled => {
      set({ enabled });
      if (enabled) void get().replay();
      else cancelRetry();
    },

    setOnline: online => {
      set({ isOnline: online });
      if (!online) cancelRetry();
      else if (get().hydrated && get().queue.length) void get().replay();
    },

    enqueue: async change => {
      const session = getSession();
      if (!session.userId) throw new Error('Sign in to save changes');
      await get().hydrate();
      if (!isCurrentSession(session)) throw new Error('Your account changed. Please try again.');
      const queued: QueuedChange = { ...change, payload: resolvePayload(change.payload), queueId: Crypto.randomUUID(), queuedAt: Date.now() };
      try {
        await changeQueue(queue => [...queue, { ...queued, payload: resolvePayload(queued.payload) }]);
      } catch {
        throw new Error('Could not save this change on your device. Please try again.');
      }
      return queued;
    },

    clearDroppedFlag: () => set({ lastDroppedCount: 0 }),

    replay: () => {
      const session = getSession();
      if (!session.userId || !get().hydrated || !get().isOnline || !get().enabled) return Promise.resolve();
      if (running?.session === session) return running.promise;
      cancelRetry();
      set({ isReplaying: true, lastError: null });
      const task = (async () => {
        try {
          while (isCurrentSession(session) && get().isOnline && get().enabled) {
            const next = get().queue[0];
            if (!next) break;
            const response = await api.applyQueuedChange(next);
            if (!isCurrentSession(session)) return;
            if (!response.success && isAccessDenied(response.error)) {
              // Entitlement or verification was revoked server-side. Pause the
              // queue intact — the change belongs to the account and replays
              // only if a fresh check restores access.
              set({ lastError: response.error?.message || 'Your account no longer has access' });
              get().setEnabled(false);
              accessDeniedHandler?.();
              break;
            }
            if (!response.success && (response.error?.retryable || response.error?.code === 'NETWORK_ERROR' || response.error?.status === 401)) {
              set({ lastError: response.error?.message || 'Sync will retry shortly' });
              break;
            }
            const masterId = response.data?.results?.[0]?.masterId as string | undefined;
            if (response.success && next.tempMasterId && !masterId) {
              set({ lastError: 'The server did not confirm the saved item. Sync will retry.' });
              break;
            }
            // Read the LIVE queue after the request, preserving concurrent enqueues.
            const rejected: QueuedChange[] = [];
            await changeQueue(queue => {
              let remaining = queue.filter(c => c.queueId !== next.queueId);
              if (response.success && next.tempMasterId && masterId) {
                aliases.set(next.tempMasterId, masterId);
                remaining = remaining.map(change => ({ ...change, payload: {
                  ...change.payload,
                  ...(change.payload.masterId === next.tempMasterId ? { masterId } : {}),
                  ...(change.payload.masterParentId === next.tempMasterId ? { masterParentId: masterId } : {}),
                } }));
              } else if (!response.success && next.tempMasterId) {
                // Children cannot be saved into a folder the server rejected.
                const missing = new Set([next.tempMasterId]);
                let changed = true;
                while (changed) {
                  changed = false;
                  remaining = remaining.filter(change => {
                    if (!missing.has(String(change.payload.masterParentId)) && !missing.has(String(change.payload.masterId))) return true;
                    rejected.push(change);
                    if (change.tempMasterId) missing.add(change.tempMasterId);
                    changed = true;
                    return false;
                  });
                }
              }
              return remaining;
            });
            if (!isCurrentSession(session)) return;
            const outcome = { success: response.success, masterId, error: response.error?.message };
            await notify(next, outcome);
            for (const child of rejected) await notify(child, { success: false, error: 'The destination folder could not be saved' });
            if (!response.success) set({ lastDroppedCount: get().lastDroppedCount + 1 + rejected.length });
            retryDelay = 1000;
          }
        } catch (error) {
          if (isCurrentSession(session)) set({ lastError: error instanceof Error ? error.message : 'Sync could not finish' });
        } finally {
          if (isCurrentSession(session)) {
            set({ isReplaying: false });
            scheduleRetry();
          }
        }
      })();
      running = { session, promise: task };
      void task.finally(() => { if (running?.promise === task) running = null; }).catch(() => {});
      return task;
    },
  };
});

subscribeSession(() => {
  cancelRetry();
  retryDelay = 1000;
  aliases.clear();
  hydration = null;
  running = null;
  useSyncQueue.setState({ queue: [], hydrated: false, enabled: false, isReplaying: false, lastDroppedCount: 0, lastError: null, outcomes: {} });
});
