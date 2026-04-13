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
import { authenticate } from './middleware/auth';
import { checkBookmarkLimit, checkBrowserLimit } from './middleware/premium';
import sessionsRouter from './api/sessions';
import collectionsRouter from './api/collections';
import polarWebhookRouter from './api/webhooks/polar';
import checkoutRouter from './api/checkout';

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
app.use(cors());
// Configure helmet to work with Next.js
// Next.js requires inline scripts and eval for hydration/HMR
app.use(helmet({
  contentSecurityPolicy: false,  // Next.js manages its own CSP
  crossOriginEmbedderPolicy: false,  // Needed for Google Fonts and external resources
  crossOriginOpenerPolicy: false,  // Required for Google Sign-In popup to communicate back
  referrerPolicy: { policy: 'origin-when-cross-origin' },  // GSI needs referrer to verify origin
}));
app.use(express.json());

const handleSync: RequestHandler = async (req, res) => {
    try {
        console.log('\n=== Sync Request ===');
        const authUser = (req as Request & { user?: { id: string } }).user;
        if (!authUser) {
            return res.status(401).json({
                success: false,
                error: { message: 'Unauthorized' }
            });
        }
        const userId = authUser.id;

        // Ensure default collection exists when syncing
        const defaultCollectionId = db.ensureDefaultCollection(userId);

        const { changes, deviceId, metadata } = req.body as SyncRequest;

        // Register/Update browser activity - update lastSeen and version info
        // This ensures active syncing browsers are counted correctly
        if (metadata?.deviceInfo) {
            const { deviceInfo } = metadata;
            db.registerBrowser({
                browserInstanceId: deviceInfo.browserInstanceId,
                userId,
                deviceId: deviceInfo.deviceId,
                browser: deviceInfo.browser,
                browserVersion: deviceInfo.browserVersion,
                os: deviceInfo.os,
                osVersion: deviceInfo.osVersion,
                userAgent: metadata.userAgent
            });
        }


        // Process changes directly - remove the initial sync check
        const results = [];
        for (const change of changes) {
            const { type, data, metadata } = change;
            console.log('Processing change:', { type, data });

            try {
                switch (type) {
                    case 'CREATE':
                        if (data.type === 'bookmark') {
                            console.log('Creating bookmark:', data);
                            try {
                                // Resolve masterParentId from parentId if not provided
                                let masterParentId = data.masterParentId;
                                if (!masterParentId && data.parentId) {
                                    masterParentId = db.getFolderMasterIdByBrowserId(data.parentId, userId);
                                }

                                const createResult = db.createBookmark({
                                    ...data,
                                    masterParentId,
                                    userId,
                                    collectionId: db.ensureDefaultCollection(userId),
                                    metadata
                                });
                                results.push({
                                    success: true,
                                    type: 'bookmark',
                                    browserId: data.browserId,
                                    masterId: createResult.masterId
                                });
                            } catch (err) {
                                console.error('Failed to create bookmark:', err);
                                results.push({
                                    error: 'BOOKMARK_CREATE_FAILED',
                                    details: err instanceof Error ? err.message : 'Unknown error',
                                    itemId: data.id
                                });
                            }
                        } else if (data.type === 'folder') {
                            console.log('Creating folder:', data);
                            try {
                                // Resolve masterParentId from parentId if not provided
                                let masterParentId = data.masterParentId;
                                if (!masterParentId && data.parentId) {
                                    masterParentId = db.getFolderMasterIdByBrowserId(data.parentId, userId);
                                }

                                const createResult = db.createFolder({
                                    ...data,
                                    masterParentId,
                                    userId,
                                    collectionId: db.ensureDefaultCollection(userId),
                                    metadata
                                });
                                results.push({
                                    success: true,
                                    type: 'folder',
                                    browserId: data.browserId,
                                    masterId: createResult.masterId
                                });
                            } catch (err) {
                                console.error('Failed to create folder:', err);
                                results.push({
                                    error: 'FOLDER_CREATE_FAILED',
                                    details: err instanceof Error ? err.message : 'Unknown error',
                                    itemId: data.id
                                });
                            }
                        }
                        break;

                    case 'MOVE':
                        if (data.type === 'bookmark') {
                            console.log('Moving bookmark:', data);
                            try {
                                results.push(await db.moveBookmark({
                                    ...data,
                                    metadata
                                }));
                            } catch (err) {
                                console.error('Failed to move bookmark:', err);
                                results.push({
                                    error: 'BOOKMARK_MOVE_FAILED',
                                    details: err instanceof Error ? err.message : 'Unknown error',
                                    itemId: data.id
                                });
                            }
                        } else if (data.type === 'folder') {
                            console.log('Moving folder:', data);
                            try {
                                results.push(await db.moveFolder({
                                    ...data,
                                    metadata
                                }));
                            } catch (err) {
                                console.error('Failed to move folder:', err);
                                results.push({
                                    error: 'FOLDER_MOVE_FAILED',
                                    details: err instanceof Error ? err.message : 'Unknown error',
                                    itemId: data.id
                                });
                            }
                        }
                        break;

                    case 'DELETE':
                        console.log('Processing DELETE operation:', data);

                        // For DELETE operations, we need to determine if it's a bookmark or folder
                        // First, try to find it in the bookmarks table
                        try {
                            const bookmarkExists = await db.checkBookmarkExists(data.browserId);
                            if (bookmarkExists) {
                                console.log('Deleting bookmark:', data.browserId);
                                results.push(await db.deleteBookmark({
                                    id: data.browserId,
                                    metadata
                                }));
                            } else {
                                // If not found in bookmarks, check folders
                                const folderExists = await db.checkFolderExists(data.browserId);
                                if (folderExists) {
                                    console.log('Deleting folder:', data.browserId);
                                    results.push(await db.deleteFolder({
                                        id: data.browserId,
                                        metadata,
                                        recursive: true // Enable recursive deletion for non-empty folders
                                    }));
                                } else {
                                    console.log('Item not found for deletion:', data.browserId);
                                    results.push({
                                        error: 'ITEM_NOT_FOUND',
                                        details: `No bookmark or folder found with id=${data.browserId}`,
                                        itemId: data.browserId
                                    });
                                }
                            }
                        } catch (err) {
                            console.error('Failed to delete item:', err);
                            results.push({
                                error: 'DELETE_FAILED',
                                details: err instanceof Error ? err.message : 'Unknown error',
                                itemId: data.browserId
                            });
                        }
                        break;

                    case 'UPDATE':
                        if (data.type === 'bookmark') {
                            console.log('Updating bookmark:', data);
                            try {
                                // Resolve masterParentId if parentId changed
                                let masterParentId = data.masterParentId;
                                if (!masterParentId && data.parentId) {
                                    masterParentId = db.getFolderMasterIdByBrowserId(data.parentId, userId);
                                }

                                results.push(db.updateBookmark({
                                    ...data,
                                    masterParentId,
                                    userId,
                                    metadata
                                }));
                            } catch (err) {
                                console.error('Failed to update bookmark in database:', err);
                                results.push({
                                    error: 'BOOKMARK_UPDATE_FAILED',
                                    details: err instanceof Error ? err.message : 'Unknown error',
                                    itemId: data.id
                                });
                            }
                        } else if (data.type === 'folder') {
                            console.log('Updating folder:', data);
                            try {
                                // Resolve masterParentId if parentId changed
                                let masterParentId = data.masterParentId;
                                if (!masterParentId && data.parentId) {
                                    masterParentId = db.getFolderMasterIdByBrowserId(data.parentId, userId);
                                }

                                const result = db.updateFolder({
                                    ...data,
                                    masterParentId,
                                    userId,
                                    metadata
                                });
                                if (!result?.changes) {
                                    throw new Error(`No folder was updated with id: ${data.id}`);
                                }
                                console.log('Folder update result:', result);
                                results.push(result);
                            } catch (err) {
                                console.error('Failed to update folder in database:', err);
                                results.push({
                                    error: 'FOLDER_UPDATE_FAILED',
                                    details: err instanceof Error ? err.message : 'Unknown error',
                                    itemId: data.id
                                });
                            }
                        }
                        break;
                    // ... other cases
                }
            } catch (err) {
                console.error('Error processing change:', err);
                results.push({ error: err instanceof Error ? err.message : 'Unknown error' });
            }
        }

        // Create sync history entry
        await db.createSyncHistory({
            userId,
            deviceId,
            type: 'SYNC',
            changesCount: changes.length,
            status: 'SUCCESS',
            collectionId: defaultCollectionId,
            details: {
                changesProcessed: changes.length,
                bookmarksProcessed: changes.filter(c => c.data.type === 'bookmark').length,
                foldersProcessed: changes.filter(c => c.data.type === 'folder').length,
                bookmarksCreated: changes.filter(c => c.type === 'CREATE' && c.data.type === 'bookmark').length,
                foldersCreated: changes.filter(c => c.type === 'CREATE' && c.data.type === 'folder').length,
                bookmarksUpdated: changes.filter(c => c.type === 'UPDATE' && c.data.type === 'bookmark').length,
                foldersUpdated: changes.filter(c => c.type === 'UPDATE' && c.data.type === 'folder').length,
                bookmarksDeleted: changes.filter(c => c.type === 'DELETE' && c.data.type === 'bookmark').length,
                foldersDeleted: changes.filter(c => c.type === 'DELETE' && c.data.type === 'folder').length
            },
            metadata: changes[0]?.metadata
        });

        res.json({
            success: true,
            data: {
                action: 'SYNC_COMPLETE',
                changesApplied: results.length,
                results
            }
        });

    } catch (err) {
        console.error('Sync error:', err);
        res.status(500).json({
            success: false,
            error: {
                message: 'Failed to process sync request',
                details: err instanceof Error ? err.message : 'Unknown error'
            }
        });
    }
};

export const handleInitialSync: RequestHandler = async (req, res) => {
    try {
        console.log('\n=== Initial Sync Request ===');
        const authUser = (req as Request & { user?: { id: string } }).user;
        if (!authUser) {
            return res.status(401).json({
                success: false,
                error: { message: 'Unauthorized' }
            });
        }
        const userId = authUser.id;
        const { bookmarks, folders, deviceId, metadata } = req.body as InitialSyncRequest;
        console.log(`Device ID: ${deviceId}`);
        console.log(`Received ${bookmarks.length} bookmarks and ${folders.length} folders`);
        console.log('Device Info:', metadata.deviceInfo);

        // Generate a unique session ID for this initial sync (for rollback support)
        const sessionId = crypto.randomUUID();
        const sourceBrowser = metadata.deviceInfo.browser;
        console.log(`Session ID: ${sessionId}`);
        console.log(`Source Browser: ${sourceBrowser}`);

        // Register browser first
        console.log('\nRegistering browser...');
        const deviceInfo = metadata.deviceInfo;
        db.registerBrowser({
            browserInstanceId: deviceInfo.browserInstanceId,
            userId,
            deviceId: deviceInfo.deviceId,
            browser: deviceInfo.browser,
            browserVersion: deviceInfo.browserVersion,
            os: deviceInfo.os,
            osVersion: deviceInfo.osVersion,
            userAgent: metadata.userAgent
        });

        const folderResults = [];
        const bookmarkResults = [];
        const defaultCollectionId = db.ensureDefaultCollection(userId);
        const preImportSnapshot = db.getCollectionSnapshot(defaultCollectionId, userId);

        const result = db.transaction(() => {
            console.log('\nProcessing folders...');
            for (const folder of folders) {
                console.log(`Creating folder: ${folder.title} (${folder.id})`);
                folderResults.push(
                    db.createFolder({
                        ...folder,
                        userId,
                        collectionId: defaultCollectionId,
                        sourceBrowser,
                        sessionId,
                        metadata
                    })
                );
            }

            console.log('\nProcessing bookmarks...');
            for (const bookmark of bookmarks) {
                console.log(`Creating bookmark: ${bookmark.title} - ${bookmark.url} (${bookmark.id})`);
                bookmarkResults.push(
                    db.createBookmark({
                        ...bookmark,
                        userId,
                        collectionId: defaultCollectionId,
                        sourceBrowser,
                        sessionId,
                        metadata
                    })
                );
            }

            console.log('\nRunning structure repair...');
            const repairResult = db.repairStructure(userId);
            console.log('Structure repair results:', repairResult);

            console.log('\nCreating sync history entry...');
            db.createSyncHistory({
                userId,
                deviceId,
                type: 'INITIAL_IMPORT',
                changesCount: bookmarks.length + folders.length,
                status: 'SUCCESS',
                collectionId: defaultCollectionId,
                sessionId,
                details: {
                    changesProcessed: bookmarks.length + folders.length,
                    bookmarksProcessed: bookmarks.length,
                    foldersProcessed: folders.length,
                    bookmarksCreated: bookmarks.length,
                    foldersCreated: folders.length,
                    sessionId,
                    sourceBrowser,
                    collectionId: defaultCollectionId
                },
                metadata
            });

            const eventId = db.createCollectionEvent({
                userId,
                collectionId: defaultCollectionId,
                type: 'INITIAL_IMPORT',
                sourceBrowser,
                sessionId,
                changesCount: bookmarks.length + folders.length,
                snapshot: preImportSnapshot,
                details: {
                    bookmarksCreated: bookmarks.length,
                    foldersCreated: folders.length,
                    sourceBrowser,
                    sessionId
                }
            });

            return {
                success: true,
                data: {
                    action: 'INITIAL_IMPORT_COMPLETE',
                    eventId,
                    sessionId,
                    sourceBrowser,
                    imported: {
                        folders: folderResults.length,
                        bookmarks: bookmarkResults.length
                    },
                    repaired: repairResult
                }
            };
        });

        console.log('\nInitial sync completed successfully:', result);
        res.json(result);

    } catch (err) {
        const error = err as Error;
        console.error('Initial sync error:', error);
        console.error('Stack trace:', error.stack);
        res.status(500).json({
            success: false,
            error: {
                message: 'Failed to process initial sync request',
                details: error.message
            }
        });
    }
};

// Auth routes
app.post('/api/v1/auth/register', registerWithEmail);
app.post('/api/v1/auth/login', loginWithEmail);
app.post('/api/v1/auth/google', loginWithGoogle);
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
app.post('/api/v1/sync/initial', authenticate, checkBrowserLimit, registerBrowserActivity, checkBookmarkLimit, handleInitialSync);
app.get('/api/v1/bookmarks/tree/:userId', authenticate, getBookmarkTree);

// Mount new API routers
app.use('/api/v1/sessions', sessionsRouter);
app.use('/api/v1/collections', collectionsRouter);

// Checkout routes (requires auth)
app.use('/api/v1/checkout', authenticate, checkoutRouter);

// Webhook routes (no auth required - uses signature verification)
app.use('/api/webhooks/polar', polarWebhookRouter);

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

        // Check if initial sync is needed based on master collection
        const bookmarkCount = db.getBookmarkCountForUser(userId);
        const folderCount = db.getFolderCountForUser(userId);
        const needsInitialSync = bookmarkCount + folderCount === 0;
        console.log(`Master counts for user ${userId}:`, { bookmarkCount, folderCount });
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
            const lastSyncMs = db.getLastSyncForBrowser(userId, browserInstanceId);
            const lastSyncSeconds = lastSyncMs ? Math.floor(lastSyncMs / 1000) : 0;
            pendingChanges = db.getPendingChangesForBrowser(userId, browserInstanceId, lastSyncSeconds);
        }

        const response = {
            success: true,
            data: {
                needsInitialSync,
                pendingChanges
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
    res.json({ status: 'ok', timestamp: Date.now() });
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

        // Count only the default/master collection, not all collections
        const defaultCollection = db.getDefaultCollection(userId);
        let bookmarkCount = 0;
        let folderCount = 0;

        if (defaultCollection) {
            const bookmarks = db.getBookmarksByCollection(defaultCollection.id, userId);
            const folders = db.getFoldersByCollection(defaultCollection.id, userId);
            bookmarkCount = bookmarks.length;
            folderCount = folders.length;
        }

        const lastSyncTimestamp = db.getLastSyncForUser(userId);

        console.log(`Found ${bookmarkCount} bookmarks and ${folderCount} folders (master collection only)`);

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
app.get('/api/v1/sync/master-collection', authenticate, async (req: Request, res: Response) => {
    try {
        console.log('\n=== Master Collection Request ===');
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

        // Get folders and bookmarks from the default/master collection only
        const defaultCollection = db.getDefaultCollection(userId);
        let folders: any[] = [];
        let bookmarks: any[] = [];

        if (defaultCollection) {
            folders = db.getFoldersByCollection(defaultCollection.id, userId);
            bookmarks = db.getBookmarksByCollection(defaultCollection.id, userId);
        } else {
            // Fallback: if no default collection, get items with null/empty collectionId
            folders = db.getFoldersByCollection(null, userId);
            bookmarks = db.getBookmarksByCollection(null, userId);
        }

        console.log(`Found ${bookmarks.length} bookmarks and ${folders.length} folders (master collection)`);

        // Create a record of this master collection fetch
        db.createSyncHistory({
            userId,
            deviceId,
            type: 'SYNC',
            changesCount: bookmarks.length + folders.length,
            status: 'SUCCESS',
            details: {
                bookmarksProcessed: bookmarks.length,
                foldersProcessed: folders.length
            },
            metadata: {
                timestamp: Date.now(),
                action: 'MASTER_COLLECTION_FETCH'
            }
        });

        const response = {
            success: true,
            data: {
                folders,
                bookmarks,
                timestamp: Date.now()
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
app.post('/api/v1/sync/merge', authenticate, checkBookmarkLimit, async (req: Request, res: Response) => {
    try {
        console.log('\n=== Merge Sync Request ===');
        const authUser = (req as Request & { user?: { id: string } }).user;
        if (!authUser) {
            return res.status(401).json({
                success: false,
                error: { message: 'Unauthorized' }
            });
        }
        const userId = authUser.id;

        // Ensure default collection exists when syncing
        const defaultCollectionId = db.ensureDefaultCollection(userId);
        const preMergeSnapshot = db.getCollectionSnapshot(defaultCollectionId, userId);

        const { bookmarks, folders, deviceId, metadata } = req.body as InitialSyncRequest;
        console.log(`Device ID: ${deviceId}`);
        console.log(`Received ${bookmarks.length} bookmarks and ${folders.length} folders for merge`);

        // Generate a unique session ID for this merge operation (for rollback support)
        const sessionId = crypto.randomUUID();
        const sourceBrowser = metadata.deviceInfo.browser;
        console.log(`Session ID: ${sessionId}`);
        console.log(`Source Browser: ${sourceBrowser}`);

        // Register browser
        const deviceInfo = metadata.deviceInfo;
        db.registerBrowser({
            browserInstanceId: deviceInfo.browserInstanceId,
            userId,
            deviceId: deviceInfo.deviceId,
            browser: deviceInfo.browser,
            browserVersion: deviceInfo.browserVersion,
            os: deviceInfo.os,
            osVersion: deviceInfo.osVersion,
            userAgent: metadata.userAgent
        });

        let foldersCreated = 0;
        let foldersSkipped = 0;
        let bookmarksCreated = 0;
        let bookmarksSkipped = 0;
        const response = db.transaction(() => {
            const existingFolders = db.getFoldersByUserId(userId);
            const existingBookmarks = db.getBookmarksByUserId(userId);
            console.log(`Existing master: ${existingFolders.length} folders, ${existingBookmarks.length} bookmarks`);

            const existingFolderMap = new Map<string, { title: string; parentId: string | null; masterParentId: string | null; masterId: string }>();
            for (const f of existingFolders) {
                existingFolderMap.set(f.masterId, {
                    title: f.title,
                    parentId: f.browserId,
                    masterParentId: f.masterParentId,
                    masterId: f.masterId
                });
            }

            const existingFolderPathMap = new Map<string, string>();
            for (const f of existingFolders) {
                const path = buildFolderPath(f.masterId, existingFolderMap);
                existingFolderPathMap.set(path, f.masterId);
            }

            console.log('=== Existing folder paths ===');
            existingFolderPathMap.forEach((masterId, path) => {
                console.log(`  ${path} -> ${masterId}`);
            });

            const existingBookmarkKeys = new Set<string>();
            for (const b of existingBookmarks) {
                const folderPath = b.masterParentId ? buildFolderPath(b.masterParentId, existingFolderMap) : '';
                const key = (folderPath + '|' + b.url).toLowerCase();
                existingBookmarkKeys.add(key);
            }

            const incomingFolderMap = new Map<string, { title: string; parentId: string | null; browserId: string }>();
            for (const f of folders) {
                const id = String(f.id);
                const parentId = f.parentId ? String(f.parentId) : null;

                incomingFolderMap.set(id, {
                    title: f.title,
                    parentId: parentId,
                    browserId: id
                });
                f.id = id;
                if (f.parentId) f.parentId = parentId || undefined;
            }

            const browserIdToMasterId = new Map<string, string>();

            for (const f of existingFolders) {
                if (f.browserId) {
                    browserIdToMasterId.set(f.browserId, f.masterId);
                }
            }

            const processedFolders = new Set<string>();
            const IGNORED_TITLES = new Set(['Most Visited', 'Recent Tags', 'Recently Bookmarked']);
            const filteredFolders = folders.filter((f: any) => {
                if (!f.title || f.title.trim() === '') {
                    console.log(`Skipping empty-titled folder: ${f.id}`);
                    processedFolders.add(f.id);
                    return false;
                }
                if (IGNORED_TITLES.has(f.title)) {
                    console.log(`Skipping ignored folder: ${f.title}`);
                    processedFolders.add(f.id);
                    return false;
                }
                return true;
            });
            const folderQueue = [...filteredFolders];
            let maxIterations = filteredFolders.length * 2;

            while (folderQueue.length > 0 && maxIterations-- > 0) {
                const folder = folderQueue.shift()!;

                const parentProcessed = !folder.parentId ||
                    isRootFolderId(folder.parentId) ||
                    processedFolders.has(folder.parentId) ||
                    browserIdToMasterId.has(folder.parentId);

                if (!parentProcessed) {
                    folderQueue.push(folder);
                    continue;
                }

                processedFolders.add(folder.id);

                const buildIncomingPath = (folderId: string): string => {
                    const parts: string[] = [];
                    let currentId: string | null = folderId;
                    const visited = new Set<string>();
                    const pathLog: string[] = [];

                    while (currentId && !visited.has(currentId)) {
                        visited.add(currentId);

                        if (ROOT_ID_TO_CANONICAL[currentId]) {
                            const normalized = ROOT_ID_TO_CANONICAL[currentId];
                            parts.unshift(normalized);
                            pathLog.push(`[Stop] Root ID matched in map: "${currentId}" -> "${normalized}"`);
                            break;
                        }

                        const f = incomingFolderMap.get(currentId);
                        if (!f) {
                            pathLog.push(`[Break] No folder found for id ${currentId}`);
                            break;
                        }

                        if (isRootFolderId(f.browserId)) {
                            const normalized = normalizeRootFolderName(f.title);
                            parts.unshift(normalized);
                            pathLog.push(`[Stop] Root ID encountered: "${f.title}" -> "${normalized}"`);
                            break;
                        }

                        if (isRootFolderTitle(f.title)) {
                            const normalized = normalizeRootFolderName(f.title);
                            parts.unshift(normalized);
                            pathLog.push(`[Stop] Root title encountered: "${f.title}" -> "${normalized}"`);
                            break;
                        }

                        if (f.title && f.title.trim() !== '') {
                            const normalized = normalizeRootFolderName(f.title);
                            parts.unshift(normalized);
                            pathLog.push(`[Add] "${f.title}" -> "${normalized}"`);
                        } else {
                            pathLog.push(`[Skip] Empty title for id ${currentId}`);
                        }
                        currentId = f.parentId;
                    }
                    const result = parts.join('/').toLowerCase();
                    if (result.includes('design2') || result.includes('design')) {
                        console.log(`Path build for ${folderId}: ${result}`);
                        console.log(`  Trace: ${pathLog.join(' <- ')}`);
                    }
                    return result;
                };

                const incomingPath = buildIncomingPath(folder.id);

                if (existingFolderPathMap.has(incomingPath)) {
                    const existingMasterId = existingFolderPathMap.get(incomingPath)!;
                    browserIdToMasterId.set(folder.id, existingMasterId);
                    foldersSkipped++;
                    console.log(`Folder exists: ${incomingPath} -> ${existingMasterId}`);
                } else {
                    let masterParentId: string | null = null;
                    if (folder.parentId && folder.parentId !== '0' && !isRootFolderId(folder.parentId)) {
                        masterParentId = browserIdToMasterId.get(folder.parentId) || null;
                        console.log(`  Parent lookup: folder.parentId=${folder.parentId}, masterParentId=${masterParentId}`);
                        console.log(`  browserIdToMasterId keys: ${Array.from(browserIdToMasterId.keys()).join(', ')}`);
                    }

                    try {
                        const result = db.createFolder({
                            ...folder,
                            masterParentId,
                            userId,
                            collectionId: defaultCollectionId,
                            sourceBrowser,
                            sessionId,
                            metadata
                        });
                        browserIdToMasterId.set(folder.id, result.masterId);
                        existingFolderPathMap.set(incomingPath, result.masterId);
                        existingFolderMap.set(result.masterId, {
                            title: folder.title,
                            parentId: folder.id,
                            masterParentId,
                            masterId: result.masterId
                        });
                        foldersCreated++;
                        console.log(`Created folder: ${incomingPath} -> ${result.masterId}`);
                    } catch (err) {
                        console.error(`Failed to create folder ${folder.title}:`, err);
                    }
                }
            }

            const filteredBookmarks = bookmarks.filter((b: any) =>
                b.url &&
                b.url.trim() !== '' &&
                !b.url.startsWith('place:')
            );

            for (const bookmark of filteredBookmarks) {
                let masterParentId: string | null = null;
                if (bookmark.parentId && bookmark.parentId !== '0') {
                    masterParentId = browserIdToMasterId.get(bookmark.parentId) || null;
                }

                const folderPath = masterParentId ? buildFolderPath(masterParentId, existingFolderMap) : '';
                const dedupeKey = (folderPath + '|' + bookmark.url).toLowerCase();

                if (existingBookmarkKeys.has(dedupeKey)) {
                    bookmarksSkipped++;
                    console.log(`Bookmark exists: ${bookmark.url} in ${folderPath}`);
                } else {
                    try {
                        db.createBookmark({
                            ...bookmark,
                            masterParentId,
                            userId,
                            collectionId: defaultCollectionId,
                            sourceBrowser,
                            sessionId,
                            metadata
                        });
                        existingBookmarkKeys.add(dedupeKey);
                        bookmarksCreated++;
                        console.log(`Created bookmark: ${bookmark.title} - ${bookmark.url}`);
                    } catch (err) {
                        console.error(`Failed to create bookmark ${bookmark.url}:`, err);
                    }
                }
            }

            db.createSyncHistory({
                userId,
                deviceId,
                type: 'MERGE_IMPORT',
                changesCount: foldersCreated + bookmarksCreated,
                status: 'SUCCESS',
                collectionId: defaultCollectionId,
                sessionId,
                details: {
                    changesProcessed: foldersCreated + bookmarksCreated,
                    bookmarksProcessed: bookmarksCreated + bookmarksSkipped,
                    foldersProcessed: foldersCreated + foldersSkipped,
                    foldersCreated,
                    foldersSkipped,
                    bookmarksCreated,
                    bookmarksSkipped,
                    sessionId,
                    sourceBrowser,
                    collectionId: defaultCollectionId
                },
                metadata
            });

            const eventId = db.createCollectionEvent({
                userId,
                collectionId: defaultCollectionId,
                type: 'MERGE_IMPORT',
                sourceBrowser,
                sessionId,
                changesCount: foldersCreated + bookmarksCreated,
                snapshot: preMergeSnapshot,
                details: {
                    foldersCreated,
                    foldersSkipped,
                    bookmarksCreated,
                    bookmarksSkipped,
                    sourceBrowser,
                    sessionId
                }
            });

            return {
            success: true,
            data: {
                action: 'MERGE_COMPLETE',
                eventId,
                sessionId,
                sourceBrowser,
                foldersCreated,
                foldersSkipped,
                bookmarksCreated,
                bookmarksSkipped,
                totalMasterFolders: existingFolders.length + foldersCreated,
                totalMasterBookmarks: existingBookmarks.length + bookmarksCreated
            }
            };
        });
        console.log('Merge completed:', response);
        res.json(response);
    } catch (err) {
        const error = err as Error;
        console.error('Merge error:', error);
        res.status(500).json({
            success: false,
            error: {
                message: 'Failed to merge bookmarks',
                details: error.message
            }
        });
    }
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

        if (!url) {
            return res.status(400).json({
                success: false,
                error: { message: 'URL is required' }
            });
        }

        console.log(`Capturing URL: ${url}, Title: ${title || 'Untitled'}`);

        // Resolve masterParentId if parentId provided
        let resolvedMasterParentId = masterParentId;
        if (!resolvedMasterParentId && parentId) {
            resolvedMasterParentId = db.getFolderMasterIdByBrowserId(parentId, userId);
        }

        // Create the bookmark
        const result = db.createBookmark({
            browserId: `mobile-${Date.now()}`, // Generate a unique browserId for mobile captures
            url,
            title: title || url,
            parentId: parentId || '1', // Default to Bookmarks Bar if not specified
            masterParentId: resolvedMasterParentId,
            position: 0,
            dateAdded: Date.now(),
            userId,
            metadata: {
                timestamp: Date.now(),
                deviceInfo: {
                    browserInstanceId: 'mobile-app',
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
                createdAt: Date.now()
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
