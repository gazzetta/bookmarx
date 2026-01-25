// src/server/server.ts
import express, { Request, Response, RequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { db } from './db/database';
import { InitialSyncRequest, SyncRequest } from './types/sync';
import { getBookmarkTree } from './api/bookmarks';
import { registerWithEmail, loginWithEmail, loginWithGoogle, getMe } from './api/auth';
import { authenticate } from './middleware/auth';



dotenv.config();

const app = express();
const PORT = process.env.PORT || 3005;

// Middleware
app.use(cors());
app.use(helmet());
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
        const { changes, deviceId } = req.body as SyncRequest;

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
            details: {
                bookmarksProcessed: changes.filter(c => c.data.type === 'bookmark').length,
                foldersProcessed: changes.filter(c => c.data.type === 'folder').length
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

        // Process initial sync
        const folderResults = [];
        const bookmarkResults = [];

        try {
            // Insert all folders first
            console.log('\nProcessing folders...');
            for (const folder of folders) {
                console.log(`Creating folder: ${folder.title} (${folder.id})`);
                folderResults.push(
                    db.createFolder({
                        ...folder,
                        userId,
                        metadata
                    })
                );
            }

            // Then insert all bookmarks
            console.log('\nProcessing bookmarks...');
            for (const bookmark of bookmarks) {
                console.log(`Creating bookmark: ${bookmark.title} - ${bookmark.url} (${bookmark.id})`);
                bookmarkResults.push(
                    db.createBookmark({
                        ...bookmark,
                        userId,
                        metadata
                    })
                );
            }

            // Create sync history entry
            console.log('\nCreating sync history entry...');
            db.createSyncHistory({
                userId,
                deviceId,
                type: 'INITIAL_IMPORT',
                changesCount: bookmarks.length + folders.length,
                status: 'SUCCESS',
                details: {
                    bookmarksProcessed: bookmarks.length,
                    foldersProcessed: folders.length
                },
                metadata
            });

            const result = {
                success: true,
                data: {
                    action: 'INITIAL_IMPORT_COMPLETE',
                    imported: {
                        folders: folderResults.length,
                        bookmarks: bookmarkResults.length
                    }
                }
            };
            console.log('\nInitial sync completed successfully:', result);
            res.json(result);

        } catch (err) {
            console.error('\nError during initial sync processing:', err);
            throw err;
        }

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

// Mount routes
app.post('/api/v1/sync', authenticate, handleSync);
app.post('/api/v1/sync/initial', authenticate, handleInitialSync);
app.get('/api/v1/bookmarks/tree/:userId', authenticate, getBookmarkTree);

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

        // Get counts from database
        const bookmarkCount = db.getBookmarkCountForUser(userId);
        const folderCount = db.getFolderCountForUser(userId);
        const lastSyncTimestamp = db.getLastSyncForUser(userId);

        console.log(`Found ${bookmarkCount} bookmarks and ${folderCount} folders`);

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

        // Get all folders and bookmarks for this user
        const folders = db.getFoldersByUserId(userId);
        const bookmarks = db.getBookmarksByUserId(userId);

        console.log(`Found ${bookmarks.length} bookmarks and ${folders.length} folders`);

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

// URL normalization for better deduplication
function normalizeUrl(url: string): string {
    try {
        const parsed = new URL(url);
        // Normalize to lowercase host
        let normalized = parsed.protocol + '//' + parsed.host.toLowerCase();
        // Normalize path (remove trailing slash for non-root paths)
        let pathname = parsed.pathname;
        if (pathname.length > 1 && pathname.endsWith('/')) {
            pathname = pathname.slice(0, -1);
        }
        normalized += pathname;
        // Sort and include query string if present
        if (parsed.search) {
            const params = new URLSearchParams(parsed.search);
            const sortedParams = new URLSearchParams([...params.entries()].sort());
            const searchStr = sortedParams.toString();
            if (searchStr) {
                normalized += '?' + searchStr;
            }
        }
        // Include hash if present
        if (parsed.hash) {
            normalized += parsed.hash;
        }
        return normalized.toLowerCase();
    } catch {
        // If URL parsing fails, just lowercase and trim
        return url.toLowerCase().trim();
    }
}

// Root folder alias mapping for cross-browser compatibility
// These map to canonical names that should be treated as equivalent
const ROOT_FOLDER_ALIASES: Record<string, string[]> = {
    'bookmarks bar': ['bookmarks toolbar', 'toolbar'],
    'other bookmarks': ['unfiled bookmarks', 'other'],
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

// Map browser-specific root IDs to canonical folder names
// These are the folders that should be treated as TOP-LEVEL roots
const ROOT_ID_TO_CANONICAL: Record<string, string> = {
    'toolbar_____': 'bookmarks bar',      // Firefox Bookmarks Toolbar -> bookmarks bar
    'unfiled_____': 'other bookmarks',    // Firefox Other Bookmarks
    'mobile______': 'mobile bookmarks',   // Firefox Mobile
    '1': 'bookmarks bar',                 // Chrome Bookmarks Bar
    '2': 'other bookmarks',               // Chrome Other Bookmarks  
    '3': 'mobile bookmarks'               // Chrome Mobile Bookmarks
};

// These IDs should be SKIPPED when building paths (they are containers, not real folders)
// Firefox's menu________ contains toolbar_____, unfiled_____, etc. but we don't want 
// "bookmarks menu" to appear in paths for items under toolbar_____
const SKIP_IN_PATH_IDS = new Set([
    'root________',   // Firefox super-root
    'menu________',   // Firefox Bookmarks Menu (container for toolbar, etc.)
    '0'               // Chrome root
]);

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

function buildFolderPath(folderId: string, folderMap: Map<string, { title: string; parentId: string | null; masterParentId: string | null; browserId?: string | null }>): string {
    const parts: string[] = [];
    let currentId: string | null = folderId;
    const visited = new Set<string>();

    while (currentId && !visited.has(currentId)) {
        visited.add(currentId);

        // First, check if this ID is a known root ID (browser-specific)
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

        // Check if the folder's browserId is a known root ID
        if (folder.browserId && ROOT_ID_TO_CANONICAL[folder.browserId]) {
            parts.unshift(ROOT_ID_TO_CANONICAL[folder.browserId]);
            break;
        }

        // Check if the folder's browser parentId is a known root ID (folder is direct child of root)
        if (folder.parentId && ROOT_ID_TO_CANONICAL[folder.parentId]) {
            // Add this folder's title first, then the root
            const normalizedTitle = normalizeRootFolderName(folder.title);
            if (normalizedTitle && normalizedTitle.trim() !== '') {
                parts.unshift(normalizedTitle);
            }
            parts.unshift(ROOT_ID_TO_CANONICAL[folder.parentId]);
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

        // Move to parent using masterParentId (the universal parent reference)
        // Only fall back to parentId if masterParentId is not set
        const nextId = folder.masterParentId;
        if (!nextId) {
            // No masterParentId - this folder might be at root level
            // Check if parentId is a browser-specific root
            if (folder.parentId && ROOT_ID_TO_CANONICAL[folder.parentId]) {
                parts.unshift(ROOT_ID_TO_CANONICAL[folder.parentId]);
            }
            break;
        }
        
        // Check if the parent is a root ID before trying map lookup
        if (ROOT_ID_TO_CANONICAL[nextId]) {
            parts.unshift(ROOT_ID_TO_CANONICAL[nextId]);
            break;
        }
        currentId = nextId;
    }

    return parts.join('/').toLowerCase();
}

// Merge local bookmarks into master collection with dedupe
app.post('/api/v1/sync/merge', authenticate, async (req: Request, res: Response) => {
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
        const { bookmarks, folders, deviceId, metadata } = req.body as InitialSyncRequest;
        console.log(`Device ID: ${deviceId}`);
        console.log(`Received ${bookmarks.length} bookmarks and ${folders.length} folders for merge`);

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

        // Get existing master collection
        const existingFolders = db.getFoldersByUserId(userId);
        const existingBookmarks = db.getBookmarksByUserId(userId);
        console.log(`Existing master: ${existingFolders.length} folders, ${existingBookmarks.length} bookmarks`);

        // Build folder path map for existing folders
        // NOTE: We need to track BOTH masterId AND browserId for lookups
        // The map is keyed by masterId, but we also need a reverse lookup for path building
        const existingFolderMap = new Map<string, { title: string; parentId: string | null; masterParentId: string | null; masterId: string; browserId: string | null }>();
        const masterIdByBrowserId = new Map<string, string>(); // browserId -> masterId for existing folders
        
        for (const f of existingFolders) {
            existingFolderMap.set(f.masterId, {
                title: f.title,
                parentId: f.parentId,  // This is the browser's parentId, used for root detection
                masterParentId: f.masterParentId,  // This is what we use to traverse up the tree
                masterId: f.masterId,
                browserId: f.browserId
            });
            if (f.browserId) {
                masterIdByBrowserId.set(f.browserId, f.masterId);
            }
        }

        // Build path -> masterId lookup for existing folders
        const existingFolderPathMap = new Map<string, string>();
        for (const f of existingFolders) {
            const path = buildFolderPath(f.masterId, existingFolderMap);
            existingFolderPathMap.set(path, f.masterId);
        }

        // Debug: Log all existing folder paths
        console.log('=== Existing folder paths ===');
        existingFolderPathMap.forEach((masterId, path) => {
            console.log(`  ${path} -> ${masterId}`);
        });

        // Build existing bookmark dedupe set: folderPath + '|' + normalizedUrl
        const existingBookmarkKeys = new Set<string>();
        for (const b of existingBookmarks) {
            const folderPath = b.masterParentId ? buildFolderPath(b.masterParentId, existingFolderMap) : '';
            const normalizedBookmarkUrl = normalizeUrl(b.url);
            const key = (folderPath + '|' + normalizedBookmarkUrl).toLowerCase();
            existingBookmarkKeys.add(key);
        }

        // Process incoming folders - build their path map first
        const incomingFolderMap = new Map<string, { title: string; parentId: string | null; browserId: string }>();
        for (const f of folders) {
            // Ensure IDs are strings
            const id = String(f.id);
            const parentId = f.parentId ? String(f.parentId) : null;

            incomingFolderMap.set(id, {
                title: f.title,
                parentId: parentId,
                browserId: id
            });
            // Update the original object too to match types
            f.id = id;
            if (f.parentId) f.parentId = parentId || undefined;
        }

        // Map incoming browserId -> masterParentId for folders we create
        const browserIdToMasterId = new Map<string, string>();

        // Copy existing folder mappings (for root folders that map by title)
        for (const f of existingFolders) {
            if (f.browserId) {
                browserIdToMasterId.set(f.browserId, f.masterId);
            }
        }

        let foldersCreated = 0;
        let foldersSkipped = 0;
        let bookmarksCreated = 0;
        let bookmarksSkipped = 0;

        // Process folders in order (parents first)
        const processedFolders = new Set<string>();
        // Filter out the Firefox super-root (empty titled folder with root________ id)
        const IGNORED_TITLES = new Set(['Most Visited', 'Recent Tags', 'Recently Bookmarked']);
        
        // Root-level folders that should be mapped, not created as new folders
        // These exist in every browser and should be treated as the same
        const ROOT_FOLDER_TITLES = new Set([
            'bookmarks bar', 'bookmarks toolbar',
            'other bookmarks', 'unfiled bookmarks', 
            'mobile bookmarks',
            'bookmarks menu'  // Firefox container - skip entirely
        ]);
        
        const filteredFolders = folders.filter((f: any) => {
            const folderId = String(f.id);
            
            // Skip empty-titled folders (Firefox root)
            if (!f.title || f.title.trim() === '') {
                console.log(`Skipping empty-titled folder: ${folderId}`);
                processedFolders.add(folderId);
                return false;
            }
            
            // Skip ignored titles (Firefox special folders)
            if (IGNORED_TITLES.has(f.title)) {
                console.log(`Skipping ignored folder: ${f.title}`);
                processedFolders.add(folderId);
                return false;
            }
            
            // Skip Firefox/Chrome root IDs - these are handled specially
            if (SKIP_IN_PATH_IDS.has(folderId) || ROOT_ID_TO_CANONICAL[folderId]) {
                console.log(`Skipping browser root folder: ${f.title} (${folderId})`);
                processedFolders.add(folderId);
                // Map root folders so children can find them
                // Don't add to browserIdToMasterId here - they'll be matched by path
                return false;
            }
            
            // Skip root-level folder titles (Bookmarks Bar, Bookmarks Toolbar, etc.)
            // These should not be created as new folders - they're matched by path
            const normalizedTitle = f.title.toLowerCase().trim();
            if (ROOT_FOLDER_TITLES.has(normalizedTitle)) {
                console.log(`Skipping root folder by title: ${f.title} (${folderId})`);
                processedFolders.add(folderId);
                return false;
            }
            
            return true;
        });
        const folderQueue = [...filteredFolders];
        let maxIterations = filteredFolders.length * 2;

        while (folderQueue.length > 0 && maxIterations-- > 0) {
            const folder = folderQueue.shift()!;

            // Check if parent is processed or is a root (including Firefox special IDs)
            const parentProcessed = !folder.parentId ||
                isRootFolderId(folder.parentId) ||
                processedFolders.has(folder.parentId) ||
                browserIdToMasterId.has(folder.parentId);

            if (!parentProcessed) {
                folderQueue.push(folder);
                continue;
            }

            processedFolders.add(folder.id);

            // Build path for this incoming folder
            const buildIncomingPath = (folderId: string): string => {
                const parts: string[] = [];
                let currentId: string | null = folderId;
                const visited = new Set<string>();

                // Debug log for folder path construction
                const pathLog: string[] = [];

                while (currentId && !visited.has(currentId)) {
                    visited.add(currentId);

                    // Skip IDs that shouldn't appear in paths (Firefox root containers)
                    if (SKIP_IN_PATH_IDS.has(currentId)) {
                        pathLog.push(`[Skip] Container ID: "${currentId}"`);
                        break;
                    }

                    // Check for Root IDs via explicit map FIRST
                    // This handles toolbar_____, unfiled_____, etc.
                    if (ROOT_ID_TO_CANONICAL[currentId]) {
                        const normalized = ROOT_ID_TO_CANONICAL[currentId];
                        parts.unshift(normalized);
                        pathLog.push(`[Stop] Root ID matched: "${currentId}" -> "${normalized}"`);
                        break;
                    }

                    const f = incomingFolderMap.get(currentId);
                    if (!f) {
                        pathLog.push(`[Break] No folder found for id ${currentId}`);
                        break;
                    }

                    // Check if this folder's browserId is a known root
                    if (f.browserId && ROOT_ID_TO_CANONICAL[f.browserId]) {
                        const normalized = ROOT_ID_TO_CANONICAL[f.browserId];
                        parts.unshift(normalized);
                        pathLog.push(`[Stop] Folder browserId is root: "${f.browserId}" -> "${normalized}"`);
                        break;
                    }

                    // Check if parent is a skip ID (Firefox container like menu________)
                    // In this case, we should check if the CURRENT folder is a root by title
                    if (f.parentId && SKIP_IN_PATH_IDS.has(f.parentId)) {
                        // This folder's parent is a container - treat this folder as root level
                        if (isRootFolderTitle(f.title)) {
                            const normalized = normalizeRootFolderName(f.title);
                            parts.unshift(normalized);
                            pathLog.push(`[Stop] Root title under container: "${f.title}" -> "${normalized}"`);
                        } else {
                            // Non-root folder directly under container - add it and stop
                            const normalized = normalizeRootFolderName(f.title);
                            if (normalized && normalized.trim() !== '') {
                                parts.unshift(normalized);
                                pathLog.push(`[Add+Stop] Folder under container: "${f.title}" -> "${normalized}"`);
                            }
                        }
                        break;
                    }

                    // Stop at root-level folders (Bookmarks bar, Other bookmarks, etc.) by Title
                    if (isRootFolderTitle(f.title)) {
                        const normalized = normalizeRootFolderName(f.title);
                        parts.unshift(normalized);
                        pathLog.push(`[Stop] Root title: "${f.title}" -> "${normalized}"`);
                        break;
                    }

                    // Regular folder - add to path and continue up
                    if (f.title && f.title.trim() !== '') {
                        const normalized = normalizeRootFolderName(f.title);
                        parts.unshift(normalized);
                        pathLog.push(`[Add] "${f.title}" -> "${normalized}"`);
                    } else {
                        pathLog.push(`[Skip] Empty title for id ${currentId}`);
                    }
                    
                    // Move to parent, but check if parent should be skipped
                    if (f.parentId && SKIP_IN_PATH_IDS.has(f.parentId)) {
                        pathLog.push(`[Stop] Parent is skip container: "${f.parentId}"`);
                        break;
                    }
                    
                    currentId = f.parentId;
                }
                
                const result = parts.join('/').toLowerCase();
                // Log path building for debugging
                console.log(`Path build for ${folderId}: ${result}`);
                console.log(`  Trace: ${pathLog.join(' <- ')}`);
                return result;
            };

            const incomingPath = buildIncomingPath(folder.id);

            // Check if folder path already exists
            if (existingFolderPathMap.has(incomingPath)) {
                const existingMasterId = existingFolderPathMap.get(incomingPath)!;
                browserIdToMasterId.set(folder.id, existingMasterId);
                foldersSkipped++;
                console.log(`Folder exists: ${incomingPath} -> ${existingMasterId}`);
            } else {
                // Create new folder
                let masterParentId: string | null = null;
                if (folder.parentId && folder.parentId !== '0' && !isRootFolderId(folder.parentId)) {
                    masterParentId = browserIdToMasterId.get(folder.parentId) || null;
                    console.log(`  Parent lookup: folder.parentId=${folder.parentId}, masterParentId=${masterParentId}`);
                    console.log(`  browserIdToMasterId keys: ${[...browserIdToMasterId.keys()].join(', ')}`);
                }

                try {
                    const result = db.createFolder({
                        ...folder,
                        masterParentId,
                        userId,
                        metadata
                    });
                    browserIdToMasterId.set(folder.id, result.masterId);
                    existingFolderPathMap.set(incomingPath, result.masterId);
                    existingFolderMap.set(result.masterId, {
                        title: folder.title,
                        parentId: folder.parentId || null,  // Browser's parentId for root detection
                        masterParentId,
                        masterId: result.masterId,
                        browserId: folder.id  // The incoming folder's browser ID
                    });
                    foldersCreated++;
                    console.log(`Created folder: ${incomingPath} -> ${result.masterId}`);
                } catch (err) {
                    console.error(`Failed to create folder ${folder.title}:`, err);
                }
            }
        }

        // Process bookmarks with dedupe
        const filteredBookmarks = bookmarks.filter((b: any) =>
            b.url &&
            b.url.trim() !== '' &&
            !b.url.startsWith('place:')
        );

        for (const bookmark of filteredBookmarks) {
            // Get master parent ID
            let masterParentId: string | null = null;
            if (bookmark.parentId && bookmark.parentId !== '0') {
                masterParentId = browserIdToMasterId.get(bookmark.parentId) || null;
            }

            // Build folder path for dedupe key using normalized URL
            const folderPath = masterParentId ? buildFolderPath(masterParentId, existingFolderMap) : '';
            const normalizedBookmarkUrl = normalizeUrl(bookmark.url);
            const dedupeKey = (folderPath + '|' + normalizedBookmarkUrl).toLowerCase();

            if (existingBookmarkKeys.has(dedupeKey)) {
                bookmarksSkipped++;
                console.log(`Bookmark exists: ${bookmark.url} in ${folderPath}`);
            } else {
                try {
                    db.createBookmark({
                        ...bookmark,
                        masterParentId,
                        userId,
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

        // Create sync history entry
        db.createSyncHistory({
            userId,
            deviceId,
            type: 'MERGE_IMPORT',
            changesCount: foldersCreated + bookmarksCreated,
            status: 'SUCCESS',
            details: {
                foldersCreated,
                foldersSkipped,
                bookmarksCreated,
                bookmarksSkipped
            },
            metadata
        });

        const response = {
            success: true,
            data: {
                action: 'MERGE_COMPLETE',
                foldersCreated,
                foldersSkipped,
                bookmarksCreated,
                bookmarksSkipped,
                totalMasterFolders: existingFolders.length + foldersCreated,
                totalMasterBookmarks: existingBookmarks.length + bookmarksCreated
            }
        };
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
const startServer = () => {
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

// Handle graceful shutdown
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
