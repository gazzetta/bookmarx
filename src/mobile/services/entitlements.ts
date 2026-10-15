import type { User, UserStats } from '../types';

export function hasPremium(user: User | null): boolean {
  if (!user || user.isPremium === false) return false;
  const expiry = user.subscriptionExpiresAt != null
    ? user.subscriptionExpiresAt * 1000
    : user.subscriptionEndsAt ? Date.parse(user.subscriptionEndsAt) : null;
  if (expiry && expiry <= Date.now()) return false;
  if (user.isPremium !== undefined) return user.isPremium;
  return user.subscriptionTier === 'premium' || user.subscriptionTier === 'lifetime';
}

export function normalizeStats(data: Partial<UserStats> | undefined, user: User): UserStats {
  return {
    bookmarkCount: data?.bookmarkCount ?? 0,
    folderCount: data?.folderCount ?? 0,
    browserCount: data?.browserCount ?? 0,
    collectionCount: data?.collectionCount ?? 0,
    limits: {
      maxBookmarks: data?.limits?.maxBookmarks ?? user.bookmarkLimit ?? null,
      maxBrowsers: data?.limits?.maxBrowsers ?? user.browserLimit ?? null,
      maxCollections: data?.limits?.maxCollections ?? user.collectionLimit ?? null,
    },
    isPremium: hasPremium(user),
    subscriptionTier: user.subscriptionTier ?? 'free',
  };
}
