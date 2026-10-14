// src/server/server.ts
import express, { Request, Response, RequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { db } from './db/database';
import { InitialSyncRequest, SyncRequest } from './types/sync';
import { getBookmarkTree } from './api/bookmarks';
import { registerWithEmail, loginWithEmail, loginWithGoogle, getMe, getUserStats, forgotPassword, resetPassword } from './api/auth';
import { authenticate, AuthenticatedUser } from './middleware/auth';
import { checkBookmarkLimit, checkBrowserLimit, isPremium } from './middleware/premium';
import sessionsRouter from './api/sessions';
import collectionsRouter from './api/collections';
import paypalWebhookRouter from './api/webhooks/paypal';
import checkoutRouter from './api/checkout';
import { authRateLimit } from './middleware/authRateLimit';
import { dbReady } from './db/database';
import { applySync, importBrowserSnapshot } from './utils/syncOperations';
import { CustomError } from './utils/errors';
import bookmarkFilesRouter from './api/bookmark-files';
import { safeBookmarkUrl } from './utils/bookmarkFiles';

// Load environment variables: .env first, then .env.local as fallback for local dev
const envPath = path.resolve(process.cwd(), '.env');
const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
} else if (fs.existsSync(envLocalPath)) {
    dotenv.config({ path: envLocalPath });
} else {
    dotenv.config();
}

export const app = express();
const PORT = process.env.PORT || 3005;

// Middleware
if (process.env.TRUST_PROXY_HOPS) app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS));
app.use(cors({ origin(origin, callback) {
    const allowed = new Set([process.env.PUBLIC_BASE_URL || 'https://www.bookmarx.cc', 'https://www.bookmarx.cc']);
    if (process.env.NODE_ENV !== 'production') { allowed.add('http://localhost:3005'); allowed.add('http://localhost:3007'); }
    callback(null, !origin || allowed.has(origin) || origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://'));
} }));
// Configure helmet to work with Next.js
// Next.js requires inline scripts and eval for hydration/HMR
app.use(helmet({
  contentSecurityPolicy: false,  // Next.js manages its own CSP
  crossOriginEmbedderPolicy: false,  // Needed for Google Fonts and external resources
  crossOriginOpenerPolicy: false,  // Required for Google Sign-In popup to communicate back
  referrerPolicy: { policy: 'origin-when-cross-origin' },  // GSI needs referrer to verify origin
}));
app.use(express.json({ limit: '10mb', verify(req, _res, buffer) {
    if ((req as Request).url.startsWith('/api/webhooks/')) (req as any).rawBody = buffer.toString('utf8');
} }));
app.use(async (_req, res, next) => {
    try { await dbReady; next(); } catch { res.status(503).json({ success: false, error: { message: 'Database migrations failed; service unavailable' } }); }
});
app.use('/api/v1/auth', authRateLimit);

/**
 * Resolve which collection to use for sync operations.
 * Reads X-Collection-ID header; falls back to the user's default collection.
 * Returns null with an error response already sent if resolution fails.
 */
function resolveCollectionForSync(req: Request, res: Response, userId: string): { id: string; updatedAt: number } | null {
    const requestedId = req.headers['x-collection-id'] as string | undefined;
    const user = (req as Request & { user?: AuthenticatedUser }).user;

    if (requestedId) {
        const collection = db.getCollectionById(requestedId, userId);
        if (!collection) {
            res.status(404).json({ success: false, error: { message: 'Collection not found' } });
            return null;
        }
        if (!collection.isDefault && !isPremium(user)) {
            res.status(403).json({
                success: false,
                error: { code: 'PREMIUM_REQUIRED', message: 'Syncing non-default collections requires premium' }
            });
            return null;
        }
        return collection;
    }

    const defaultCollection = db.getDefaultCollection(userId);
    if (!defaultCollection) {
        const newId = db.ensureDefaultCollection(userId);
        const newCollection = db.getCollectionById(newId, userId);
        return newCollection || { id: newId, updatedAt: Math.floor(Date.now() / 1000) };
    }
    return defaultCollection;
}

const syncFailure = (res: Response, error: unknown) => {
    const status = error instanceof CustomError ? error.statusCode : 400;
    const code = error instanceof CustomError ? error.code : 'SYNC_INCOMPLETE';
    return res.status(status).json({ success: false, error: { code, message: error instanceof Error ? error.message : 'Sync failed; no changes were committed' } });
};
const handleSync: RequestHandler = async (req, res) => {
    try {
        const user = (req as Request & { user: AuthenticatedUser }).user;
        const collection = resolveCollectionForSync(req, res, user.id);
        if (!collection) return;
        res.json({ success: true, data: applySync(user.id, collection.id, req.body, user.bookmarkLimit) });
    } catch (error) { syncFailure(res, error); }
};
const handleInitialSync: RequestHandler = async (req, res) => {
    try {
        const user = (req as Request & { user: AuthenticatedUser }).user;
        const collection = resolveCollectionForSync(req, res, user.id);
        if (!collection) return;
        res.json({ success: true, data: importBrowserSnapshot(user.id, collection.id, req.body, user.bookmarkLimit) });
    } catch (error) { syncFailure(res, error); }
};

// Auth routes
app.post('/api/v1/auth/register', registerWithEmail);
app.post('/api/v1/auth/login', loginWithEmail);
app.post('/api/v1/auth/google', loginWithGoogle);
app.post('/api/v1/auth/google/link', authenticate, loginWithGoogle);
app.get('/api/v1/auth/me', authenticate, getMe);
app.post('/api/v1/auth/forgot-password', forgotPassword);
app.post('/api/v1/auth/reset-password', resetPassword);

// User routes
app.get('/api/v1/user/stats', authenticate, getUserStats);

// Public app config endpoint (no auth required - for website, extension, landing pages)
app.get('/api/v1/config', (req: Request, res: Response) => {
    try {
        const config = db.getAppConfig();
        return res.json({
            success: true,
            data: config
        });
    } catch (error) {
        console.error('Failed to get app config:', error);
        return res.status(500).json({
            success: false,
            error: { message: 'Failed to get app config' }
        });
    }
});

// Browser management routes
app.get('/api/v1/user/browsers', authenticate, async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string } }).user;
        if (!authUser) {
            return res.status(401).json({
                success: false,
                error: { message: 'Unauthorized' }
            });
        }

        const browsers = db.getBrowsersForUser(authUser.id);
        return res.json({
            success: true,
            data: browsers
        });
    } catch (error) {
        console.error('Failed to get browsers:', error);
        return res.status(500).json({
            success: false,
            error: { message: 'Failed to get browsers' }
        });
    }
});

app.delete('/api/v1/user/browsers/:browserInstanceId', authenticate, async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string } }).user;
        if (!authUser) {
            return res.status(401).json({
                success: false,
                error: { message: 'Unauthorized' }
            });
        }

        const { browserInstanceId } = req.params;

        // Verify this browser belongs to the user before deleting
        const browser = db.getBrowserByInstanceId(browserInstanceId);
        if (!browser || browser.userId !== authUser.id) {
            return res.status(404).json({
                success: false,
                error: { message: 'Browser not found' }
            });
        }

        db.deleteBrowser(browserInstanceId, authUser.id);

        return res.json({
            success: true,
            data: { message: 'Browser removed successfully' }
        });
    } catch (error) {
        console.error('Failed to remove browser:', error);
        return res.status(500).json({
            success: false,
            error: { message: 'Failed to remove browser' }
        });
    }
});

// Update browser nickname
app.patch('/api/v1/user/browsers/:browserInstanceId', authenticate, async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string } }).user;
        if (!authUser) {
            return res.status(401).json({
                success: false,
                error: { message: 'Unauthorized' }
            });
        }

        const { browserInstanceId } = req.params;
        const { nickname } = req.body;

        // Validate nickname
        if (nickname !== null && typeof nickname !== 'string') {
            return res.status(400).json({
                success: false,
                error: { message: 'Nickname must be a string or null' }
            });
        }

        // Limit nickname length
        if (nickname && nickname.length > 50) {
            return res.status(400).json({
                success: false,
                error: { message: 'Nickname must be 50 characters or less' }
            });
        }

        // Verify this browser belongs to the user
        const browser = db.getBrowser(browserInstanceId, authUser.id);
        if (!browser) {
            return res.status(404).json({
                success: false,
                error: { message: 'Browser not found' }
            });
        }

        const updated = db.updateBrowserNickname(browserInstanceId, authUser.id, nickname || null);

        if (!updated) {
            return res.status(500).json({
                success: false,
                error: { message: 'Failed to update nickname' }
            });
        }

        return res.json({
            success: true,
            data: { 
                browserInstanceId,
                nickname: nickname || null,
                message: 'Nickname updated successfully' 
            }
        });
    } catch (error) {
        console.error('Failed to update browser nickname:', error);
        return res.status(500).json({
            success: false,
            error: { message: 'Failed to update browser nickname' }
        });
    }
});

// Get browser sync history
app.get('/api/v1/user/browsers/:browserInstanceId/history', authenticate, async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string } }).user;
        if (!authUser) {
            return res.status(401).json({
                success: false,
                error: { message: 'Unauthorized' }
            });
        }

        const { browserInstanceId } = req.params;

        // Verify this browser belongs to the user
        const browser = db.getBrowser(browserInstanceId, authUser.id);
        if (!browser) {
            return res.status(404).json({
                success: false,
                error: { message: 'Browser not found' }
            });
        }

        // Get sync history for this browser
        const defaultCollection = db.getDefaultCollection(authUser.id);
        const history = db.getSyncHistoryForBrowser(browserInstanceId, authUser.id).map((item: any) => ({
            ...item,
            collectionName: item.collectionName || (defaultCollection?.name ?? 'Master Collection')
        }));

        return res.json({
            success: true,
            data: {
                browser: {
                    browserInstanceId: browser.browserInstanceId,
                    browser: browser.browser,
                    browserVersion: browser.browserVersion,
                    nickname: browser.nickname,
                    os: browser.os
                },
                history: history
            }
        });
    } catch (error) {
        console.error('Failed to get browser history:', error);
        return res.status(500).json({
            success: false,
            error: { message: 'Failed to get browser history' }
        });
    }
});

app.get('/api/v1/user/browsers/:browserInstanceId/history/:historyId', authenticate, async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string } }).user;
        if (!authUser) {
            return res.status(401).json({
                success: false,
                error: { message: 'Unauthorized' }
            });
        }

        const { browserInstanceId, historyId } = req.params;

        const browser = db.getBrowser(browserInstanceId, authUser.id);
        if (!browser) {
            return res.status(404).json({
                success: false,
                error: { message: 'Browser not found' }
            });
        }

        const defaultCollection = db.getDefaultCollection(authUser.id);
        const historyEntry = db.getSyncHistoryEntryForBrowser(parseInt(historyId, 10), browserInstanceId, authUser.id);

        if (!historyEntry) {
            return res.status(404).json({
                success: false,
                error: { message: 'History entry not found' }
            });
        }

        const sessionItems = historyEntry.sessionId
            ? db.getSessionItems(historyEntry.sessionId, authUser.id)
            : { bookmarks: [], folders: [] };

        return res.json({
            success: true,
            data: {
                browser: {
                    browserInstanceId: browser.browserInstanceId,
                    browser: browser.browser,
                    browserVersion: browser.browserVersion,
                    nickname: browser.nickname,
                    os: browser.os
                },
                history: {
                    ...historyEntry,
                    collectionName: historyEntry.collectionName || (defaultCollection?.name ?? 'Master Collection')
                },
                folders: sessionItems.folders,
                bookmarks: sessionItems.bookmarks
            }
        });
    } catch (error) {
        console.error('Failed to get browser history details:', error);
        return res.status(500).json({
            success: false,
            error: { message: 'Failed to get browser history details' }
        });
    }
});

import { registerBrowserActivity } from './middleware/browser';

// Mount sync routes
app.post('/api/v1/sync', authenticate, checkBrowserLimit, registerBrowserActivity, handleSync);
app.post('/api/v1/sync/initial', authenticate, checkBrowserLimit, registerBrowserActivity, handleInitialSync);
app.get('/api/v1/bookmarks/tree/:userId', authenticate, getBookmarkTree);

// Mount new API routers
app.use('/api/v1/sessions', sessionsRouter);
app.use('/api/v1/collections', bookmarkFilesRouter);
app.use('/api/v1/collections', collectionsRouter);

// Checkout routes (requires auth)
app.use('/api/v1/checkout', authenticate, checkoutRouter);

// Webhook routes (no auth required - uses signature verification)
// Polar billing is retired; only verified PayPal events can change entitlements.
app.use('/api/webhooks/paypal', paypalWebhookRouter);

// Get sync status
app.get('/api/v1/sync/status', authenticate, async (req: Request, res: Response) => {
    try {
        console.log('\n=== Sync Status Request ===');
        const browserInstanceId = req.headers['x-browser-instance-id'] as string;
        console.log('Browser Instance ID:', browserInstanceId);

        if (!browserInstanceId) {
            console.log('Error: No Browser Instance ID provided');
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Browser Instance ID is required'
                }
            });
        }

        const authUser = (req as Request & { user?: { id: string } }).user;
        const userId = authUser?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: { message: 'Unauthorized' }
            });
        }

        // Resolve which collection to check status for
        const resolvedCollection = resolveCollectionForSync(req, res, userId);
        if (!resolvedCollection) return;
        const collectionId = resolvedCollection.id;

        const collectionBookmarks = db.getBookmarksByCollection(collectionId, userId);
        const collectionFolders = db.getFoldersByCollection(collectionId, userId);
        const needsInitialSync = !db.isCollectionInitialized(userId, collectionId);
        console.log(`Collection ${collectionId} counts:`, { bookmarks: collectionBookmarks.length, folders: collectionFolders.length });
        console.log(`Needs initial sync? ${needsInitialSync}`);

        let pendingChanges = {
            adds: 0,
            addsFolders: 0,
            updates: 0,
            updatesFolders: 0,
            moves: 0,
            deletes: 0,
            deletesFolders: 0
        };

        if (!needsInitialSync) {
            const lastSyncSeconds = db.getLastSyncForBrowser(userId, browserInstanceId, collectionId) || 0;
            // Same window as an acknowledged pull (see /sync/pending), so the count matches what a pull returns.
            if (req.get('X-Sync-Version') === '2') {
                const cursor = db.getPullCursor(userId, browserInstanceId, collectionId);
                const c = db.getRevisionChanges(userId, collectionId, cursor.revision, db.getCollectionRevision(userId, collectionId), browserInstanceId);
                pendingChanges = { adds: c.creates.bookmarks.length, addsFolders: c.creates.folders.length,
                    updates: 0, updatesFolders: 0, moves: 0, deletes: c.deletes.bookmarks.length, deletesFolders: c.deletes.folders.length };
            } else pendingChanges = db.getPendingChangesForBrowser(userId, browserInstanceId, Math.max(lastSyncSeconds - 1, 0), collectionId);
        }

        const response = {
            success: true,
            data: {
                needsInitialSync,
                pendingChanges,
                collectionUpdatedAt: resolvedCollection.updatedAt
            }
        };
        console.log('Sending response:', response);
        res.json(response);
    } catch (err) {
        const error = err as Error;
        console.error('Error getting sync status:', error);
        res.status(500).json({
            success: false,
            error: {
                message: 'Failed to get sync status',
                details: error.message
            }
        });
    }
});

// Debug endpoint to view database stats
app.get('/api/v1/debug/stats', (req, res) => {
    try {
        const stats = db.getStats();
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Error getting stats:', error);
        res.status(500).json({
            success: false,
            error: {
                message: 'Failed to get database stats',
                details: error instanceof Error ? error.message : String(error)
            }
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Math.floor(Date.now() / 1000) });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        error: {
            message: 'Internal Server Error',
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        }
    });
});

// Get master collection summary
app.get('/api/v1/sync/master-summary', authenticate, async (req: Request, res: Response) => {
    try {
        console.log('\n=== Master Collection Summary Request ===');
        const deviceId = req.headers['x-device-id'] as string;
        const authUser = (req as Request & { user?: { id: string } }).user;
        const userId = authUser?.id;

        if (!userId || !deviceId) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Device ID is required'
                }
            });
        }

        console.log(`User ID: ${userId}, Device ID: ${deviceId}`);

        // Resolve collection from header or fall back to default
        const resolvedCollection = resolveCollectionForSync(req, res, userId);
        if (!resolvedCollection) return;
        const collectionId = resolvedCollection.id;

        const bookmarks = db.getBookmarksByCollection(collectionId, userId);
        const folders = db.getFoldersByCollection(collectionId, userId);
        const bookmarkCount = bookmarks.length;
        const folderCount = folders.length;

        const lastSyncTimestamp = db.getLastSyncForUser(userId);

        console.log(`Found ${bookmarkCount} bookmarks and ${folderCount} folders (collection: ${collectionId})`);

        const response = {
            success: true,
            data: {
                bookmarkCount,
                folderCount,
                lastSyncTimestamp,
                deviceCount: db.getDeviceCountForUser(userId)
            }
        };

        console.log('Sending response:', response);
        res.json(response);
    } catch (err) {
        const error = err as Error;
        console.error('Error getting master collection summary:', error);
        res.status(500).json({
            success: false,
            error: {
                message: 'Failed to get master collection summary',
                details: error.message
            }
        });
    }
});

// Get master collection
app.get('/api/v1/sync/master-collection', authenticate, checkBrowserLimit, async (req: Request, res: Response) => {
    try {
        console.log('\n=== Master Collection Request ===');
        const deviceId = req.headers['x-device-id'] as string;
        const browserInstanceId = req.headers['x-browser-instance-id'] as string | undefined;
        const authUser = (req as Request & { user?: { id: string } }).user;
        const userId = authUser?.id;

        if (!userId || !deviceId) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Device ID is required'
                }
            });
        }

        console.log(`User ID: ${userId}, Device ID: ${deviceId}, Browser Instance ID: ${browserInstanceId || '(none)'}`);

        // Register browser activity to ensure browserInstanceId exists in browsers table
        // (required for FOREIGN KEY constraint in sync_history)
        if (browserInstanceId) {
            try {
                db.registerBrowser({
                    browserInstanceId,
                    userId,
                    deviceId,
                    browser: 'unknown',
                    browserVersion: 'unknown',
                    os: 'unknown',
                    osVersion: 'unknown',
                    userAgent: req.headers['user-agent'] as string || 'unknown'
                });
                console.log(`[MasterCollection] Registered browser ${browserInstanceId}`);
            } catch (error) {
                console.error('[MasterCollection] Failed to register browser:', error);
                // Don't block the request if registration fails
            }
        }

        // Resolve collection from header or fall back to default
        const resolvedCollection = resolveCollectionForSync(req, res, userId);
        if (!resolvedCollection) return;
        const collectionId = resolvedCollection.id;

        const folders = db.getFoldersByCollection(collectionId, userId);
        const bookmarks = db.getBookmarksByCollection(collectionId, userId);

        console.log(`Found ${bookmarks.length} bookmarks and ${folders.length} folders (collection: ${collectionId})`);
        // These synchronous reads share one SQLite view. Offer this exact snapshot revision;
        // the client acknowledges it only after its replacement and identity map are durable.
        const revision = db.getCollectionRevision(userId, collectionId);
        if (browserInstanceId && req.get('X-Sync-Version') === '2') db.offerPull(userId, browserInstanceId, collectionId, revision);

        // Create a record of this master collection fetch. Pass browserInstanceId via metadata
        // so getLastSyncForBrowser can find this row and advance lastSync. Without this,
        // pending-changes-for-browser keeps reporting stale totals (root cause of "503 to pull"
        // when master and local totals already match).
        db.createSyncHistory({
            userId,
            deviceId,
            type: 'SYNC',
            changesCount: bookmarks.length + folders.length,
            status: 'SUCCESS',
            details: {
                kind: 'fetch', // a read of the master, not a pull acknowledgement; never advances the watermark
                bookmarksProcessed: bookmarks.length,
                foldersProcessed: folders.length
            },
            metadata: {
                timestamp: Math.floor(Date.now() / 1000),
                action: 'MASTER_COLLECTION_FETCH',
                deviceInfo: browserInstanceId ? { browserInstanceId } : undefined
            }
        });

        const response = {
            success: true,
            data: {
                folders,
                bookmarks,
                cursor: req.get('X-Sync-Version') === '2' ? revision : undefined,
                timestamp: Math.floor(Date.now() / 1000)
            }
        };

        console.log('Sending master collection response');
        res.json(response);
    } catch (err) {
        const error = err as Error;
        console.error('Error getting master collection:', error);
        res.status(500).json({
            success: false,
            error: {
                message: 'Failed to get master collection',
                details: error.message
            }
        });
    }
});

// Get pending changes for sync down
app.get('/api/v1/sync/pending', authenticate, checkBrowserLimit, async (req: Request, res: Response) => {
    try {
        console.log('\n=== Pending Changes Request ===');
        const deviceId = req.headers['x-device-id'] as string;
        const browserInstanceId = req.headers['x-browser-instance-id'] as string | undefined;
        const authUser = (req as Request & { user?: { id: string } }).user;
        const userId = authUser?.id;

        if (!userId || !deviceId) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Device ID is required'
                }
            });
        }

        if (!browserInstanceId) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Browser Instance ID is required'
                }
            });
        }

        console.log(`User ID: ${userId}, Device ID: ${deviceId}, Browser Instance ID: ${browserInstanceId}`);

        // Register browser activity to ensure browserInstanceId exists in browsers table
        // (required for FOREIGN KEY constraint in sync_history)
        try {
            db.registerBrowser({
                browserInstanceId,
                userId,
                deviceId,
                browser: 'unknown',
                browserVersion: 'unknown',
                os: 'unknown',
                osVersion: 'unknown',
                userAgent: req.headers['user-agent'] as string || 'unknown'
            });
            console.log(`[Pending] Registered browser ${browserInstanceId}`);
        } catch (error) {
            console.error('[Pending] Failed to register browser:', error);
            // Don't block the request if registration fails
        }

        // Resolve collection from header or fall back to default
        const resolvedCollection = resolveCollectionForSync(req, res, userId);
        if (!resolvedCollection) return;
        const collectionId = resolvedCollection.id;

        // Check if master collection is empty (needs initial sync)
        const folders = db.getFoldersByCollection(collectionId, userId);
        const bookmarks = db.getBookmarksByCollection(collectionId, userId);
        const needsInitialSync = !db.isCollectionInitialized(userId, collectionId);

        if (needsInitialSync) {
            console.log('Master collection is empty - needs initial sync');
            return res.json({
                success: true,
                data: {
                    needsInitialSync: true,
                    changes: { creates: { folders: [], bookmarks: [] }, updates: { folders: [], bookmarks: [] }, deletes: { folders: [], bookmarks: [] } },
                    summary: { total: 0 }
                }
            });
        }

        // Get last sync timestamp for this browser instance
        const lastSync = db.getLastSyncForBrowser(userId, browserInstanceId, collectionId);
        const lastSyncSeconds = lastSync || 0;
        console.log(`Last sync for browser: ${lastSync ? new Date(lastSync * 1000).toISOString() : 'never'}`);

        // Acknowledged pulls (X-Sync-Ack: 1): the watermark moves only when the client POSTs
        // /sync/pending/ack after applying. A failed apply therefore gets the same changes again.
        // The window starts at cursor-1 with '>', which means '>= cursor'. Re-sent changes from
        // the cursor's own second are safe because the client's apply is idempotent.
        // Legacy clients (no header) keep the old strict '>' window and write the watermark now.
        const ackMode = req.headers['x-sync-ack'] === '1';
        const revisionMode = req.get('X-Sync-Version') === '2';
        const windowStart = revisionMode ? db.getPullCursor(userId, browserInstanceId, collectionId).revision : ackMode ? Math.max(lastSyncSeconds - 1, 0) : lastSyncSeconds;
        // Capture the cursor before reading. Node is single-threaded and better-sqlite3 is
        // synchronous, so no write can commit between this line and the queries below.
        const cursor = revisionMode ? db.getCollectionRevision(userId, collectionId) : Math.floor(Date.now() / 1000);

        // Get pending changes (delta from other browsers)
        const changes = revisionMode ? db.getRevisionChanges(userId, collectionId, windowStart, cursor, browserInstanceId) : db.getPendingChangesDetails(userId, browserInstanceId, windowStart, collectionId);
        if (revisionMode) db.offerPull(userId, browserInstanceId, collectionId, cursor);

        const total = changes.creates.folders.length + changes.creates.bookmarks.length +
                     changes.updates.folders.length + changes.updates.bookmarks.length +
                     changes.deletes.folders.length + changes.deletes.bookmarks.length;

        const summary = {
            total,
            creates: changes.creates.folders.length + changes.creates.bookmarks.length,
            updates: changes.updates.folders.length + changes.updates.bookmarks.length,
            deletes: changes.deletes.folders.length + changes.deletes.bookmarks.length
        };

        console.log(`Pending changes: ${summary.total} total (${summary.creates} creates, ${summary.updates} updates, ${summary.deletes} deletes)`);

        // Create a record of this pending changes fetch. Pass browserInstanceId via metadata
        // so getLastSyncForBrowser can find this row and advance lastSync.
        if (!ackMode) db.createSyncHistory({
            userId,
            deviceId,
            type: 'SYNC',
            changesCount: total,
            status: 'SUCCESS',
            details: {
                kind: 'pull',
                bookmarksProcessed: changes.creates.bookmarks.length + changes.updates.bookmarks.length + changes.deletes.bookmarks.length,
                foldersProcessed: changes.creates.folders.length + changes.updates.folders.length + changes.deletes.folders.length
            },
            metadata: {
                timestamp: Math.floor(Date.now() / 1000),
                action: 'PENDING_CHANGES_FETCH',
                deviceInfo: { browserInstanceId }
            }
        });

        res.json({
            success: true,
            data: {
                needsInitialSync: false,
                changes,
                summary,
                // Ack mode only: the client sends `cursor` back on /sync/pending/ack once it has applied these.
                // `since` is the window start, which the client uses to count retries of the same window.
                cursor: ackMode ? cursor : undefined,
                since: ackMode ? windowStart : undefined
            }
        });
    } catch (err) {
        const error = err as Error;
        console.error('Error getting pending changes:', error);
        res.status(500).json({
            success: false,
            error: {
                message: 'Failed to get pending changes',
                details: error.message
            }
        });
    }
});

// Root folder alias mapping for cross-browser compatibility
const ROOT_FOLDER_ALIASES: Record<string, string[]> = {
    'bookmarks bar': ['bookmarks toolbar', 'toolbar', 'favourites bar', 'favorites bar'],
    'other bookmarks': ['unfiled bookmarks', 'other', 'other favourites', 'other favorites'],
    'mobile bookmarks': ['mobile'],
    'bookmarks menu': ['menu']
};

// Firefox special folder IDs that should be treated as root-level indicators
const FIREFOX_ROOT_IDS = new Set([
    'root________',
    'menu________',
    'toolbar_____',
    'unfiled_____',
    'mobile______'
]);

const ROOT_ID_TO_CANONICAL: Record<string, string> = {
    'toolbar_____': 'bookmarks bar',
    'menu________': 'bookmarks menu',
    'unfiled_____': 'other bookmarks',
    'mobile______': 'mobile bookmarks',
    '1': 'bookmarks bar',
    '2': 'other bookmarks',
    '3': 'mobile bookmarks'
};

// Check if a folder ID indicates a root or special Firefox folder
function isRootFolderId(id: string | null): boolean {
    if (!id) return true;
    if (id === '0') return true;
    // Chrome/Brave/Chromium/Edge root IDs: 1=Bookmarks Bar, 2=Other Bookmarks, 3=Mobile Bookmarks
    if (id === '1' || id === '2' || id === '3') return true;
    return FIREFOX_ROOT_IDS.has(id);
}

function normalizeRootFolderName(name: string): string {
    const lower = name.toLowerCase().trim();
    for (const [canonical, aliases] of Object.entries(ROOT_FOLDER_ALIASES)) {
        if (lower === canonical || aliases.includes(lower)) {
            return canonical;
        }
    }
    return lower;
}

// Check if a folder title is a root-level folder (Bookmarks bar, Other bookmarks, etc.)
function isRootFolderTitle(title: string): boolean {
    const normalized = normalizeRootFolderName(title);
    return Object.keys(ROOT_FOLDER_ALIASES).includes(normalized);
}

function buildFolderPath(folderId: string, folderMap: Map<string, { title: string; parentId: string | null; masterParentId: string | null }>): string {
    const parts: string[] = [];
    let currentId: string | null = folderId;
    const visited = new Set<string>();

    while (currentId && !visited.has(currentId)) {
        visited.add(currentId);

        // First, check if this ID is a known root ID
        if (ROOT_ID_TO_CANONICAL[currentId]) {
            parts.unshift(ROOT_ID_TO_CANONICAL[currentId]);
            break;
        }

        const folder = folderMap.get(currentId);
        if (!folder) {
            // If we can't find the folder, check if the ID might be a browser-specific root
            // (This handles cases where parentId is '1' but map is keyed by masterId)
            break;
        }

        // Stop at root-level folders (Bookmarks bar, Other bookmarks, etc.) 
        // and include them in the path to distinguish between roots
        if (isRootFolderTitle(folder.title)) {
            parts.unshift(normalizeRootFolderName(folder.title));
            break;
        }

        const normalizedTitle = normalizeRootFolderName(folder.title);
        // Skip empty-titled folders
        if (normalizedTitle && normalizedTitle.trim() !== '') {
            parts.unshift(normalizedTitle);
        }

        // Move to parent - check if parent is a root ID before trying map lookup
        const nextId = folder.masterParentId || folder.parentId;
        if (nextId && ROOT_ID_TO_CANONICAL[nextId]) {
            parts.unshift(ROOT_ID_TO_CANONICAL[nextId]);
            break;
        }
        currentId = nextId;
    }

    return parts.join('/').toLowerCase();
}

// Merge local bookmarks into master collection with dedupe
// Acknowledge an applied pull. Moves this browser's pull watermark to the cursor the pull returned.
// The row is stamped with the cursor, not the ack time, so changes committed while the client was
// applying are still delivered on the next pull.
app.post('/api/v1/sync/pending/ack', authenticate, async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string } }).user;
        const userId = authUser?.id;
        const deviceId = req.headers['x-device-id'] as string | undefined;
        const browserInstanceId = req.headers['x-browser-instance-id'] as string | undefined;
        const cursor = Number(req.body?.cursor);
        const changesApplied = Number(req.body?.changesApplied ?? 0);
        const nowSeconds = Math.floor(Date.now() / 1000);

        if (!userId || !deviceId || !browserInstanceId) {
            return res.status(400).json({
                success: false,
                error: { message: 'Device ID and Browser Instance ID are required' }
            });
        }
        const revisionMode = req.get('X-Sync-Version') === '2';
        const collection = resolveCollectionForSync(req, res, userId);
        if (!collection) return;
        if (!Number.isSafeInteger(cursor) || cursor < (revisionMode ? 0 : 1) || (!revisionMode && cursor > nowSeconds + 5)) {
            return res.status(400).json({
                success: false,
                error: { message: 'A valid cursor from the pending response is required' }
            });
        }
        if (!db.getBrowser(browserInstanceId, userId)) return res.status(403).json({ success: false, error: { message: 'Browser is not registered to this account' } });

        db.acknowledgePull(userId, browserInstanceId, collection.id, cursor, revisionMode);
        if (!revisionMode) db.createSyncHistory({
            userId,
            deviceId,
            type: 'SYNC',
            changesCount: Number.isFinite(changesApplied) ? changesApplied : 0,
            status: 'SUCCESS',
            details: { kind: 'pull', changesProcessed: changesApplied },
            metadata: { deviceInfo: { browserInstanceId } },
            timestamp: cursor,
            collectionId: collection.id
        });

        res.json({ success: true, data: { cursor } });
    } catch (err) {
        const error = err as Error;
        console.error('[Pending ack] Failed:', error);
        res.status(400).json({ success: false, error: { message: error.message } });
    }
});

app.post('/api/v1/sync/merge', authenticate, checkBrowserLimit, registerBrowserActivity, async (req: Request, res: Response) => {
    try {
        const user = (req as Request & { user: AuthenticatedUser }).user;
        const collection = resolveCollectionForSync(req, res, user.id);
        if (!collection) return;
        res.json({ success: true, data: importBrowserSnapshot(user.id, collection.id, req.body, user.bookmarkLimit, true) });
    } catch (error) { syncFailure(res, error); }
});

// Quick capture endpoint for mobile share sheets
app.post('/api/v1/capture', authenticate, async (req: Request, res: Response) => {
    try {
        console.log('\n=== Capture Request (Mobile Share) ===');
        const authUser = (req as Request & { user?: { id: string } }).user;
        if (!authUser) {
            return res.status(401).json({
                success: false,
                error: { message: 'Unauthorized' }
            });
        }
        const userId = authUser.id;

        const { url, title, parentId, masterParentId } = req.body;

        if (typeof url !== 'string' || !url.trim()) {
            return res.status(400).json({
                success: false,
                error: { message: 'URL is required' }
            });
        }
        try { safeBookmarkUrl(url); } catch (error) { return res.status(400).json({ success: false, error: { message: (error as Error).message } }); }
        if (title !== undefined && (typeof title !== 'string' || title.length > 10000)) return res.status(400).json({ success: false, error: { message: 'Invalid bookmark title' } });
        const authenticated = (req as Request & { user: AuthenticatedUser }).user;
        if (db.getBookmarkCount(userId) >= authenticated.bookmarkLimit) return res.status(403).json({ success: false,
            error: { code: 'BOOKMARK_LIMIT_REACHED', message: 'Bookmark limit reached', upgradeUrl: '/settings/subscription' } });

        console.log(`Capturing URL: ${url}, Title: ${title || 'Untitled'}`);

        // Resolve masterParentId if parentId provided
        let resolvedMasterParentId = masterParentId;
        if (!resolvedMasterParentId && parentId) {
            const parentFolder = db.getFolderByMasterId(parentId, userId) as { masterId?: string } | undefined;
            resolvedMasterParentId = parentFolder?.masterId || db.getFolderMasterIdByBrowserId(parentId, userId);
        }

        // Resolve the user's default collection so the captured bookmark lands
        // in the same bucket the desktop extension pulls via /sync/master-collection
        // (which filters by `collectionId = ?`, server.ts ~1027). Without this the
        // bookmark is stored with `collectionId IS NULL` and is invisible to the
        // extension's master-collection read, defeating the entire share-sheet
        // feature. If the user has no default yet, ensureDefaultCollection seeds
        // one (and standard root folders) atomically.
        const defaultCollection = db.getDefaultCollection(userId);
        const collectionId = defaultCollection?.id ?? db.ensureDefaultCollection(userId);
        db.validateParent(userId, collectionId, resolvedMasterParentId || null);

        // Create the bookmark
        const result = db.createBookmark({
            browserId: `mobile-${Date.now()}`, // Generate a unique browserId for mobile captures
            url,
            title: title || url,
            parentId: parentId || '1', // Default to Bookmarks Bar if not specified
            masterParentId: resolvedMasterParentId,
            collectionId, // <-- must be the default collection UUID, not null
            position: 0,
            dateAdded: Math.floor(Date.now() / 1000),
            userId,
            metadata: {
                timestamp: Math.floor(Date.now() / 1000),
                deviceInfo: {
                    browserInstanceId: undefined,
                    deviceId: req.headers['x-device-id'] as string || 'mobile',
                    browser: 'BookMarx Mobile',
                    browserVersion: '1.0.0',
                    os: req.headers['x-os'] as string || 'mobile',
                    osVersion: req.headers['x-os-version'] as string || 'unknown'
                },
                userAgent: req.headers['user-agent'] || 'BookMarx Mobile App'
            }
        });

        console.log(`Bookmark captured with masterId: ${result.masterId}`);

        res.json({
            success: true,
            data: {
                masterId: result.masterId,
                url,
                title: title || url,
                parentId: parentId || '1',
                masterParentId: resolvedMasterParentId,
                createdAt: Math.floor(Date.now() / 1000)
            }
        });
    } catch (err) {
        const error = err as Error;
        console.error('Capture error:', error);
        res.status(500).json({
            success: false,
            error: {
                message: 'Failed to capture bookmark',
                details: error.message
            }
        });
    }
});

// Start server
export const startServer = () => {
    try {
        app.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
            console.log('SQLite database initialized successfully');
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

if (require.main === module) {
    // Handle graceful shutdown only when running standalone
    process.on('SIGTERM', () => {
        console.log('SIGTERM received. Closing database and shutting down...');
        db.close();
        process.exit(0);
    });

    process.on('SIGINT', () => {
        console.log('SIGINT received. Closing database and shutting down...');
        db.close();
        process.exit(0);
    });

    startServer();
}
