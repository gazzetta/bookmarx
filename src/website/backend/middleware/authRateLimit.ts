import type { RequestHandler } from 'express';
import { createHash } from 'crypto';
import { db } from '../db/database';

export const authRateLimit: RequestHandler = (req, res, next) => {
    if (req.method === 'GET') return next();
    const limit = process.env.NODE_ENV === 'production' ? 30 : 1000;
    const ip = createHash('sha256').update(req.ip || req.socket.remoteAddress || 'unknown').digest('hex');
    if (!db.consumeAuthAttempt(`auth:${ip}`, limit, 900)) {
        res.set('Retry-After', '900');
        return res.status(429).json({ success: false, error: { code: 'AUTH_RATE_LIMIT', message: 'Too many attempts. Please try again later.' } });
    }
    return next();
};
