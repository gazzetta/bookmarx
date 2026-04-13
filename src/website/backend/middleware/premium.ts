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
        const config = db.getAppConfig();
        const premiumTitle = config.branding.premiumTitle;

        return res.status(403).json({
            success: false,
            error: {
                code: 'PREMIUM_REQUIRED',
                message: `This feature requires a ${premiumTitle} subscription`,
                upgradeUrl: 'https://bookmarx.gasdigital.co.uk/upgrade'
            }
        });
    }

    // Check expiration (null means lifetime or free)
    if (user.subscriptionExpiresAt && user.subscriptionExpiresAt < Date.now() / 1000) {
        const config = db.getAppConfig();
        const premiumTitle = config.branding.premiumTitle;

        return res.status(403).json({
            success: false,
            error: {
                code: 'SUBSCRIPTION_EXPIRED',
                message: `Your ${premiumTitle} subscription has expired`,
                upgradeUrl: 'https://bookmarx.gasdigital.co.uk/upgrade'
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

    console.log('[checkBookmarkLimit] Starting check...');

    if (!user) {
        console.log('[checkBookmarkLimit] No user - returning 401');
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

    console.log('[checkBookmarkLimit] Current:', currentCount, 'Adding:', totalNew, 'Limit:', user.bookmarkLimit);

    if (currentCount + totalNew > user.bookmarkLimit) {
        // Get centralized settings for dynamic messaging
        const config = db.getAppConfig();
        const premiumLimit = config.limits.premium.bookmarks;
        const premiumTitle = config.branding.premiumTitle;

        console.log('[checkBookmarkLimit] LIMIT EXCEEDED - returning 403');
        return res.status(403).json({
            success: false,
            error: {
                code: 'BOOKMARK_LIMIT_REACHED',
                message: `You have ${currentCount.toLocaleString()} bookmarks but the free plan only allows ${user.bookmarkLimit.toLocaleString()}. Upgrade to ${premiumTitle} for ${premiumLimit.toLocaleString()} bookmarks.`,
                currentCount,
                limit: user.bookmarkLimit,
                premiumLimit,
                attemptedToAdd: totalNew,
                upgradeUrl: 'https://bookmarx.gasdigital.co.uk/upgrade'
            }
        });
    }

    console.log('[checkBookmarkLimit] Under limit - allowing');
    next();
}

/**
 * Middleware to check browser limit before registering new browser
 * Also implements abuse prevention via fingerprinting
 */
export function checkBrowserLimit(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const user = req.user;

    console.log('[checkBrowserLimit] Starting check...');

    if (!user) {
        console.log('[checkBrowserLimit] No user found - returning 401');
        return res.status(401).json({
            success: false,
            error: {
                code: 'UNAUTHORIZED',
                message: 'Authentication required'
            }
        });
    }

    console.log('[checkBrowserLimit] User:', user.id, 'Tier:', user.subscriptionTier, 'Limit:', user.browserLimit);

    const browserInstanceId = req.body?.metadata?.deviceInfo?.browserInstanceId;
    if (!browserInstanceId) {
        console.log('[checkBrowserLimit] No browserInstanceId - allowing through');
        return next(); // Can't check without browserInstanceId
    }

    console.log('[checkBrowserLimit] Browser Instance ID:', browserInstanceId);

    // Check if this exact browser instance is already registered
    const existingBrowser = db.getBrowserByInstanceId(browserInstanceId);
    console.log('[checkBrowserLimit] Existing browser:', existingBrowser ? 'Yes' : 'No');

    if (existingBrowser && existingBrowser.userId === user.id) {
        console.log('[checkBrowserLimit] Already registered to this user - allowing');
        return next(); // Already registered to this user, allow
    }

    // Count current browsers
    const browserCount = db.getBrowserCount(user.id);
    console.log('[checkBrowserLimit] Current browser count:', browserCount, 'Limit:', user.browserLimit);

    // Premium users have unlimited browsers
    if (user.subscriptionTier === 'premium' && (!user.subscriptionExpiresAt || user.subscriptionExpiresAt > Date.now() / 1000)) {
        console.log('[checkBrowserLimit] Premium user - allowing');
        return next();
    }

    // Check if under the limit
    if (browserCount < user.browserLimit) {
        console.log('[checkBrowserLimit] Under limit - allowing');
        return next();
    }

    console.log('[checkBrowserLimit] At or over limit, checking abuse prevention...');
    // Check for potential abuse: same fingerprint trying to register multiple times
    const deviceInfo = req.body?.metadata?.deviceInfo;

    if (deviceInfo) {
        const fingerprint = createBrowserFingerprint(deviceInfo);
        const existingByFingerprint = db.getBrowserByFingerprint(user.id, fingerprint);

        if (existingByFingerprint) {
            // Same device trying to re-register - might be abuse
            // Or legitimately cleared browser data - allow but log
            console.warn(`Potential abuse detected: User ${user.id} attempting to register browser with same fingerprint. Existing: ${existingByFingerprint.browserInstanceId}, New: ${browserInstanceId}`);

            // For now, auto-replace the old registration to be user-friendly
            // This prevents abuse while not blocking legitimate use cases
            db.deleteBrowser(existingByFingerprint.browserInstanceId, user.id);
            console.log(`Auto-removed old browser registration ${existingByFingerprint.browserInstanceId} to make room for new one`);
            return next();
        }
    }

    // Get centralized settings for rate limits and messaging
    const config = db.getAppConfig();
    const rateLimit = config.abusePrevention.browserRegistrationRateLimit;
    const ratePeriodDays = config.abusePrevention.browserRegistrationRatePeriodDays;
    const premiumTitle = config.branding.premiumTitle;
    const premiumBrowserLimit = config.limits.premium.browsers;

    // Check rate limiting for new browser registrations
    const recentRegistrations = db.getRecentBrowserRegistrations(user.id, ratePeriodDays);
    if (recentRegistrations >= rateLimit) {
        return res.status(429).json({
            success: false,
            error: {
                code: 'BROWSER_REGISTRATION_RATE_LIMITED',
                message: `You've registered too many browsers in the last ${ratePeriodDays} days. Please remove a browser or upgrade to ${premiumTitle}.`,
                registrationsThisPeriod: recentRegistrations,
                limit: rateLimit,
                periodDays: ratePeriodDays,
                upgradeUrl: 'https://bookmarx.gasdigital.co.uk/upgrade'
            }
        });
    }

    return res.status(403).json({
        success: false,
        error: {
            code: 'BROWSER_LIMIT_REACHED',
            message: `You've reached your limit of ${user.browserLimit} browser(s). Upgrade to ${premiumTitle} for up to ${premiumBrowserLimit} browsers.`,
            currentCount: browserCount,
            limit: user.browserLimit,
            premiumLimit: premiumBrowserLimit,
            upgradeUrl: 'https://bookmarx.gasdigital.co.uk/upgrade'
        }
    });
}

/**
 * Create a fingerprint from browser/device info for abuse detection
 */
function createBrowserFingerprint(deviceInfo: any): string {
    // Create a fingerprint from stable device characteristics
    const parts = [
        deviceInfo.browser || '',
        deviceInfo.os || '',
        deviceInfo.osVersion || '',
        // Note: browserVersion excluded as it changes frequently
    ].map(p => String(p).toLowerCase().trim());

    return parts.join('|');
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
        // Get centralized settings for messaging
        const config = db.getAppConfig();
        const premiumTitle = config.branding.premiumTitle;
        const premiumCollectionLimit = config.limits.premium.collections;

        return res.status(403).json({
            success: false,
            error: {
                code: 'COLLECTION_LIMIT_REACHED',
                message: `You can only have ${user.collectionLimit} collection(s). Upgrade to ${premiumTitle} for up to ${premiumCollectionLimit} collections.`,
                currentCount: collectionCount,
                limit: user.collectionLimit,
                premiumLimit: premiumCollectionLimit,
                upgradeUrl: 'https://bookmarx.gasdigital.co.uk/upgrade'
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
