// src/server/server.ts
import express, { Request, Response, RequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { db } from './db/database';
import { InitialSyncRequest } from './types/sync';

interface SyncRequest {
    changes: Array<{
        type: 'CREATE' | 'UPDATE' | 'DELETE';
        data: any;
        metadata: any;
        timestamp: number;
    }>;
    deviceId: string;
    timestamp: number;
}

const app = express();
const PORT = process.env.PORT || 3005;

// Middleware
app.use(cors());
app.use(helmet());
app.use(express.json());

const handleSync: RequestHandler = async (req, res) => {
    try {
        console.log('\n=== Sync Request ===');
        const { changes, deviceId } = req.body as SyncRequest;

        // Check if this is the first sync
        const existingBookmarks = db.getBookmarkCount(deviceId);
        const isInitialSync = existingBookmarks === 0;
        console.log(`Is initial sync needed? ${isInitialSync}`);

        if (isInitialSync) {
            return res.json({
                success: true,
                data: {
                    action: 'NEED_INITIAL_IMPORT',
                    message: 'No existing bookmarks found. Please perform initial import.'
                }
            });
        }

        // Process changes
        const results = [];
        for (const change of changes) {
            const { type, data, metadata } = change;
            console.log('Processing change:', { type, data });
            
            try {
                switch (type) {
                    case 'CREATE':
                        if (data.type === 'bookmark') {
                            results.push(db.createBookmark({ 
                                ...data,
                                metadata: {
                                    deviceInfo: {
                                        browser: metadata?.deviceInfo?.browser,
                                        browserVersion: metadata?.deviceInfo?.browserVersion,
                                        deviceId,
                                        os: metadata?.deviceInfo?.os,
                                        osVersion: metadata?.deviceInfo?.osVersion
                                    },
                                    userAgent: metadata?.userAgent,
                                    timestamp: metadata?.timestamp
                                }
                            }));
                        } else {
                            results.push(db.createFolder({ 
                                ...data,
                                metadata: {
                                    deviceInfo: {
                                        browser: metadata?.deviceInfo?.browser,
                                        browserVersion: metadata?.deviceInfo?.browserVersion,
                                        deviceId,
                                        os: metadata?.deviceInfo?.os,
                                        osVersion: metadata?.deviceInfo?.osVersion
                                    },
                                    userAgent: metadata?.userAgent,
                                    timestamp: metadata?.timestamp
                                }
                            }));
                        }
                        break;
                        
                    case 'UPDATE':
                        if (data.type === 'bookmark') {
                            results.push(db.updateBookmark({
                                ...data,
                                metadata: {
                                    deviceInfo: {
                                        browser: metadata?.deviceInfo?.browser,
                                        browserVersion: metadata?.deviceInfo?.browserVersion,
                                        deviceId,
                                        os: metadata?.deviceInfo?.os,
                                        osVersion: metadata?.deviceInfo?.osVersion
                                    },
                                    userAgent: metadata?.userAgent,
                                    timestamp: metadata?.timestamp
                                }
                            }));
                        } else {
                            results.push(db.updateFolder({
                                ...data,
                                metadata: {
                                    deviceInfo: {
                                        browser: metadata?.deviceInfo?.browser,
                                        browserVersion: metadata?.deviceInfo?.browserVersion,
                                        deviceId,
                                        os: metadata?.deviceInfo?.os,
                                        osVersion: metadata?.deviceInfo?.osVersion
                                    },
                                    userAgent: metadata?.userAgent,
                                    timestamp: metadata?.timestamp
                                }
                            }));
                        }
                        break;
                        
                    case 'DELETE':
                        if (data.type === 'bookmark') {
                            results.push(db.updateBookmark({ 
                                ...data, 
                                status: 'deleted',
                                metadata: {
                                    deviceInfo: {
                                        browser: metadata?.deviceInfo?.browser,
                                        browserVersion: metadata?.deviceInfo?.browserVersion,
                                        deviceId,
                                        os: metadata?.deviceInfo?.os,
                                        osVersion: metadata?.deviceInfo?.osVersion
                                    },
                                    userAgent: metadata?.userAgent,
                                    timestamp: metadata?.timestamp
                                }
                            }));
                        } else {
                            results.push(db.updateFolder({ 
                                ...data, 
                                status: 'deleted',
                                metadata: {
                                    deviceInfo: {
                                        browser: metadata?.deviceInfo?.browser,
                                        browserVersion: metadata?.deviceInfo?.browserVersion,
                                        deviceId,
                                        os: metadata?.deviceInfo?.os,
                                        osVersion: metadata?.deviceInfo?.osVersion
                                    },
                                    userAgent: metadata?.userAgent,
                                    timestamp: metadata?.timestamp
                                }
                            }));
                        }
                        break;
                }
            } catch (err) {
                console.error(`Error processing change:`, err);
                results.push({ error: err instanceof Error ? err.message : 'Unknown error' });
            }
        }

        // Create sync history entry
        db.createSyncHistory({
            userId: deviceId,
            deviceId,
            type: 'SYNC',
            changesCount: changes.length,
            status: 'SUCCESS',
            details: {
                bookmarksProcessed: changes.filter(c => c.data.type === 'bookmark').length,
                foldersProcessed: changes.filter(c => c.data.type === 'folder').length
            },
            metadata: changes[0]?.metadata // Use metadata from first change
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
        const { bookmarks, folders, deviceId, metadata } = req.body as InitialSyncRequest;
        console.log(`Device ID: ${deviceId}`);
        console.log(`Received ${bookmarks.length} bookmarks and ${folders.length} folders`);
        console.log('Device Info:', metadata.deviceInfo);

        // Register browser first
        console.log('\nRegistering browser...');
        const deviceInfo = metadata.deviceInfo;
        db.registerBrowser({
            browserInstanceId: deviceInfo.browserInstanceId,
            userId: deviceId,
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
                        userId: deviceId,
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
                        userId: deviceId,
                        metadata
                    })
                );
            }

            // Create sync history entry
            console.log('\nCreating sync history entry...');
            db.createSyncHistory({
                userId: deviceId,
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

// Mount routes
app.post('/api/v1/sync', handleSync);
app.post('/api/v1/sync/initial', handleInitialSync);

// Get sync status
app.get('/api/v1/sync/status', async (req: Request, res: Response) => {
    try {
        const deviceId = req.headers['x-device-id'] as string;
        if (!deviceId) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Device ID is required'
                }
            });
        }

        // Check if initial sync is needed
        const bookmarkCount = db.getBookmarkCount(deviceId);
        const needsInitialSync = bookmarkCount === 0;

        // For now, just return a simple status
        res.json({
            success: true,
            data: {
                needsInitialSync,
                pendingChanges: {
                    adds: 0,
                    updates: 0,
                    moves: 0,
                    deletes: 0
                }
            }
        });
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