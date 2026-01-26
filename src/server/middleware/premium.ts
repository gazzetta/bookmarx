import { Request, Response, NextFunction } from 'express';
import { db } from '../db/database';

export interface PremiumUser {
    id: string;
    email: string;
    subscriptionTier: 'free' | 'premium';
    subscriptionExpiresAt: number | null;
    bookmarkLimit: number;
    browserLimit: number;
    collectionLimit: number;
    polarCustomerId: string | null;
}

export interface AuthenticatedRequest extends Request {
    user?: PremiumUser;
}

/**
 * Middleware to require premium subscription
 */
export function requirePremium(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const user = req.user;

    if (!user) {
        return res.status(401).json({
            success: false,
            error: {
                code: 'UNAUTHORIZED',
                message: 'Authentication required'
            }
        });
    }

    if (user.subscriptionTier !== 'premium') {
        return res.status(403).json({
            success: false,
            error: {
                code: 'PREMIUM_REQUIRED',
                message: 'This feature requires a premium subscription',
                upgradeUrl: 'https://bookmarx.io/upgrade'
            }
        });
    }

    // Check expiration (null means lifetime or free)
    if (user.subscriptionExpiresAt && user.subscriptionExpiresAt < Date.now() / 1000) {
        return res.status(403).json({
            success: false,
            error: {
                code: 'SUBSCRIPTION_EXPIRED',
                message: 'Your premium subscription has expired',
                upgradeUrl: 'https://bookmarx.io/upgrade'
            }
        });
    }

    next();
}

/**
 * Middleware to check bookmark limit before creating new bookmarks
 */
export function checkBookmarkLimit(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const user = req.user;

    if (!user) {
        return res.status(401).json({
            success: false,
            error: {
                code: 'UNAUTHORIZED',
                message: 'Authentication required'
            }
        });
    }

    const currentCount = db.getBookmarkCount(user.id);

    // Check how many new bookmarks are being added
    const newBookmarks = req.body?.bookmarks?.length || 0;
    const changes = req.body?.changes?.filter((c: any) => c.type === 'CREATE' && c.data?.type === 'bookmark')?.length || 0;
    const totalNew = newBookmarks + changes;

    if (currentCount + totalNew > user.bookmarkLimit) {
        return res.status(403).json({
            success: false,
            error: {
                code: 'BOOKMARK_LIMIT_REACHED',
                message: `You've reached your limit of ${user.bookmarkLimit} bookmarks. Upgrade to premium for 10,000 bookmarks.`,
                currentCount,
                limit: user.bookmarkLimit,
                attemptedToAdd: totalNew,
                upgradeUrl: 'https://bookmarx.io/upgrade'
            }
        });
    }

    next();
}

/**
 * Middleware to check browser limit before registering new browser
 */
export function checkBrowserLimit(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const user = req.user;

    if (!user) {
        return res.status(401).json({
            success: false,
            error: {
                code: 'UNAUTHORIZED',
                message: 'Authentication required'
            }
        });
    }

    const browserInstanceId = req.body?.metadata?.deviceInfo?.browserInstanceId;
    if (!browserInstanceId) {
        return next(); // Can't check without browserInstanceId
    }

    // Check if this browser is already registered
    const existingBrowser = db.getBrowserByInstanceId(browserInstanceId, user.id);
    if (existingBrowser) {
        return next(); // Already registered, allow
    }

    // Count current browsers
    const browserCount = db.getBrowserCount(user.id);

    if (browserCount >= user.browserLimit) {
        return res.status(403).json({
            success: false,
            error: {
                code: 'BROWSER_LIMIT_REACHED',
                message: `You can only sync ${user.browserLimit} browser(s). Upgrade to premium for unlimited browsers.`,
                currentCount: browserCount,
                limit: user.browserLimit,
                upgradeUrl: 'https://bookmarx.io/upgrade'
            }
        });
    }

    next();
}

/**
 * Middleware to check collection limit before creating new collection
 */
export function checkCollectionLimit(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const user = req.user;

    if (!user) {
        return res.status(401).json({
            success: false,
            error: {
                code: 'UNAUTHORIZED',
                message: 'Authentication required'
            }
        });
    }

    const collectionCount = db.getCollectionCount(user.id);

    if (collectionCount >= user.collectionLimit) {
        return res.status(403).json({
            success: false,
            error: {
                code: 'COLLECTION_LIMIT_REACHED',
                message: `You can only have ${user.collectionLimit} collection(s). Upgrade to premium for unlimited collections.`,
                currentCount: collectionCount,
                limit: user.collectionLimit,
                upgradeUrl: 'https://bookmarx.io/upgrade'
            }
        });
    }

    next();
}

/**
 * Helper to check if user is premium (for conditional logic in routes)
 */
export function isPremium(user: PremiumUser | undefined): boolean {
    if (!user) return false;
    if (user.subscriptionTier !== 'premium') return false;
    if (user.subscriptionExpiresAt && user.subscriptionExpiresAt < Date.now() / 1000) return false;
    return true;
}
