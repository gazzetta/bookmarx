import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db/database';

interface AuthPayload {
    sub: string;
    email: string;
}

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
    // Test bypass for local development - check for X-Test-User-Id header
    const testUserId = req.headers['x-test-user-id'] as string;
    if (process.env.NODE_ENV !== 'production' && testUserId && testUserId.startsWith('test_')) {
        console.log(`[AUTH] Test bypass enabled for user: ${testUserId}`);
        (req as Request & { user?: { id: string; email: string } }).user = {
            id: testUserId,
            email: `${testUserId}@test.local`
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
        
        (req as Request & { user?: { id: string; email: string } }).user = {
            id: payload.sub,
            email: payload.email
        };
        return next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            error: { message: 'Invalid or expired token' }
        });
    }
};
