import { create } from 'zustand';
import { authService } from '../services/auth';
import { api } from '../services/api';
import { getSession, isCurrentSession, setSessionUser } from '../services/session';
import { hasPremium, normalizeStats } from '../services/entitlements';
import { useBookmarkStore } from './bookmarkStore';
import { useSyncQueue, subscribeQueue } from './syncQueue';
import type { User, UserStats } from '../types';

interface AuthStore {
  token: string | null;
  user: User | null;
  stats: UserStats | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isPremium: boolean;
  checkAuth: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, displayName?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshStats: () => Promise<void>;
}

let authRevision = 0;
const signedOut = { token: null, user: null, stats: null, isLoading: false, isAuthenticated: false, isPremium: false };

export const useAuthStore = create<AuthStore>((set, get) => {
  async function finishSignIn(user: User, token: string | null, revision: number) {
    if (revision !== authRevision) return false;
    setSessionUser(user.id);
    const session = getSession();
    try {
      await useBookmarkStore.getState().hydrate();
    } catch (error) {
      if (isCurrentSession(session)) useBookmarkStore.setState({ error: error instanceof Error ? error.message : 'Your offline library could not be read' });
    }
    const response = await api.getUserStats();
    if (revision !== authRevision || !isCurrentSession(session)) return false;
    const stats = normalizeStats(response.success ? response.data : undefined, user);
    set({ token, user, stats, isLoading: false, isAuthenticated: true, isPremium: hasPremium(user) });
    // Hydration and auth must complete before any persisted mutation is replayed.
    useSyncQueue.getState().setEnabled(true);
    return true;
  }

  async function signIn(email: string, password: string, displayName?: string, register = false) {
    const revision = ++authRevision;
    set({ isLoading: true });
    try {
      const response = register ? await authService.register(email, password, displayName) : await authService.login(email, password);
      if (revision !== authRevision) return { success: false, error: 'Sign-in was canceled' };
      if (response.success && response.user) {
        const success = await finishSignIn(response.user, response.token ?? null, revision);
        return { success, ...(success ? {} : { error: 'Sign-in was canceled' }) };
      }
      set({ isLoading: false });
      return { success: false, error: response.error };
    } catch (error) {
      if (revision === authRevision) set({ isLoading: false });
      return { success: false, error: error instanceof Error ? error.message : 'Sign-in failed' };
    }
  }

  return {
    ...signedOut, isLoading: true,
    login: (email, password) => signIn(email, password),
    register: (email, password, displayName) => signIn(email, password, displayName, true),

    checkAuth: async () => {
      const revision = ++authRevision;
      set({ isLoading: true });
      try {
        const stored = await authService.getStoredAuth();
        if (revision !== authRevision) return;
        if (!stored.isAuthenticated || !stored.user) {
          setSessionUser(null);
          set(signedOut);
          return;
        }
        const response = await api.getMe();
        if (revision !== authRevision) return;
        if (!response.success && !(response.error?.retryable || response.error?.code === 'NETWORK_ERROR')) {
          await get().logout();
          return;
        }
        // A transport failure is not proof that a saved session is invalid.
        const user = response.success && response.data ? response.data.user : stored.user;
        if (response.success) await authService.saveUser(user);
        await finishSignIn(user, stored.token, revision);
      } catch {
        if (revision === authRevision) { setSessionUser(null); set(signedOut); }
      }
    },

    logout: async () => {
      ++authRevision;
      // Clear visible state synchronously, before awaiting SecureStore.
      setSessionUser(null);
      set(signedOut);
      await authService.logout();
    },

    refreshStats: async () => {
      const session = getSession();
      const revision = authRevision;
      if (!session.userId) return;
      const [profile, response] = await Promise.all([api.getMe(), api.getUserStats()]);
      if (!isCurrentSession(session) || revision !== authRevision) return;
      const user = profile.success && profile.data ? profile.data.user : get().user;
      if (!user) return;
      if (profile.success) await authService.saveUser(user);
      if (!isCurrentSession(session) || revision !== authRevision) return;
      set({ user, stats: normalizeStats(response.success ? response.data : get().stats ?? undefined, user), isPremium: hasPremium(user) });
    },
  };
});

api.setUnauthorizedHandler(() => { void useAuthStore.getState().logout().catch(console.error); });
subscribeQueue(({ outcome }) => {
  if (outcome.success && useAuthStore.getState().isAuthenticated) void useAuthStore.getState().refreshStats().catch(console.error);
});
