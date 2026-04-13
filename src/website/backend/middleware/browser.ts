import { Response, NextFunction } from 'express';
import { db } from '../db/database';
import { SyncRequest, InitialSyncRequest } from '../types/sync';
import { AuthenticatedRequest } from './premium';

/**
 * Middleware to register or update browser last seen activity
 * This should run after checkBrowserLimit but before other business logic
 * so that valid browsers are counted even if the sync action fails later (e.g. bookmark limit)
 */
export const registerBrowserActivity = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const user = req.user;
        if (!user) return next();

        const body = req.body as (SyncRequest | InitialSyncRequest);

        // Handle both SyncRequest (body.metadata) and regular requests where metadata might be elsewhere
        const metadata = 'metadata' in body ? body.metadata : undefined;

        if (metadata?.deviceInfo) {
            const { deviceInfo } = metadata;
            db.registerBrowser({
                browserInstanceId: deviceInfo.browserInstanceId,
                userId: user.id,
                deviceId: deviceInfo.deviceId,
                browser: deviceInfo.browser,
                browserVersion: deviceInfo.browserVersion,
                os: deviceInfo.os,
                osVersion: deviceInfo.osVersion,
                userAgent: metadata.userAgent
            });
            console.log(`[BrowserActivity] Registered/Updated activity for browser ${deviceInfo.browserInstanceId}`);
        }
    } catch (error) {
        console.error('[BrowserActivity] Failed to register browser activity:', error);
        // Don't block the request if this tracking fails
    }
    next();
};
