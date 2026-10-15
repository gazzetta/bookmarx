import { useAuthStore } from '../store/authStore';

/**
 * Backwards-compatible wrapper over the global auth store.
 * New code should use `useAuthStore` directly.
 */
export function useAuth() {
  const store = useAuthStore();
  return {
    token: store.token,
    user: store.user,
    stats: store.stats,
    isLoading: store.isLoading,
    isAuthenticated: store.isAuthenticated,
    isPremium: store.isPremium,
    access: store.access,
    accessReason: store.accessReason,
    emailDeliveryFailed: store.emailDeliveryFailed,
    login: store.login,
    register: store.register,
    logout: store.logout,
    checkAuth: store.checkAuth,
    refreshStats: store.refreshStats,
    revalidate: store.revalidate,
  };
}
