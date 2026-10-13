import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db/database';

interface AuthPayload {
    sub: string;
    email: string;
    tokenVersion?: number;
}

export interface AuthenticatedUser {
    id: string;
    email: string;
    subscriptionTier: 'free' | 'premium';
    subscriptionExpiresAt: number | null;
    bookmarkLimit: number;
    browserLimit: number;
    collectionLimit: number;
    polarCustomerId: string | null;
}

export const hasPremiumOverride = (userId: string): boolean =>
    (process.env.PREMIUM_USER_IDS || '').split(',').map(id => id.trim()).includes(userId);

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
    // Test bypass for local development - check for X-Test-User-Id header
    const testUserId = req.headers['x-test-user-id'] as string;
    if (process.env.NODE_ENV === 'test' && process.env.ALLOW_TEST_AUTH === '1' && testUserId && testUserId.startsWith('test_')) {
        console.log(`[AUTH] Test bypass enabled for user: ${testUserId}`);
        (req as Request & { user?: AuthenticatedUser }).user = {
            id: testUserId,
            email: `${testUserId}@test.local`,
            subscriptionTier: 'premium',  // Test users get premium
            subscriptionExpiresAt: null,
            bookmarkLimit: 10000,
            browserLimit: 999,
            collectionLimit: 999,
            polarCustomerId: null
        };
        return next();
    }

    const jwtSecret = process.env.JWT_SECRET || '';

    if (!jwtSecret) {
        return res.status(500).json({
            success: false,
            error: { message: 'JWT secret is not configured' }
        });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: { message: 'Authorization token required' }
        });
    }

    const token = authHeader.slice(7);

    try {
        const payload = jwt.verify(token, jwtSecret) as AuthPayload;
        if (typeof payload.sub !== 'string') throw new Error('Invalid token subject');

        // Verify the user still exists in the database
        const user = db.getUserById(payload.sub);
        if (!user) {
            return res.status(401).json({
                success: false,
                error: {
                    message: 'User not found',
                    code: 'USER_NOT_FOUND'
                }
            });
        }
        if ((payload.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) {
            return res.status(401).json({ success: false, error: { code: 'SESSION_REVOKED', message: 'Please sign in again' } });
        }

        // Get latest app config for dynamic limits
        const config = db.getAppConfig();
        const alwaysPremium = hasPremiumOverride(user.id);
        const validPremium = user.subscriptionTier === 'premium' && (!user.subscriptionExpiresAt || user.subscriptionExpiresAt > Date.now() / 1000);
        const tier = alwaysPremium || validPremium ? 'premium' : 'free';
        const tierLimits = config.limits[tier] || config.limits.free;

        // Effective limit is defined SOLELY by the tier settings
        // We ignore any legacy hardcoded limits in the user table
        const effectiveBookmarkLimit = tierLimits.bookmarks;
        const effectiveBrowserLimit = tierLimits.browsers;
        const effectiveCollectionLimit = tierLimits.collections;

        // Include premium info in the user object
        (req as Request & { user?: AuthenticatedUser }).user = {
            id: payload.sub,
            email: user.email,
            subscriptionTier: tier,
            subscriptionExpiresAt: alwaysPremium ? null : (user.subscriptionExpiresAt || null),
            bookmarkLimit: effectiveBookmarkLimit,
            browserLimit: effectiveBrowserLimit,
            collectionLimit: effectiveCollectionLimit,
            polarCustomerId: user.polarCustomerId || null
        };
        return next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            error: { message: 'Invalid or expired token' }
        });
    }
};
