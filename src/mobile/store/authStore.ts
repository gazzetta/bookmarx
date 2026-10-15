import { create } from 'zustand';
import { authService } from '../services/auth';
import { api } from '../services/api';
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

const normalizeStats = (data: UserStats | null | undefined): UserStats | null =>
  data
    ? { ...data, limits: data.limits ?? { maxBookmarks: null, maxBrowsers: null, maxCollections: null } }
    : null;

export const useAuthStore = create<AuthStore>((set, get) => ({
  token: null,
  user: null,
  stats: null,
  isLoading: true,
  isAuthenticated: false,
  isPremium: false,

  checkAuth: async () => {
    set({ isLoading: true });
    const stored = await authService.getStoredAuth();

    if (stored.isAuthenticated) {
      const isValid = await authService.validateToken();
      if (!isValid) {
        await authService.logout();
        set({ token: null, user: null, stats: null, isLoading: false, isAuthenticated: false, isPremium: false });
        return;
      }

      const statsResponse = await api.getUserStats();
      set({
        token: stored.token,
        user: stored.user,
        stats: statsResponse.success ? normalizeStats(statsResponse.data) : null,
        isLoading: false,
        isAuthenticated: true,
        isPremium: statsResponse.success ? statsResponse.data?.isPremium ?? stored.isPremium : stored.isPremium,
      });
      return;
    }

    set({ token: null, user: null, stats: null, isLoading: false, isAuthenticated: false, isPremium: false });
  },

  login: async (email, password) => {
    set({ isLoading: true });
    const result = await authService.login(email, password);

    if (result.success && result.user) {
      const statsResponse = await api.getUserStats();
      const stats = statsResponse.success ? normalizeStats(statsResponse.data) : null;
      set({
        token: 'session',
        user: result.user,
        stats,
        isLoading: false,
        isAuthenticated: true,
        isPremium: stats?.isPremium ?? false,
      });
      return { success: true };
    }

    set({ isLoading: false });
    return { success: false, error: result.error };
  },

  register: async (email, password, displayName) => {
    set({ isLoading: true });
    const result = await authService.register(email, password, displayName);

    if (result.success && result.user) {
      const statsResponse = await api.getUserStats();
      const stats = statsResponse.success ? normalizeStats(statsResponse.data) : null;
      set({
        token: 'session',
        user: result.user,
        stats,
        isLoading: false,
        isAuthenticated: true,
        isPremium: stats?.isPremium ?? false,
      });
      return { success: true };
    }

    set({ isLoading: false });
    return { success: false, error: result.error };
  },

  logout: async () => {
    await authService.logout();
    set({ token: null, user: null, stats: null, isLoading: false, isAuthenticated: false, isPremium: false });
  },

  refreshStats: async () => {
    const statsResponse = await api.getUserStats();
    if (statsResponse.success && statsResponse.data) {
      set({ stats: normalizeStats(statsResponse.data), isPremium: statsResponse.data.isPremium });
    }
  },
}));

// A 401 from any API call invalidates the session — bounce to login.
api.setUnauthorizedHandler(() => {
  void useAuthStore.getState().logout();
});
