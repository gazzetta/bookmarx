import { Request, Response } from 'express';
import { db } from '../db/database';
import { SyncRequest, InitialSyncRequest, SyncChange } from '../types/sync';

export const handleSync = async (req: Request, res: Response) => {
    try {
        console.log('\n=== Sync Request ===');
        const { changes, deviceId, metadata } = req.body as SyncRequest;
        const { deviceInfo } = metadata;

        // Register or update browser first
        db.registerBrowser({
            browserInstanceId: deviceInfo.browserInstanceId,
            userId: deviceInfo.userId,
            deviceId: deviceInfo.deviceId,
            browser: deviceInfo.browser,
            browserVersion: deviceInfo.browserVersion,
            os: deviceInfo.os,
            osVersion: deviceInfo.osVersion,
            userAgent: metadata.userAgent
        });

        // Process changes directly - remove initial sync check since we already checked in /status
        const results = [];
        
        for (const change of changes) {
            const { type, data } = change;
            
            try {
                if (type === 'UPDATE' && data.type === 'bookmark') {
                    // Format the update data correctly for the database
                    const updateData = {
                        id: data.id,
                        title: data.title,
                        url: data.url,
                        parentId: data.parentId,
                        index: data.index,
                        metadata: {
                            deviceInfo: {
                                ...deviceInfo,
                                browserInstanceId: deviceInfo.browserInstanceId
                            },
                            userAgent: metadata.userAgent,
                            timestamp: change.timestamp
                        },
                        status: 'active'
                    };

                    results.push(await db.updateBookmark(updateData));
                }
                // Add other change types handling here
            } catch (error) {
                console.error('Error processing update:', error);
                results.push({ error: error.message });
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

    } catch (error) {
        console.error('Sync error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

export const handleInitialSync = async (req: Request, res: Response) => {
    try {
        console.log('\n=== Initial Sync Request ===');
        const { bookmarks, folders, deviceId, metadata } = req.body as InitialSyncRequest;

        // Process initial sync
        const folderResults = [];
        const bookmarkResults = [];

        try {
            // Insert all folders first
            for (const folder of folders) {
                folderResults.push(
                    db.createFolder({
                        ...folder,
                        userId: deviceId,
                        metadata
                    })
                );
            }

            // Then insert all bookmarks
            for (const bookmark of bookmarks) {
                bookmarkResults.push(
                    db.createBookmark({
                        ...bookmark,
                        userId: deviceId,
                        metadata
                    })
                );
            }

            // Create sync history entry
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

            res.json({
                success: true,
                data: {
                    action: 'INITIAL_IMPORT_COMPLETE',
                    imported: {
                        folders: folderResults.length,
                        bookmarks: bookmarkResults.length
                    }
                }
            });

        } catch (err) {
            throw err;
        }

    } catch (err) {
        const error = err as Error;
        console.error('Initial sync error:', error);
        res.status(500).json({
            success: false,
            error: {
                message: 'Failed to process initial sync request',
                details: error.message
            }
        });
    }
};
