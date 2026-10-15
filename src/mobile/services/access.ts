import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants/config';
import { keyForAccount } from './session';
import { hasPremium } from './entitlements';
import type { User } from '../types';

/**
 * Central library-access policy. A signed-in account may open the bookmark
 * library only when the server has recently confirmed a verified email AND an
 * effective Premium entitlement. Anything else lands on a non-library screen.
 */
export type AccessLevel = 'loading' | 'signed-out' | 'verify-email' | 'membership' | 'allowed';

/** Why access is limited — lets blocked screens pick the right copy/actions. */
export type AccessReason =
  | 'none'
  | 'unverified'      // emailVerified is false or unknown
  | 'no-membership'   // server profile says no effective Premium entitlement
  | 'recheck';        // entitlement claimed but the validation window elapsed — revalidate

export interface AccessDecision { level: AccessLevel; reason: AccessReason }

/**
 * Maximum time the app may rely on the last successful server eligibility
 * check while offline. Never extends beyond a known subscription expiry —
 * hasPremium() already returns false once subscriptionExpiresAt has passed.
 */
export const OFFLINE_GRACE_MS = 24 * 60 * 60 * 1000;

export function evaluateAccess(args: {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: User | null;
  lastValidatedAt: number | null;
  now?: number;
}): AccessDecision {
  const { isLoading, isAuthenticated, user, lastValidatedAt } = args;
  const now = args.now ?? Date.now();
  if (isLoading) return { level: 'loading', reason: 'none' };
  if (!isAuthenticated || !user) return { level: 'signed-out', reason: 'none' };
  // Unknown verification status must not unlock the library — stored profiles
  // from older builds lack the field and land here for a recheck.
  if (user.emailVerified !== true) return { level: 'verify-email', reason: 'unverified' };
  if (!hasPremium(user)) return { level: 'membership', reason: 'no-membership' };
  // A Premium claim with no recent server confirmation is unproven: a new
  // login always validates online, and the grace window is bounded.
  if (lastValidatedAt == null || now > lastValidatedAt + OFFLINE_GRACE_MS) {
    return { level: 'membership', reason: 'recheck' };
  }
  return { level: 'allowed', reason: 'none' };
}

/** Route the app should sit on for a given access level. */
export function destinationFor(level: AccessLevel): '/' | '/login' | '/verify-email' | '/membership' | null {
  switch (level) {
    case 'signed-out': return '/login';
    case 'verify-email': return '/verify-email';
    case 'membership': return '/membership';
    case 'allowed': return '/';
    default: return null;
  }
}

// ---- Last-successful-validation marker (per account, AsyncStorage) ----
// Written whenever a fresh server profile arrives (login, register, /auth/me).
// Read on cold start so an offline launch can evaluate the grace window.

interface ValidationMarker { validatedAt: number }

export async function readValidationMarker(userId: string): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(keyForAccount(userId, STORAGE_KEYS.ACCESS_VALIDATION));
    const marker = raw ? JSON.parse(raw) as ValidationMarker : null;
    return typeof marker?.validatedAt === 'number' ? marker.validatedAt : null;
  } catch {
    return null;
  }
}

export async function writeValidationMarker(userId: string, validatedAt = Date.now()): Promise<void> {
  try {
    await AsyncStorage.setItem(keyForAccount(userId, STORAGE_KEYS.ACCESS_VALIDATION), JSON.stringify({ validatedAt }));
  } catch {
    // A lost marker degrades to an earlier recheck — never to wider access.
  }
}
