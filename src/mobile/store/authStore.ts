import { create } from 'zustand';
import { authService } from '../services/auth';
import { api } from '../services/api';
import { getSession, isCurrentSession, setSessionUser } from '../services/session';
import { hasPremium, normalizeStats } from '../services/entitlements';
import {
  evaluateAccess, readValidationMarker, writeValidationMarker,
  type AccessLevel, type AccessReason,
} from '../services/access';
import { useBookmarkStore } from './bookmarkStore';
import { useSyncQueue, subscribeQueue, setAccessDeniedHandler } from './syncQueue';
import type { User, UserStats } from '../types';

interface AuthStore {
  token: string | null;
  user: User | null;
  stats: UserStats | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isPremium: boolean;
  /** Central library-access level; the route gate and sync queue both honor it. */
  access: AccessLevel;
  accessReason: AccessReason;
  /** True when registration reported the verification email could NOT be sent. */
  emailDeliveryFailed: boolean;
  checkAuth: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, displayName?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshStats: () => Promise<void>;
  /** Fresh /auth/me re-check used by the verify-email and membership screens. */
  revalidate: () => Promise<AccessLevel>;
}

let authRevision = 0;
const signedOut = {
  token: null, user: null, stats: null, isLoading: false, isAuthenticated: false, isPremium: false,
  access: 'signed-out' as AccessLevel, accessReason: 'none' as AccessReason, emailDeliveryFailed: false,
};

export const useAuthStore = create<AuthStore>((set, get) => {
  /**
   * Publish the access decision. Callers gate the durable sync queue via
   * gateQueue AFTER any required hydration — blocked accounts must not fetch,
   * hydrate or replay protected content.
   */
  function publishAccess(args: { isLoading: boolean; isAuthenticated: boolean; user: User | null; lastValidatedAt: number | null }) {
    const decision = evaluateAccess(args);
    set({ access: decision.level, accessReason: decision.reason });
    return decision;
  }

  function gateQueue(level: AccessLevel) {
    useSyncQueue.getState().setEnabled(level === 'allowed');
  }

  async function finishSignIn(
    user: User,
    token: string | null,
    revision: number,
    opts: { fresh?: boolean; lastValidatedAt?: number | null; verificationEmailSent?: boolean } = {}
  ) {
    if (revision !== authRevision) return false;
    setSessionUser(user.id);
    const session = getSession();
    const lastValidatedAt = opts.fresh ? Date.now() : (opts.lastValidatedAt ?? null);
    if (opts.fresh && lastValidatedAt != null) void writeValidationMarker(user.id, lastValidatedAt);
    const decision = publishAccess({ isLoading: false, isAuthenticated: true, user, lastValidatedAt });
    if (decision.level === 'allowed') {
      try {
        await useBookmarkStore.getState().hydrate();
      } catch (error) {
        if (isCurrentSession(session)) useBookmarkStore.setState({ error: error instanceof Error ? error.message : 'Your offline library could not be read' });
      }
    }
    const response = decision.level === 'allowed'
      ? await api.getUserStats()
      : { success: false as const, data: undefined, error: undefined };
    if (revision !== authRevision || !isCurrentSession(session)) return false;
    const stats = normalizeStats(response.success ? response.data : undefined, user);
    set({
      token, user, stats, isLoading: false, isAuthenticated: true, isPremium: hasPremium(user),
      emailDeliveryFailed: opts.verificationEmailSent === false,
    });
    // Hydration is complete before replay — enqueued edits belong to this account.
    gateQueue(decision.level);
    return true;
  }

  async function signIn(email: string, password: string, displayName?: string, register = false) {
    const revision = ++authRevision;
    set({ isLoading: true });
    try {
      const response = register ? await authService.register(email, password, displayName) : await authService.login(email, password);
      if (revision !== authRevision) return { success: false, error: 'Sign-in was canceled' };
      if (response.success && response.user) {
        const success = await finishSignIn(response.user, response.token ?? null, revision, {
          fresh: true,
          verificationEmailSent: (response as { verificationEmailSent?: boolean }).verificationEmailSent,
        });
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
    ...signedOut, isLoading: true, access: 'loading',
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
        // A transport failure is not proof that a saved session is invalid —
        // fall back to the stored profile and its recorded validation time.
        const user = response.success && response.data ? response.data : stored.user;
        let lastValidatedAt: number | null = null;
        if (response.success) {
          await authService.saveUser(user);
          lastValidatedAt = Date.now();
        } else {
          lastValidatedAt = await readValidationMarker(user.id);
        }
        if (revision !== authRevision) return;
        await finishSignIn(user, stored.token, revision, { fresh: response.success, lastValidatedAt });
      } catch {
        if (revision === authRevision) { setSessionUser(null); set(signedOut); }
      }
    },

    logout: async () => {
      ++authRevision;
      // Clear visible state synchronously, before awaiting SecureStore.
      setSessionUser(null);
      set(signedOut);
      useSyncQueue.getState().setEnabled(false);
      await authService.logout();
    },

    refreshStats: async () => {
      const session = getSession();
      const revision = authRevision;
      if (!session.userId) return;
      const [profile, response] = await Promise.all([api.getMe(), api.getUserStats()]);
      if (!isCurrentSession(session) || revision !== authRevision) return;
      const user = profile.success && profile.data ? profile.data : get().user;
      if (!user) return;
      let lastValidatedAt: number | null = null;
      if (profile.success) {
        await authService.saveUser(user);
        lastValidatedAt = Date.now();
        void writeValidationMarker(user.id, lastValidatedAt);
      } else {
        lastValidatedAt = await readValidationMarker(user.id);
      }
      if (!isCurrentSession(session) || revision !== authRevision) return;
      set({
        user,
        stats: normalizeStats(response.success ? response.data : get().stats ?? undefined, user),
        isPremium: hasPremium(user),
      });
      gateQueue(publishAccess({ isLoading: false, isAuthenticated: true, user, lastValidatedAt }).level);
    },

    revalidate: async () => {
      const session = getSession();
      const revision = authRevision;
      if (!session.userId) return get().access;
      const profile = await api.getMe();
      if (!isCurrentSession(session) || revision !== authRevision) return get().access;
      if (!profile.success || !profile.data) {
        return get().access;
      }
      const user = profile.data;
      await authService.saveUser(user);
      const lastValidatedAt = Date.now();
      void writeValidationMarker(user.id, lastValidatedAt);
      if (!isCurrentSession(session) || revision !== authRevision) return get().access;
      const previousLevel = get().access;
      set({ user, isPremium: hasPremium(user) });
      const decision = publishAccess({ isLoading: false, isAuthenticated: true, user, lastValidatedAt });
      if (decision.level === 'allowed' && previousLevel === 'allowed') {
        // The profile did not change the decision. If the queue was paused by a
        // server denial, re-arming it here would create a deny/revalidate loop —
        // it stays paused (never dropped) until a real access change or sign-in.
        return decision.level;
      }
      if (decision.level === 'allowed') {
        // A blocked sign-in skips hydration; unlock it once access is granted.
        await useBookmarkStore.getState().hydrate().catch(() => {});
      }
      gateQueue(decision.level);
      return decision.level;
    },
  };
});

api.setUnauthorizedHandler(() => { void useAuthStore.getState().logout().catch(console.error); });
// A queued edit that the server rejects for access reasons is paused, not
// dropped — refresh the profile so the gate and queue reflect the denial.
setAccessDeniedHandler(() => { void useAuthStore.getState().revalidate().catch(console.error); });
subscribeQueue(({ outcome }) => {
  if (outcome.success && useAuthStore.getState().isAuthenticated) void useAuthStore.getState().refreshStats().catch(console.error);
});
