import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db/database';

interface AuthPayload {
    sub: string;
    email: string;
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

// Emails that are always treated as premium (e.g. admin/test accounts)
const ALWAYS_PREMIUM_EMAILS = [
    'gas@gasdigital.co.uk',
];

const isAlwaysPremiumEmail = (email: string): boolean =>
    ALWAYS_PREMIUM_EMAILS.includes(email.toLowerCase());

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
    // Test bypass for local development - check for X-Test-User-Id header
    const testUserId = req.headers['x-test-user-id'] as string;
    if (process.env.NODE_ENV !== 'production' && testUserId && testUserId.startsWith('test_')) {
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

        // Get latest app config for dynamic limits
        const config = db.getAppConfig();
        const alwaysPremium = isAlwaysPremiumEmail(payload.email);
        const tier = alwaysPremium ? 'premium' : ((user.subscriptionTier || 'free') as 'free' | 'premium');
        const tierLimits = config.limits[tier] || config.limits.free;

        // Effective limit is defined SOLELY by the tier settings
        // We ignore any legacy hardcoded limits in the user table
        const effectiveBookmarkLimit = tierLimits.bookmarks;
        const effectiveBrowserLimit = tierLimits.browsers;
        const effectiveCollectionLimit = tierLimits.collections;

        // Include premium info in the user object
        (req as Request & { user?: AuthenticatedUser }).user = {
            id: payload.sub,
            email: payload.email,
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
