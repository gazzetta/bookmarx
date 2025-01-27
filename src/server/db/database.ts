import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

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
    }

    // Register or update a browser instance
    public registerBrowser(browser: Browser): void {
        const stmt = this.db.prepare(`
            INSERT INTO browsers (
                browserInstanceId, userId, deviceId, browser, browserVersion,
                os, osVersion, userAgent, lastSeen, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'), strftime('%s', 'now'))
            ON CONFLICT(browserInstanceId) DO UPDATE SET
                browserVersion = excluded.browserVersion,
                lastSeen = strftime('%s', 'now'),
                updatedAt = strftime('%s', 'now')
        `);

        stmt.run(
            browser.browserInstanceId,
            browser.userId,
            browser.deviceId,
            browser.browser,
            browser.browserVersion,
            browser.os,
            browser.osVersion,
            browser.userAgent
        );
    }

    // Folder operations
    public createFolder(folder: any) {
        const stmt = this.db.prepare(`
            INSERT INTO folders (
                browserId, browserInstanceId, userId, title, parentId, 
                position, dateAdded, status, syncVersion, timestamp
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
        `);
        
        return stmt.run(
            folder.browserId,
            folder.metadata?.deviceInfo?.browserInstanceId,
            folder.userId,
            folder.title,
            folder.parentId,
            folder.position,
            folder.dateAdded,
            folder.status || 'active',
            folder.syncVersion || 1,
            folder.metadata?.timestamp
        );
    }

    // Bookmark operations
    public createBookmark(bookmark: any) {
        const stmt = this.db.prepare(`
            INSERT INTO bookmarks (
                browserId, browserInstanceId, userId, url, title, 
                parentId, position, dateAdded, status, syncVersion, timestamp
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
        `);
        
        return stmt.run(
            bookmark.browserId,
            bookmark.metadata?.deviceInfo?.browserInstanceId,
            bookmark.userId,
            bookmark.url,
            bookmark.title,
            bookmark.parentId,
            bookmark.position,
            bookmark.dateAdded,
            bookmark.status || 'active',
            bookmark.syncVersion || 1,
            bookmark.metadata?.timestamp
        );
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

    // Query helpers
    public getBookmarksByUserId(userId: string) {
        return this.db.prepare('SELECT * FROM bookmarks WHERE userId = ? AND status = ?').all(userId, 'active');
    }

    public getFoldersByUserId(userId: string) {
        return this.db.prepare('SELECT * FROM folders WHERE userId = ? AND status = ?').all(userId, 'active');
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
    public getBookmarkCount(userId: string): number {
        const stmt = this.db.prepare('SELECT COUNT(*) as count FROM bookmarks WHERE userId = ?');
        const result = stmt.get(userId) as { count: number };
        return result.count;
    }

    // Update operations
    public updateBookmark(bookmark: any) {
        const stmt = this.db.prepare(`
            UPDATE bookmarks 
            SET title = ?, url = ?, parentId = ?, position = ?,
                status = ?, syncVersion = syncVersion + 1,
                updatedAt = strftime('%s', 'now')
            WHERE browserId = ? AND userId = ?
        `);
        
        return stmt.run(
            bookmark.title,
            bookmark.url,
            bookmark.parentId,
            bookmark.position,
            bookmark.status,
            bookmark.browserId,
            bookmark.userId
        );
    }

    public updateFolder(folder: any) {
        const stmt = this.db.prepare(`
            UPDATE folders 
            SET title = ?, parentId = ?, position = ?,
                status = ?, syncVersion = syncVersion + 1,
                updatedAt = strftime('%s', 'now')
            WHERE browserId = ? AND userId = ?
        `);
        
        return stmt.run(
            folder.title,
            folder.parentId,
            folder.position,
            folder.status,
            folder.browserId,
            folder.userId
        );
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
}

export const db = DatabaseService.getInstance();
