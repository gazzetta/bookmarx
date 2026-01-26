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
        
        // Include premium info in the user object
        (req as Request & { user?: AuthenticatedUser }).user = {
            id: payload.sub,
            email: payload.email,
            subscriptionTier: user.subscriptionTier || 'free',
            subscriptionExpiresAt: user.subscriptionExpiresAt || null,
            bookmarkLimit: user.bookmarkLimit || 250,
            browserLimit: user.browserLimit || 2,
            collectionLimit: user.collectionLimit || 1,
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
