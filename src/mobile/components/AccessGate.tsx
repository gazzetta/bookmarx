import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import { destinationFor } from '../services/access';

/** Reachable without signing in. */
const PUBLIC_ROUTES = new Set(['login', 'register', 'forgot-password', 'reset-password']);
/**
 * Reachable by any signed-in account, whatever its access level: verification,
 * membership status, account settings, the legacy /upgrade redirect, and the
 * share target (which keeps a pending share intent alive behind its own gate).
 */
const ACCOUNT_ROUTES = new Set([
  ...PUBLIC_ROUTES, 'verify-email', 'membership', 'settings', 'upgrade', 'share',
]);

/**
 * Central route guard for the library. Every folder/edit/search/collections/
 * history route requires the 'allowed' access level — hiding navigation
 * controls alone is not enforcement.
 */
export function AccessGate() {
  const router = useRouter();
  const segments = useSegments();
  const access = useAuthStore(state => state.access);
  const path = segments.join('/');

  useEffect(() => {
    if (access === 'loading') return;
    const top = segments[0] ?? 'index';
    const destination = destinationFor(access);
    if (!destination) return;
    if (access === 'signed-out') {
      if (!PUBLIC_ROUTES.has(top) && top !== 'share') router.replace('/login');
      return;
    }
    if (access === 'allowed') {
      // A signed-in, eligible account has no reason to sit on an auth screen.
      if (top === 'login' || top === 'register') router.replace('/');
      return;
    }
    // 'verify-email' and 'membership': account screens stay reachable,
    // everything library-shaped bounces to the blocking screen.
    if (!ACCOUNT_ROUTES.has(top)) router.replace(destination);
  }, [access, path]);

  return null;
}
