import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

interface Browser {
    browserInstanceId: string;
    userId: string;
    deviceId: string;
    browser: string;
    browserVersion: string;
    os: string;
    osVersion: string;
    userAgent: string;
}

interface BookmarkUpdate {
    id: string;
    title: string;
    url: string;
    parentId: string;
    index: number;
    metadata: {
        timestamp: number;
        deviceInfo: {
            browserInstanceId: string;
        }
    }
}

class DatabaseService {
    private db: Database.Database;
    private static instance: DatabaseService;

    private constructor() {
        const dbPath = path.join(__dirname, '../../data/bookmarx.db');
        
        // Ensure data directory exists
        const dataDir = path.dirname(dbPath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL'); // Better concurrency
        this.db.pragma('foreign_keys = ON');  // Enable foreign key constraints
        
        this.initializeDatabase();
    }

    public static getInstance(): DatabaseService {
        if (!DatabaseService.instance) {
            DatabaseService.instance = new DatabaseService();
        }
        return DatabaseService.instance;
    }

    private initializeDatabase() {
        const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
        this.db.exec(schema);
        
        // Run migrations
        this.runMigrations();
    }

    private runMigrations() {
        // Check if sync_history table has MERGE_IMPORT type support
        try {
            const tableInfo = this.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='sync_history'").get() as { sql: string } | undefined;
            if (tableInfo && !tableInfo.sql.includes('MERGE_IMPORT')) {
                console.log('Running migration: Adding MERGE_IMPORT to sync_history type constraint');
                this.db.exec(`
                    CREATE TABLE IF NOT EXISTS sync_history_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        userId TEXT NOT NULL,
                        browserInstanceId TEXT,
                        type TEXT CHECK(type IN ('INITIAL_IMPORT', 'SYNC', 'MERGE_IMPORT')) NOT NULL,
                        changesCount INTEGER NOT NULL,
                        status TEXT CHECK(status IN ('SUCCESS', 'FAILED', 'PARTIAL')) NOT NULL,
                        bookmarksProcessed INTEGER DEFAULT 0,
                        foldersProcessed INTEGER DEFAULT 0,
                        timestamp INTEGER,
                        createdAt INTEGER DEFAULT (strftime('%s', 'now')),
                        updatedAt INTEGER DEFAULT (strftime('%s', 'now')),
                        FOREIGN KEY (browserInstanceId) REFERENCES browsers(browserInstanceId)
                    );
                    
                    INSERT INTO sync_history_new SELECT * FROM sync_history;
                    DROP TABLE sync_history;
                    ALTER TABLE sync_history_new RENAME TO sync_history;
                    
                    CREATE INDEX IF NOT EXISTS idx_sync_history_userid ON sync_history(userId);
                    CREATE INDEX IF NOT EXISTS idx_sync_history_browserinstanceid ON sync_history(browserInstanceId);
                `);
                console.log('Migration completed: sync_history now supports MERGE_IMPORT');
            }
        } catch (error) {
            console.error('Migration check error:', error);
        }
    }

    // Register or update a browser instance
    public registerBrowser(browser: any) {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO browsers (
                browserInstanceId, userId, deviceId, browser, 
                browserVersion, os, osVersion, userAgent
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
            browser.browserInstanceId,
            browser.userId,  // This will now be '1' instead of deviceId
            browser.deviceId,
            browser.browser,
            browser.browserVersion,
            browser.os,
            browser.osVersion,
            browser.userAgent
        );
    }

    // Folder operations
    public createFolder(folder: any): { lastInsertRowid: number | bigint; changes: number; masterId: string } {
        const masterId = crypto.randomUUID();
        const stmt = this.db.prepare(`
            INSERT INTO folders (
                masterId, browserId, browserInstanceId, userId, title, parentId, 
                masterParentId, position, dateAdded, status, syncVersion, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const result = stmt.run(
            masterId,
            folder.browserId,
            folder.metadata?.deviceInfo?.browserInstanceId,
            folder.userId,
            folder.title,
            folder.parentId,
            folder.masterParentId || null,
            folder.position,
            folder.dateAdded,
            folder.status || 'active',
            folder.syncVersion || 1,
            folder.metadata?.timestamp
        );
        
        return { ...result, masterId };
    }

    // Bookmark operations
    public createBookmark(bookmark: any): { lastInsertRowid: number | bigint; changes: number; masterId: string } {
        const masterId = crypto.randomUUID();
        const stmt = this.db.prepare(`
            INSERT INTO bookmarks (
                masterId, browserId, browserInstanceId, userId, url, title, 
                parentId, masterParentId, position, dateAdded, status, syncVersion, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const result = stmt.run(
            masterId,
            bookmark.browserId,
            bookmark.metadata?.deviceInfo?.browserInstanceId,
            bookmark.userId,
            bookmark.url,
            bookmark.title,
            bookmark.parentId,
            bookmark.masterParentId || null,
            bookmark.position,
            bookmark.dateAdded,
            bookmark.status || 'active',
            bookmark.syncVersion || 1,
            bookmark.metadata?.timestamp
        );
        
        return { ...result, masterId };
    }

    // Sync History operations
    public createSyncHistory(sync: any) {
        const stmt = this.db.prepare(`
            INSERT INTO sync_history (
                userId, browserInstanceId, type, changesCount, status,
                bookmarksProcessed, foldersProcessed, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const result = stmt.run(
            sync.userId,
            sync.metadata?.deviceInfo?.browserInstanceId,
            sync.type,
            sync.changesCount,
            sync.status,
            sync.bookmarksProcessed || 0,
            sync.foldersProcessed || 0,
            Date.now()
        );

        return result.lastInsertRowid;
    }


    public getSyncHistoryByUserId(userId: string, limit = 10) {
        const stmt = this.db.prepare(`
            SELECT 
                sh.*,
                json_group_array(
                    json_object(
                        'type', she.type,
                        'itemId', she.itemId,
                        'message', she.message
                    )
                ) as errors
            FROM sync_history sh
            LEFT JOIN sync_history_errors she ON sh.id = she.syncHistoryId
            WHERE sh.userId = ?
            GROUP BY sh.id
            ORDER BY sh.createdAt DESC
            LIMIT ?
        `);
        return stmt.all(userId, limit);
    }

    // Get bookmark count for a user
    public getBookmarkCountForBrowser(browserInstanceId: string): number {
        const stmt = this.db.prepare(`
            SELECT COUNT(*) as count 
            FROM bookmarks 
            WHERE browserInstanceId = ? AND status = 'active'
        `);
        const result = stmt.get(browserInstanceId) as { count: number };
        return result.count;
    }

    public getLastSyncForBrowser(userId: string, browserInstanceId: string): number | null {
        // Only count sync types where the browser RECEIVED data from master
        // MERGE_IMPORT only sends data up, so it shouldn't count as having synced down
        const stmt = this.db.prepare(`
            SELECT MAX(timestamp) as lastSync 
            FROM sync_history 
            WHERE userId = ? AND browserInstanceId = ? AND status = 'SUCCESS'
              AND type IN ('INITIAL_IMPORT', 'SYNC')
        `);
        const result = stmt.get(userId, browserInstanceId) as { lastSync: number | null };
        return result.lastSync;
    }

    public getPendingChangesForBrowser(userId: string, browserInstanceId: string, lastSyncSeconds: number) {
        const bookmarkAdds = this.db.prepare(`
            SELECT COUNT(*) as count
            FROM bookmarks
            WHERE userId = ?
              AND browserInstanceId != ?
              AND status = 'active'
              AND createdAt > ?
        `).get(userId, browserInstanceId, lastSyncSeconds) as { count: number };

        const folderAdds = this.db.prepare(`
            SELECT COUNT(*) as count
            FROM folders
            WHERE userId = ?
              AND browserInstanceId != ?
              AND status = 'active'
              AND createdAt > ?
        `).get(userId, browserInstanceId, lastSyncSeconds) as { count: number };

        const bookmarkUpdates = this.db.prepare(`
            SELECT COUNT(*) as count
            FROM bookmarks
            WHERE userId = ?
              AND browserInstanceId != ?
              AND status = 'active'
              AND updatedAt > ?
              AND createdAt <= ?
        `).get(userId, browserInstanceId, lastSyncSeconds, lastSyncSeconds) as { count: number };

        const folderUpdates = this.db.prepare(`
            SELECT COUNT(*) as count
            FROM folders
            WHERE userId = ?
              AND browserInstanceId != ?
              AND status = 'active'
              AND updatedAt > ?
              AND createdAt <= ?
        `).get(userId, browserInstanceId, lastSyncSeconds, lastSyncSeconds) as { count: number };

        const bookmarkDeletes = this.db.prepare(`
            SELECT COUNT(*) as count
            FROM bookmarks
            WHERE userId = ?
              AND browserInstanceId != ?
              AND status = 'deleted'
              AND updatedAt > ?
        `).get(userId, browserInstanceId, lastSyncSeconds) as { count: number };

        const folderDeletes = this.db.prepare(`
            SELECT COUNT(*) as count
            FROM folders
            WHERE userId = ?
              AND browserInstanceId != ?
              AND status = 'deleted'
              AND updatedAt > ?
        `).get(userId, browserInstanceId, lastSyncSeconds) as { count: number };

        return {
            adds: bookmarkAdds.count,
            addsFolders: folderAdds.count,
            updates: bookmarkUpdates.count,
            updatesFolders: folderUpdates.count,
            moves: 0,
            deletes: bookmarkDeletes.count,
            deletesFolders: folderDeletes.count
        };
    }

    public getBookmarkCount(userId: string): number {
        const stmt = this.db.prepare(`
            SELECT COUNT(*) as count 
            FROM bookmarks 
            WHERE userId = ? AND status = 'active'
        `);
        const result = stmt.get(userId) as { count: number };
        return result.count;
    }

    // Update operations - now uses masterId for cross-device editing
    public updateBookmark(bookmark: any) {
        // If masterId is provided, use it (mobile/cross-device edit)
        // Otherwise fall back to browserId + browserInstanceId (legacy extension edit)
        if (bookmark.masterId) {
            const stmt = this.db.prepare(`
                UPDATE bookmarks 
                SET title = ?,
                    url = ?,
                    parentId = COALESCE(?, parentId),
                    masterParentId = COALESCE(?, masterParentId),
                    position = COALESCE(?, position),
                    status = ?,
                    syncVersion = syncVersion + 1,
                    timestamp = ?,
                    updatedAt = strftime('%s', 'now')
                WHERE masterId = ? AND userId = ?
            `);
            
            return stmt.run(
                bookmark.title,
                bookmark.url,
                bookmark.parentId,
                bookmark.masterParentId,
                bookmark.index,
                'active',
                bookmark.metadata?.timestamp || Date.now(),
                bookmark.masterId,
                bookmark.userId
            );
        } else {
            // Legacy: use browserId + browserInstanceId
            const stmt = this.db.prepare(`
                UPDATE bookmarks 
                SET title = ?,
                    url = ?,
                    parentId = ?,
                    position = ?,
                    status = ?,
                    syncVersion = syncVersion + 1,
                    timestamp = ?,
                    updatedAt = strftime('%s', 'now')
                WHERE browserId = ? AND browserInstanceId = ?
            `);
            
            return stmt.run(
                bookmark.title,
                bookmark.url,
                bookmark.parentId,
                bookmark.index,
                'active',
                bookmark.metadata?.timestamp,
                bookmark.id,
                bookmark.metadata?.deviceInfo?.browserInstanceId
            );
        }
    }

    public updateFolder(folder: any) {
        // If masterId is provided, use it (mobile/cross-device edit)
        if (folder.masterId) {
            console.log('Updating folder via masterId:', folder.masterId);
            
            const stmt = this.db.prepare(`
                UPDATE folders 
                SET title = ?, 
                    parentId = COALESCE(?, parentId), 
                    masterParentId = COALESCE(?, masterParentId),
                    position = COALESCE(?, position),
                    status = ?, 
                    syncVersion = syncVersion + 1,
                    updatedAt = strftime('%s', 'now')
                WHERE masterId = ? AND userId = ?
            `);
            
            const result = stmt.run(
                folder.title,
                folder.parentId,
                folder.masterParentId,
                folder.index,
                'active',
                folder.masterId,
                folder.userId
            );

            if (!result.changes) {
                throw new Error(`No folder found with masterId=${folder.masterId}`);
            }

            return result;
        } else {
            // Legacy: use browserId + browserInstanceId
            if (!folder.id || !folder.metadata?.deviceInfo?.browserInstanceId) {
                throw new Error(`Invalid folder update data: Missing required fields. 
                    Received: ${JSON.stringify(folder, null, 2)}`);
            }

            console.log('Updating folder with data:', folder);

            const stmt = this.db.prepare(`
                UPDATE folders 
                SET title = ?, 
                    parentId = ?, 
                    position = ?,
                    status = ?, 
                    syncVersion = syncVersion + 1,
                    updatedAt = strftime('%s', 'now')
                WHERE browserId = ? AND browserInstanceId = ?
            `);
            
            try {
                const result = stmt.run(
                    folder.title,
                    folder.parentId,
                    folder.index,
                    'active',
                    folder.id,
                    folder.metadata?.deviceInfo?.browserInstanceId
                );

                console.log('Folder update database result:', result);
                
                if (!result.changes) {
                    throw new Error(`No folder found with browserId=${folder.id} and browserInstanceId=${folder.metadata?.deviceInfo?.browserInstanceId}`);
                }

                return result;
            } catch (err) {
                console.error('Database error in updateFolder:', err);
                throw err;
            }
        }
    }

    public moveBookmark(bookmark: any) {
        if (bookmark.masterId) {
            const stmt = this.db.prepare(`
                UPDATE bookmarks 
                SET parentId = COALESCE(?, parentId), 
                    masterParentId = COALESCE(?, masterParentId),
                    position = ?,
                    syncVersion = syncVersion + 1,
                    updatedAt = strftime('%s', 'now')
                WHERE masterId = ? AND userId = ?
            `);
            
            const result = stmt.run(
                bookmark.parentId,
                bookmark.masterParentId,
                bookmark.index,
                bookmark.masterId,
                bookmark.userId
            );

            if (!result.changes) {
                throw new Error(`No bookmark found with masterId=${bookmark.masterId}`);
            }
            return result;
        } else {
            const stmt = this.db.prepare(`
                UPDATE bookmarks 
                SET parentId = ?, 
                    position = ?,
                    syncVersion = syncVersion + 1,
                    updatedAt = strftime('%s', 'now')
                WHERE browserId = ? AND browserInstanceId = ?
            `);
            
            const result = stmt.run(
                bookmark.parentId,
                bookmark.index,
                bookmark.id,
                bookmark.metadata?.deviceInfo?.browserInstanceId
            );

            if (!result.changes) {
                throw new Error(`No bookmark found with id=${bookmark.id}`);
            }
            return result;
        }
    }

    public moveFolder(folder: any) {
        if (folder.masterId) {
            const stmt = this.db.prepare(`
                UPDATE folders 
                SET parentId = COALESCE(?, parentId), 
                    masterParentId = COALESCE(?, masterParentId),
                    position = ?,
                    syncVersion = syncVersion + 1,
                    updatedAt = strftime('%s', 'now')
                WHERE masterId = ? AND userId = ?
            `);
            
            const result = stmt.run(
                folder.parentId,
                folder.masterParentId,
                folder.index,
                folder.masterId,
                folder.userId
            );

            if (!result.changes) {
                throw new Error(`No folder found with masterId=${folder.masterId}`);
            }
            return result;
        } else {
            const stmt = this.db.prepare(`
                UPDATE folders 
                SET parentId = ?, 
                    position = ?,
                    syncVersion = syncVersion + 1,
                    updatedAt = strftime('%s', 'now')
                WHERE browserId = ? AND browserInstanceId = ?
            `);
            
            const result = stmt.run(
                folder.parentId,
                folder.index,
                folder.id,
                folder.metadata?.deviceInfo?.browserInstanceId
            );

            if (!result.changes) {
                throw new Error(`No folder found with id=${folder.id}`);
            }
            return result;
        }
    }

    public deleteBookmark(bookmark: any) {
        if (bookmark.masterId) {
            const stmt = this.db.prepare(`
                UPDATE bookmarks 
                SET status = 'deleted',
                    syncVersion = syncVersion + 1,
                    updatedAt = strftime('%s', 'now')
                WHERE masterId = ? AND userId = ?
            `);
            
            const result = stmt.run(
                bookmark.masterId,
                bookmark.userId
            );

            if (!result.changes) {
                throw new Error(`No bookmark found with masterId=${bookmark.masterId}`);
            }
            return result;
        } else {
            const stmt = this.db.prepare(`
                UPDATE bookmarks 
                SET status = 'deleted',
                    syncVersion = syncVersion + 1,
                    updatedAt = strftime('%s', 'now')
                WHERE browserId = ? AND browserInstanceId = ?
            `);
            
            const result = stmt.run(
                bookmark.id,
                bookmark.metadata?.deviceInfo?.browserInstanceId
            );

            if (!result.changes) {
                throw new Error(`No bookmark found with id=${bookmark.id}`);
            }
            return result;
        }
    }

    public deleteFolder(folder: any) {
        const db = this.db;
        
        if (folder.masterId) {
            // Cross-device delete via masterId
            db.transaction(() => {
                const folderStmt = db.prepare(`
                    UPDATE folders 
                    SET status = 'deleted',
                        syncVersion = syncVersion + 1,
                        updatedAt = strftime('%s', 'now')
                    WHERE masterId = ? AND userId = ?
                `);
                
                const folderResult = folderStmt.run(folder.masterId, folder.userId);

                if (!folderResult.changes) {
                    throw new Error(`No folder found with masterId=${folder.masterId}`);
                }

                if (folder.recursive) {
                    // Mark all bookmarks in this folder as deleted (by masterParentId)
                    db.prepare(`
                        UPDATE bookmarks 
                        SET status = 'deleted',
                            syncVersion = syncVersion + 1,
                            updatedAt = strftime('%s', 'now')
                        WHERE masterParentId = ? AND userId = ?
                    `).run(folder.masterId, folder.userId);

                    // Mark all subfolders as deleted (by masterParentId)
                    db.prepare(`
                        UPDATE folders 
                        SET status = 'deleted',
                            syncVersion = syncVersion + 1,
                            updatedAt = strftime('%s', 'now')
                        WHERE masterParentId = ? AND userId = ?
                    `).run(folder.masterId, folder.userId);
                }

                return folderResult;
            })();
        } else {
            // Legacy delete via browserId + browserInstanceId
            db.transaction(() => {
                const folderStmt = db.prepare(`
                    UPDATE folders 
                    SET status = 'deleted',
                        syncVersion = syncVersion + 1,
                        updatedAt = strftime('%s', 'now')
                    WHERE browserId = ? AND browserInstanceId = ?
                `);
                
                const folderResult = folderStmt.run(
                    folder.id,
                    folder.metadata?.deviceInfo?.browserInstanceId
                );

                if (!folderResult.changes) {
                    throw new Error(`No folder found with id=${folder.id}`);
                }

                if (folder.recursive) {
                    const bookmarksStmt = db.prepare(`
                        UPDATE bookmarks 
                        SET status = 'deleted',
                            syncVersion = syncVersion + 1,
                            updatedAt = strftime('%s', 'now')
                        WHERE parentId = ? AND browserInstanceId = ?
                    `);
                    
                    bookmarksStmt.run(folder.id, folder.metadata?.deviceInfo?.browserInstanceId);

                    const subfoldersStmt = db.prepare(`
                        UPDATE folders 
                        SET status = 'deleted',
                            syncVersion = syncVersion + 1,
                            updatedAt = strftime('%s', 'now')
                        WHERE parentId = ? AND browserInstanceId = ?
                    `);
                    
                    subfoldersStmt.run(folder.id, folder.metadata?.deviceInfo?.browserInstanceId);
                }

                return folderResult;
            })();
        }
    }

    // Debug functions
    public getStats() {
        interface CountResult {
            count: number;
        }
        interface SyncHistory {
            id: number;
            userId: string;
            deviceId: string;
            type: 'INITIAL_IMPORT' | 'SYNC';
            changesCount: number;
            status: 'SUCCESS' | 'FAILED' | 'PARTIAL';
            bookmarksProcessed: number;
            foldersProcessed: number;
            browser: string | null;
            browserVersion: string | null;
            os: string | null;
            osVersion: string | null;
            userAgent: string | null;
            timestamp: number | null;
            createdAt: number;
            updatedAt: number;
        }
        interface BookmarkSample {
            browserId: string;
            title: string;
            url: string;
            parentId: string;
            position: number;
        }
        interface FolderSample {
            browserId: string;
            title: string;
            parentId: string;
            position: number;
        }

        const folderCount = (this.db.prepare('SELECT COUNT(*) as count FROM folders').get() as CountResult).count;
        const bookmarkCount = (this.db.prepare('SELECT COUNT(*) as count FROM bookmarks').get() as CountResult).count;
        const syncHistoryCount = (this.db.prepare('SELECT COUNT(*) as count FROM sync_history').get() as CountResult).count;

        const lastSync = this.db.prepare(`
            SELECT * FROM sync_history 
            ORDER BY createdAt DESC 
            LIMIT 1
        `).get() as SyncHistory | undefined;

        const sampleBookmarks = this.db.prepare(`
            SELECT browserId, title, url, parentId, position 
            FROM bookmarks 
            LIMIT 5
        `).all() as BookmarkSample[];

        const sampleFolders = this.db.prepare(`
            SELECT browserId, title, parentId, position 
            FROM folders 
            LIMIT 5
        `).all() as FolderSample[];

        return {
            counts: {
                folders: folderCount,
                bookmarks: bookmarkCount,
                syncHistory: syncHistoryCount
            },
            lastSync,
            samples: {
                bookmarks: sampleBookmarks,
                folders: sampleFolders
            }
        };
    }

    // Transaction helper
    public transaction<T>(callback: () => T): T {
        return this.db.transaction(callback)();
    }

    // Close database connection
    public close() {
        this.db.close();
    }

    public getAllBookmarks(userId: string) {
        console.log('Getting all bookmarks for userId:', userId);
        const stmt = this.db.prepare(`
            SELECT 
                masterId,
                browserId as id,
                title,
                url,
                parentId as folderId,
                masterParentId,
                dateAdded,
                position,
                createdAt,
                updatedAt
            FROM bookmarks 
            WHERE userId = ? 
            AND status = 'active'
            ORDER BY dateAdded ASC
        `);
        
        const results = stmt.all(userId);
        console.log(`Found ${results.length} bookmarks`);
        return results;
    }

    public getAllFolders(userId: string) {
        console.log('Getting all folders for userId:', userId);
        const stmt = this.db.prepare(`
            SELECT 
                masterId,
                browserId as id,
                title,
                parentId,
                masterParentId,
                dateAdded,
                position,
                createdAt,
                updatedAt
            FROM folders 
            WHERE userId = ? 
            AND status = 'active'
            ORDER BY dateAdded ASC
        `);
        
        const results = stmt.all(userId);
        console.log(`Found ${results.length} folders`);
        return results;
    }

    // Auth helpers
    public createUser(user: { id: string; email: string; passwordHash: string | null; displayName: string | null }) {
        const stmt = this.db.prepare(`
            INSERT INTO users (id, email, passwordHash, displayName)
            VALUES (?, ?, ?, ?)
        `);

        stmt.run(user.id, user.email, user.passwordHash, user.displayName);
    }

    public getUserByEmail(email: string) {
        const stmt = this.db.prepare(`
            SELECT id, email, passwordHash, displayName
            FROM users
            WHERE email = ?
        `);

        return stmt.get(email) as { id: string; email: string; passwordHash: string | null; displayName: string | null } | undefined;
    }

    public getUserById(userId: string) {
        const stmt = this.db.prepare(`
            SELECT id, email, passwordHash, displayName
            FROM users
            WHERE id = ?
        `);

        return stmt.get(userId) as { id: string; email: string; passwordHash: string | null; displayName: string | null } | undefined;
    }

    public createIdentity(identity: { userId: string; provider: string; providerUserId: string; email?: string }) {
        const stmt = this.db.prepare(`
            INSERT OR IGNORE INTO user_identities (userId, provider, providerUserId, email)
            VALUES (?, ?, ?, ?)
        `);

        stmt.run(identity.userId, identity.provider, identity.providerUserId, identity.email || null);
    }

    public getIdentity(provider: string, providerUserId: string) {
        const stmt = this.db.prepare(`
            SELECT id, userId, provider, providerUserId, email
            FROM user_identities
            WHERE provider = ? AND providerUserId = ?
        `);

        return stmt.get(provider, providerUserId) as { id: number; userId: string; provider: string; providerUserId: string; email: string | null } | undefined;
    }

    public checkBookmarkExists(browserId: string): boolean {
        const stmt = this.db.prepare(`
            SELECT COUNT(*) as count FROM bookmarks WHERE browserId = ?
        `);
        
        const result = stmt.get(browserId) as { count: number };
        return result.count > 0;
    }

    public checkFolderExists(browserId: string): boolean {
        const stmt = this.db.prepare(`
            SELECT COUNT(*) as count FROM folders WHERE browserId = ?
        `);
        
        const result = stmt.get(browserId) as { count: number };
        return result.count > 0;
    }

    public getBookmarkCountForUser(userId: string): number {
        const stmt = this.db.prepare(`
            SELECT COUNT(*) as count 
            FROM bookmarks 
            WHERE userId = ? AND status = 'active'
        `);
        const result = stmt.get(userId) as { count: number };
        return result.count;
    }

    public getFolderCountForUser(userId: string): number {
        const stmt = this.db.prepare(`
            SELECT COUNT(*) as count 
            FROM folders 
            WHERE userId = ? AND status = 'active'
        `);
        const result = stmt.get(userId) as { count: number };
        return result.count;
    }

    public getLastSyncForUser(userId: string): number | null {
        const stmt = this.db.prepare(`
            SELECT MAX(timestamp) as lastSync 
            FROM sync_history 
            WHERE userId = ? AND status = 'SUCCESS'
        `);
        const result = stmt.get(userId) as { lastSync: number | null };
        return result.lastSync;
    }

    public getSyncCountForUser(userId: string): number {
        const stmt = this.db.prepare(`
            SELECT COUNT(*) as count 
            FROM sync_history 
            WHERE userId = ?
        `);
        const result = stmt.get(userId) as { count: number };
        return result.count;
    }

    public getDeviceCountForUser(userId: string): number {
        const stmt = this.db.prepare('SELECT COUNT(DISTINCT deviceId) as count FROM browsers WHERE userId = ?');
        const result = stmt.get(userId) as { count: number };
        return result.count;
    }

    public getFoldersByUserId(userId: string): any[] {
        const stmt = this.db.prepare(`
            SELECT 
                id,
                masterId,
                browserId,
                browserInstanceId,
                userId,
                title,
                parentId,
                masterParentId,
                position,
                dateAdded,
                status,
                syncVersion,
                timestamp,
                createdAt,
                updatedAt
            FROM folders 
            WHERE userId = ? AND status = 'active'
            ORDER BY parentId, position
        `);
        return stmt.all(userId);
    }

    public getBookmarksByUserId(userId: string): any[] {
        const stmt = this.db.prepare(`
            SELECT 
                id,
                masterId,
                browserId,
                browserInstanceId,
                userId,
                url,
                title,
                parentId,
                masterParentId,
                position,
                dateAdded,
                status,
                syncVersion,
                timestamp,
                createdAt,
                updatedAt
            FROM bookmarks 
            WHERE userId = ? AND status = 'active'
            ORDER BY parentId, position
        `);
        return stmt.all(userId);
    }

    // Get bookmark by masterId
    public getBookmarkByMasterId(masterId: string, userId: string) {
        const stmt = this.db.prepare(`
            SELECT * FROM bookmarks 
            WHERE masterId = ? AND userId = ? AND status = 'active'
        `);
        return stmt.get(masterId, userId);
    }

    // Get folder by masterId
    public getFolderByMasterId(masterId: string, userId: string) {
        const stmt = this.db.prepare(`
            SELECT * FROM folders 
            WHERE masterId = ? AND userId = ? AND status = 'active'
        `);
        return stmt.get(masterId, userId);
    }

    // Get folder masterId by browserId (for resolving parentId references)
    public getFolderMasterIdByBrowserId(browserId: string, userId: string): string | null {
        const stmt = this.db.prepare(`
            SELECT masterId FROM folders 
            WHERE browserId = ? AND userId = ? AND status = 'active'
        `);
        const result = stmt.get(browserId, userId) as { masterId: string } | undefined;
        return result?.masterId || null;
    }
}

export const db = DatabaseService.getInstance();
