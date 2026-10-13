import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { pathToFileURL } from 'url';

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

export class DatabaseService {
    private db: Database.Database;
    private static instance: DatabaseService;

    // Resolves once file-migrations (db/migrations/*.ts) finished applying.
    //
    // `initializeDatabase()` runs synchronously inside the constructor and
    // kicks off `runFileMigrations()` (private async) WITHOUT awaiting it —
    // so a request can land in the brief window before migrations 002-006
    // finish adding columns like `browsers.currentCollectionId`. In the
    // dev server that race is benign because `nextApp.prepare()` (server.ts:26)
    // blocks `app.listen` for ~seconds, giving migrations time to settle.
    // In the test harness there is no Next.js to prepare and requests fire
    // immediately, so the race became observable. Tests and any caller that
    // cares should `await dbReady` before issuing requests.
    public static readyPromise: Promise<void> | undefined;

    private constructor() {
        const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../data/bookmarx.db');

        // Ensure data directory exists
        const dataDir = path.dirname(dbPath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        this.db = new Database(dbPath, { timeout: 10000 });
        const journalMode = (process.env.SQLITE_JOURNAL_MODE || 'WAL').toUpperCase();
        this.db.pragma(`journal_mode = ${journalMode}`);
        this.db.pragma('busy_timeout = 10000');
        this.db.pragma('synchronous = NORMAL');
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
                        collectionId TEXT,
                        sessionId TEXT,
                        detailsJson TEXT,
                        timestamp INTEGER,
                        createdAt INTEGER DEFAULT (strftime('%s', 'now')),
                        updatedAt INTEGER DEFAULT (strftime('%s', 'now')),
                        FOREIGN KEY (browserInstanceId) REFERENCES browsers(browserInstanceId),
                        FOREIGN KEY (collectionId) REFERENCES collections(id)
                    );
                    
                    INSERT INTO sync_history_new (id, userId, browserInstanceId, type, changesCount, status, bookmarksProcessed, foldersProcessed, timestamp, createdAt, updatedAt)
                    SELECT id, userId, browserInstanceId, type, changesCount, status, bookmarksProcessed, foldersProcessed, timestamp, createdAt, updatedAt FROM sync_history;
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

        try {
            const syncHistoryInfo = this.db.prepare("PRAGMA table_info(sync_history)").all() as { name: string }[];
            const hasCollectionId = syncHistoryInfo.some(col => col.name === 'collectionId');
            const hasSessionId = syncHistoryInfo.some(col => col.name === 'sessionId');
            const hasDetailsJson = syncHistoryInfo.some(col => col.name === 'detailsJson');

            if (!hasCollectionId) {
                console.log('Running migration: Adding collectionId column to sync_history');
                this.db.exec(`ALTER TABLE sync_history ADD COLUMN collectionId TEXT;`);
            }

            if (!hasSessionId) {
                console.log('Running migration: Adding sessionId column to sync_history');
                this.db.exec(`ALTER TABLE sync_history ADD COLUMN sessionId TEXT;`);
            }

            if (!hasDetailsJson) {
                console.log('Running migration: Adding detailsJson column to sync_history');
                this.db.exec(`ALTER TABLE sync_history ADD COLUMN detailsJson TEXT;`);
            }
        } catch (error) {
            console.error('Migration error (sync_history metadata):', error);
        }

        // Migration: Add sourceBrowser and sessionId columns to bookmarks table
        try {
            const bookmarksInfo = this.db.prepare("PRAGMA table_info(bookmarks)").all() as { name: string }[];
            const hasSourceBrowser = bookmarksInfo.some(col => col.name === 'sourceBrowser');

            if (!hasSourceBrowser) {
                console.log('Running migration: Adding sourceBrowser and sessionId columns to bookmarks');
                this.db.exec(`
                    ALTER TABLE bookmarks ADD COLUMN sourceBrowser TEXT;
                    ALTER TABLE bookmarks ADD COLUMN sessionId TEXT;
                    CREATE INDEX IF NOT EXISTS idx_bookmarks_sessionid ON bookmarks(sessionId);
                    CREATE INDEX IF NOT EXISTS idx_bookmarks_sourcebrowser ON bookmarks(sourceBrowser);
                `);
                console.log('Migration completed: bookmarks table now has sourceBrowser and sessionId');
            }
        } catch (error) {
            console.error('Migration error (bookmarks sourceBrowser/sessionId):', error);
        }

        // Migration: Add sourceBrowser and sessionId columns to folders table
        try {
            const foldersInfo = this.db.prepare("PRAGMA table_info(folders)").all() as { name: string }[];
            const hasSourceBrowser = foldersInfo.some(col => col.name === 'sourceBrowser');

            if (!hasSourceBrowser) {
                console.log('Running migration: Adding sourceBrowser and sessionId columns to folders');
                this.db.exec(`
                    ALTER TABLE folders ADD COLUMN sourceBrowser TEXT;
                    ALTER TABLE folders ADD COLUMN sessionId TEXT;
                    CREATE INDEX IF NOT EXISTS idx_folders_sessionid ON folders(sessionId);
                    CREATE INDEX IF NOT EXISTS idx_folders_sourcebrowser ON folders(sourceBrowser);
                `);
                console.log('Migration completed: folders table now has sourceBrowser and sessionId');
            }
        } catch (error) {
            console.error('Migration error (folders sourceBrowser/sessionId):', error);
        }

        // Migration: Add premium fields to users table (each column added individually to handle partial state)
        try {
            const usersInfo = this.db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
            const columnNames = new Set(usersInfo.map(col => col.name));

            const premiumColumns: [string, string][] = [
                ['subscriptionTier', "TEXT DEFAULT 'free'"],
                ['subscriptionExpiresAt', 'INTEGER'],
                ['bookmarkLimit', 'INTEGER DEFAULT 250'],
                ['browserLimit', 'INTEGER DEFAULT 2'],
                ['collectionLimit', 'INTEGER DEFAULT 1'],
                ['polarCustomerId', 'TEXT'],
            ];

            let addedAny = false;
            for (const [colName, colDef] of premiumColumns) {
                if (!columnNames.has(colName)) {
                    console.log(`Running migration: Adding ${colName} to users table`);
                    this.db.exec(`ALTER TABLE users ADD COLUMN ${colName} ${colDef};`);
                    addedAny = true;
                }
            }
            this.db.exec('CREATE INDEX IF NOT EXISTS idx_users_polarcustomerid ON users(polarCustomerId);');
            if (addedAny) {
                console.log('Migration completed: users table now has all premium fields');
            }
        } catch (error) {
            console.error('Migration error (users premium fields):', error);
        }

        // Migration: Create subscriptions table
        try {
            const tableExists = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='subscriptions'").get();
            if (!tableExists) {
                console.log('Running migration: Creating subscriptions table');
                this.db.exec(`
                    CREATE TABLE IF NOT EXISTS subscriptions (
                        id TEXT PRIMARY KEY,
                        userId TEXT NOT NULL,
                        planType TEXT NOT NULL,
                        status TEXT NOT NULL,
                        amount INTEGER NOT NULL,
                        currency TEXT DEFAULT 'USD',
                        startsAt INTEGER NOT NULL,
                        endsAt INTEGER,
                        cancelledAt INTEGER,
                        paymentProvider TEXT DEFAULT 'paypal',
                        externalSubscriptionId TEXT,
                        externalCustomerId TEXT,
                        createdAt INTEGER DEFAULT (strftime('%s', 'now')),
                        updatedAt INTEGER DEFAULT (strftime('%s', 'now')),
                        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
                    );
                    CREATE INDEX IF NOT EXISTS idx_subscriptions_userid ON subscriptions(userId);
                    CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
                    CREATE INDEX IF NOT EXISTS idx_subscriptions_externalid ON subscriptions(externalSubscriptionId);
                `);
                console.log('Migration completed: subscriptions table created');
            }
        } catch (error) {
            console.error('Migration error (subscriptions table):', error);
        }

        // Migration: Add nickname column to browsers table
        try {
            const browsersInfo = this.db.prepare("PRAGMA table_info(browsers)").all() as { name: string }[];
            const hasNickname = browsersInfo.some(col => col.name === 'nickname');

            if (!hasNickname) {
                console.log('Running migration: Adding nickname column to browsers table');
                this.db.exec(`
                    ALTER TABLE browsers ADD COLUMN nickname TEXT;
                `);
                console.log('Migration completed: browsers table now has nickname field');
            }
        } catch (error) {
            console.error('Migration error (browsers nickname):', error);
        }

        // Migration: Create collections table
        try {
            const tableExists = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='collections'").get();
            if (!tableExists) {
                console.log('Running migration: Creating collections table');
                this.db.exec(`
                    CREATE TABLE IF NOT EXISTS collections (
                        id TEXT PRIMARY KEY,
                        userId TEXT NOT NULL,
                        name TEXT NOT NULL,
                        description TEXT,
                        isDefault INTEGER DEFAULT 0,
                        sortOrder INTEGER DEFAULT 0,
                        createdAt INTEGER DEFAULT (strftime('%s', 'now')),
                        updatedAt INTEGER DEFAULT (strftime('%s', 'now')),
                        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
                    );
                    CREATE INDEX IF NOT EXISTS idx_collections_userid ON collections(userId);
                `);
                console.log('Migration completed: collections table created');
            }
        } catch (error) {
            console.error('Migration error (collections table):', error);
        }

        try {
            const tableExists = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='collection_events'").get();
            if (!tableExists) {
                console.log('Running migration: Creating collection_events table');
                this.db.exec(`
                    CREATE TABLE IF NOT EXISTS collection_events (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        eventId TEXT NOT NULL UNIQUE,
                        userId TEXT NOT NULL,
                        collectionId TEXT NOT NULL,
                        type TEXT NOT NULL,
                        sourceBrowser TEXT,
                        sessionId TEXT,
                        changesCount INTEGER DEFAULT 0,
                        snapshotJson TEXT NOT NULL,
                        detailsJson TEXT,
                        rolledBackAt INTEGER,
                        timestamp INTEGER,
                        createdAt INTEGER DEFAULT (strftime('%s', 'now')),
                        updatedAt INTEGER DEFAULT (strftime('%s', 'now')),
                        FOREIGN KEY (collectionId) REFERENCES collections(id)
                    );
                    CREATE INDEX IF NOT EXISTS idx_collection_events_collectionid ON collection_events(collectionId);
                    CREATE INDEX IF NOT EXISTS idx_collection_events_userid ON collection_events(userId);
                    CREATE INDEX IF NOT EXISTS idx_collection_events_eventid ON collection_events(eventId);
                `);
                console.log('Migration completed: collection_events table created');
            }
        } catch (error) {
            console.error('Migration error (collection_events table):', error);
        }

        // Migration: Add collectionId to folders and bookmarks
        try {
            const foldersInfo = this.db.prepare("PRAGMA table_info(folders)").all() as { name: string }[];
            const hasCollectionId = foldersInfo.some(col => col.name === 'collectionId');

            if (!hasCollectionId) {
                console.log('Running migration: Adding collectionId to folders and bookmarks');
                this.db.exec(`
                    ALTER TABLE folders ADD COLUMN collectionId TEXT;
                    ALTER TABLE bookmarks ADD COLUMN collectionId TEXT;
                    CREATE INDEX IF NOT EXISTS idx_folders_collectionid ON folders(collectionId);
                    CREATE INDEX IF NOT EXISTS idx_bookmarks_collectionid ON bookmarks(collectionId);
                `);
                console.log('Migration completed: folders and bookmarks now have collectionId');
            }
        } catch (error) {
            console.error('Migration error (collectionId):', error);
        }

        // Migration: Update status constraint to include 'rolled_back'
        try {
            const bookmarksSchema = this.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='bookmarks'").get() as { sql: string } | undefined;
            if (bookmarksSchema && !bookmarksSchema.sql.includes('rolled_back')) {
                console.log('Running migration: Updating status constraint to include rolled_back');
                console.log('Note: rolled_back status will be allowed for new inserts. Existing constraint remains.');
            }
        } catch (error) {
            console.error('Migration check error (rolled_back status):', error);
        }

        // --- NEW MIGRATION RUNNER ---
        DatabaseService.readyPromise = this.runFileMigrations();
    }

    private async runFileMigrations() {
        const migrationsDir = path.join(__dirname, 'migrations');
        if (!fs.existsSync(migrationsDir)) return;

        // Create migrations table if not exists
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS migrations (
                name TEXT PRIMARY KEY,
                executedAt INTEGER DEFAULT (strftime('%s', 'now'))
            );
        `);

        // Get executed migrations
        const executed = new Set(
            (this.db.prepare('SELECT name FROM migrations').all() as { name: string }[])
                .map(row => row.name)
        );

        // Get migration files
        const files = fs.readdirSync(migrationsDir)
            .filter(f => f.endsWith('.ts') || f.endsWith('.js'))
            .sort();

        for (const file of files) {
            if (executed.has(file)) continue;

            console.log(`Running migration: ${file}`);
            try {
                // Dynamic import of the migration file, done via an ESM-safe
                // file:// URL so the loader works under both `tsx` (which shims
                // `require`) and native ESM runtimes like vitest (which does
                // not expose `require`). plain `require()` throws
                // "require is not defined in ES module scope" in vitest.
                const fileUrl = pathToFileURL(path.join(migrationsDir, file)).href;
                const migration = (await import(fileUrl)) as { up?: (db: Database.Database) => void | Promise<void> };

                if (migration.up) {
                    await migration.up(this.db);

                    this.db.prepare('INSERT INTO migrations (name) VALUES (?)').run(file);
                    console.log(`Migration ${file} completed successfully`);
                } else {
                    console.warn(`Migration ${file} has no \`up\` export; skipping`);
                }
            } catch (error) {
                console.error(`Failed to run migration ${file}:`, error);
                // Stop migration process on error
                break;
            }
        }
    }


    public registerBrowser(browser: any) {
        const stmt = this.db.prepare(`
            INSERT INTO browsers (
                browserInstanceId, userId, deviceId, browser,
                browserVersion, os, osVersion, userAgent, currentCollectionId
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(browserInstanceId) DO UPDATE SET
                userId = excluded.userId,
                deviceId = excluded.deviceId,
                browser = excluded.browser,
                browserVersion = excluded.browserVersion,
                os = excluded.os,
                osVersion = excluded.osVersion,
                userAgent = excluded.userAgent,
                currentCollectionId = COALESCE(excluded.currentCollectionId, currentCollectionId),
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
            browser.userAgent,
            browser.currentCollectionId || null
        );
    }

    public updateBrowserCollection(browserInstanceId: string, collectionId: string): void {
        const stmt = this.db.prepare(`
            UPDATE browsers SET currentCollectionId = ?, updatedAt = strftime('%s', 'now')
            WHERE browserInstanceId = ?
        `);
        stmt.run(collectionId, browserInstanceId);
    }

    // Update browser nickname
    public updateBrowserNickname(browserInstanceId: string, userId: string, nickname: string): boolean {
        const stmt = this.db.prepare(`
            UPDATE browsers 
            SET nickname = ?, updatedAt = strftime('%s', 'now')
            WHERE browserInstanceId = ? AND userId = ?
        `);
        const result = stmt.run(nickname, browserInstanceId, userId);
        return result.changes > 0;
    }

    // Get browser by instance ID
    public getBrowser(browserInstanceId: string, userId: string): any {
        const stmt = this.db.prepare(`
            SELECT * FROM browsers WHERE browserInstanceId = ? AND userId = ?
        `);
        return stmt.get(browserInstanceId, userId);
    }

    private normalizeEntityBrowserId(
        rawBrowserId: unknown,
        browserInstanceId: unknown,
        prefix: 'folder' | 'bookmark'
    ): string {
        const browserId = typeof rawBrowserId === 'string' ? rawBrowserId.trim() : '';
        const instanceId = typeof browserInstanceId === 'string' ? browserInstanceId.trim() : '';

        if (!browserId) {
            return `${prefix}-${crypto.randomUUID()}`;
        }

        // Guard against browser instance IDs being accidentally stored as item IDs
        // (e.g. website-round2), which breaks parent mapping and legacy lookups.
        if (instanceId && browserId === instanceId) {
            return `${prefix}-${crypto.randomUUID()}`;
        }

        return browserId;
    }

    // Folder operations
    public createFolder(folder: any): { lastInsertRowid: number | bigint; changes: number; masterId: string } {
        const masterId = crypto.randomUUID();
        const browserInstanceId = folder.metadata?.deviceInfo?.browserInstanceId;
        const normalizedBrowserId = this.normalizeEntityBrowserId(folder.browserId, browserInstanceId, 'folder');
        const stmt = this.db.prepare(`
            INSERT INTO folders (
                masterId, browserId, browserInstanceId, userId, collectionId, title, parentId, 
                masterParentId, position, dateAdded, sourceBrowser, sessionId,
                status, syncVersion, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const result = stmt.run(
            masterId,
            normalizedBrowserId,
            browserInstanceId,
            folder.userId,
            folder.collectionId || null,
            folder.title,
            folder.parentId,
            folder.masterParentId || null,
            // The extension sends `index`, not `position`. position is NOT NULL, so folder creates
            // without a default failed and were silently dropped (bookmarks already default to 0).
            folder.position ?? folder.index ?? 0,
            folder.dateAdded,
            folder.sourceBrowser || folder.metadata?.deviceInfo?.browser || null,
            folder.sessionId || null,
            folder.status || 'active',
            folder.syncVersion || 1,
            folder.metadata?.timestamp
        );

        return { ...result, masterId };
    }

    // Bookmark operations
    public createBookmark(bookmark: any): { lastInsertRowid: number | bigint; changes: number; masterId: string } {
        const masterId = crypto.randomUUID();
        const browserInstanceId = bookmark.metadata?.deviceInfo?.browserInstanceId;
        const normalizedBrowserId = this.normalizeEntityBrowserId(bookmark.browserId, browserInstanceId, 'bookmark');
        const stmt = this.db.prepare(`
            INSERT INTO bookmarks (
                masterId, browserId, browserInstanceId, userId, collectionId, url, title, 
                parentId, masterParentId, position, dateAdded, sourceBrowser, sessionId,
                status, syncVersion, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const result = stmt.run(
            masterId,
            normalizedBrowserId,
            browserInstanceId,
            bookmark.userId,
            bookmark.collectionId || null,
            bookmark.url,
            bookmark.title,
            bookmark.parentId,
            bookmark.masterParentId || null,
            bookmark.position ?? 0,
            bookmark.dateAdded,
            bookmark.sourceBrowser || bookmark.metadata?.deviceInfo?.browser || null,
            bookmark.sessionId || null,
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
                bookmarksProcessed, foldersProcessed, collectionId, sessionId, detailsJson, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const bookmarksProcessed = sync.bookmarksProcessed ?? sync.details?.bookmarksProcessed ?? 0;
        const foldersProcessed = sync.foldersProcessed ?? sync.details?.foldersProcessed ?? 0;
        const detailsJson = sync.details ? JSON.stringify(sync.details) : null;

        const result = stmt.run(
            sync.userId,
            sync.metadata?.deviceInfo?.browserInstanceId,
            sync.type,
            sync.changesCount,
            sync.status,
            bookmarksProcessed,
            foldersProcessed,
            sync.collectionId ?? sync.details?.collectionId ?? null,
            sync.sessionId ?? sync.details?.sessionId ?? null,
            detailsJson,
            // An explicit timestamp is the pull cursor for acknowledged pulls; default is now.
            sync.timestamp ?? Math.floor(Date.now() / 1000)
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
        // The pull watermark. Only rows where the browser RECEIVED data count:
        //   - INITIAL_IMPORT
        //   - SYNC rows with details.kind = 'pull' (acknowledged pulls)
        //   - legacy SYNC rows with no kind (written by older extensions on pull)
        // Pushes (kind 'push') and master fetches (kind 'fetch') never advance it. Otherwise
        // a browser's own push would skip changes other browsers made before it.
        const stmt = this.db.prepare(`
            SELECT MAX(timestamp) as lastSync
            FROM sync_history
            WHERE userId = ? AND browserInstanceId = ? AND status = 'SUCCESS'
              AND (
                type = 'INITIAL_IMPORT'
                OR (type = 'SYNC' AND COALESCE(json_extract(detailsJson, '$.kind'), 'pull') = 'pull')
              )
        `);
        const result = stmt.get(userId, browserInstanceId) as { lastSync: number | null };
        return result.lastSync;
    }

    public getPendingChangesForBrowser(userId: string, browserInstanceId: string, lastSyncSeconds: number) {
        const bookmarkAdds = this.db.prepare(`
            SELECT COUNT(*) as count
            FROM bookmarks
            WHERE userId = ?
              AND (browserInstanceId IS NULL OR browserInstanceId != ?)
              AND status = 'active'
              AND createdAt > ?
        `).get(userId, browserInstanceId, lastSyncSeconds) as { count: number };

        const folderAdds = this.db.prepare(`
            SELECT COUNT(*) as count
            FROM folders
            WHERE userId = ?
              AND (browserInstanceId IS NULL OR browserInstanceId != ?)
              AND status = 'active'
              AND createdAt > ?
        `).get(userId, browserInstanceId, lastSyncSeconds) as { count: number };

        const bookmarkUpdates = this.db.prepare(`
            SELECT COUNT(*) as count
            FROM bookmarks
            WHERE userId = ?
              AND (browserInstanceId IS NULL OR browserInstanceId != ?)
              AND status = 'active'
              AND updatedAt > ?
              AND createdAt <= ?
        `).get(userId, browserInstanceId, lastSyncSeconds, lastSyncSeconds) as { count: number };

        const folderUpdates = this.db.prepare(`
            SELECT COUNT(*) as count
            FROM folders
            WHERE userId = ?
              AND (browserInstanceId IS NULL OR browserInstanceId != ?)
              AND status = 'active'
              AND updatedAt > ?
              AND createdAt <= ?
        `).get(userId, browserInstanceId, lastSyncSeconds, lastSyncSeconds) as { count: number };

        const bookmarkDeletes = this.db.prepare(`
            SELECT COUNT(*) as count
            FROM bookmarks
            WHERE userId = ?
              AND (browserInstanceId IS NULL OR browserInstanceId != ?)
              AND status = 'deleted'
              AND updatedAt > ?
        `).get(userId, browserInstanceId, lastSyncSeconds) as { count: number };

        const folderDeletes = this.db.prepare(`
            SELECT COUNT(*) as count
            FROM folders
            WHERE userId = ?
              AND (browserInstanceId IS NULL OR browserInstanceId != ?)
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

    public getFolderCount(userId: string): number {
        const stmt = this.db.prepare(`
            SELECT COUNT(*) as count 
            FROM folders 
            WHERE userId = ? AND status = 'active'
        `);
        const result = stmt.get(userId) as { count: number };
        return result.count;
    }

    public getBrowserCount(userId: string): number {
        const stmt = this.db.prepare(`
            SELECT COUNT(*) as count 
            FROM browsers 
            WHERE userId = ?
        `);
        const result = stmt.get(userId) as { count: number };
        return result.count;
    }

    public getBrowserByInstanceId(browserInstanceId: string): any {
        const stmt = this.db.prepare(`
            SELECT * FROM browsers 
            WHERE browserInstanceId = ?
        `);
        return stmt.get(browserInstanceId);
    }

    public getBrowsersForUser(userId: string): any[] {
        const stmt = this.db.prepare(`
            SELECT browserInstanceId, browser, browserVersion, os, osVersion, nickname, lastSeen, createdAt
            FROM browsers 
            WHERE userId = ?
            ORDER BY lastSeen DESC
        `);
        return stmt.all(userId);
    }

    public getSyncHistoryForBrowser(browserInstanceId: string, userId: string): any[] {
        const stmt = this.db.prepare(`
            SELECT 
                sh.id,
                sh.browserInstanceId,
                sh.type,
                sh.changesCount,
                sh.status,
                sh.bookmarksProcessed,
                sh.foldersProcessed,
                sh.collectionId,
                sh.sessionId,
                sh.detailsJson,
                sh.timestamp,
                sh.createdAt,
                c.name as collectionName
            FROM sync_history sh
            LEFT JOIN collections c ON c.id = sh.collectionId
            WHERE sh.browserInstanceId = ? AND sh.userId = ?
            ORDER BY sh.createdAt DESC
        `);
        const rows = stmt.all(browserInstanceId, userId) as any[];
        return rows.map(row => ({
            ...row,
            details: row.detailsJson ? JSON.parse(row.detailsJson) : null
        }));
    }

    public getSyncHistoryEntryForBrowser(historyId: number, browserInstanceId: string, userId: string): any {
        const stmt = this.db.prepare(`
            SELECT 
                sh.id,
                sh.browserInstanceId,
                sh.type,
                sh.changesCount,
                sh.status,
                sh.bookmarksProcessed,
                sh.foldersProcessed,
                sh.collectionId,
                sh.sessionId,
                sh.detailsJson,
                sh.timestamp,
                sh.createdAt,
                c.name as collectionName
            FROM sync_history sh
            LEFT JOIN collections c ON c.id = sh.collectionId
            WHERE sh.id = ? AND sh.browserInstanceId = ? AND sh.userId = ?
            LIMIT 1
        `);

        const row = stmt.get(historyId, browserInstanceId, userId) as any;
        if (!row) {
            return null;
        }

        return {
            ...row,
            details: row.detailsJson ? JSON.parse(row.detailsJson) : null
        };
    }

    public deleteBrowser(browserInstanceId: string, userId: string): boolean {
        const deleteTransaction = this.db.transaction(() => {
            // Nullify references in dependent tables to avoid foreign key constraints
            // We keep the data (bookmarks/folders) but dissociate them from the specific deleted device
            this.db.prepare(`UPDATE bookmarks SET browserInstanceId = NULL WHERE browserInstanceId = ?`).run(browserInstanceId);
            this.db.prepare(`UPDATE folders SET browserInstanceId = NULL WHERE browserInstanceId = ?`).run(browserInstanceId);
            this.db.prepare(`UPDATE sync_history SET browserInstanceId = NULL WHERE browserInstanceId = ?`).run(browserInstanceId);

            const result = this.db.prepare(`
                DELETE FROM browsers 
                WHERE browserInstanceId = ? AND userId = ?
            `).run(browserInstanceId, userId);

            return result.changes > 0;
        });

        return deleteTransaction();
    }

    public getBrowserByFingerprint(userId: string, fingerprint: string): any {
        // Fingerprint is: browser|os|osVersion (lowercased)
        const parts = fingerprint.split('|');
        const [browser, os, osVersion] = parts;

        const stmt = this.db.prepare(`
            SELECT * FROM browsers 
            WHERE userId = ? 
              AND LOWER(browser) = ?
              AND LOWER(COALESCE(os, '')) = ?
              AND LOWER(COALESCE(osVersion, '')) = ?
        `);
        return stmt.get(userId, browser, os, osVersion);
    }

    public getRecentBrowserRegistrations(userId: string, days: number): number {
        const cutoffTime = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);

        const stmt = this.db.prepare(`
            SELECT COUNT(*) as count 
            FROM browsers 
            WHERE userId = ? AND createdAt > ?
        `);
        const result = stmt.get(userId, cutoffTime) as { count: number };
        return result.count;
    }

    // App Settings operations
    public getAllSettings(): Record<string, string> {
        const stmt = this.db.prepare(`SELECT key, value FROM app_settings`);
        const rows = stmt.all() as { key: string; value: string }[];
        const settings: Record<string, string> = {};
        for (const row of rows) {
            settings[row.key] = row.value;
        }
        return settings;
    }

    public getSetting(key: string): string | null {
        const stmt = this.db.prepare(`SELECT value FROM app_settings WHERE key = ?`);
        const result = stmt.get(key) as { value: string } | undefined;
        return result?.value ?? null;
    }

    public getSettingAsNumber(key: string, defaultValue: number = 0): number {
        const value = this.getSetting(key);
        if (value === null) return defaultValue;
        const parsed = parseInt(value, 10);
        return isNaN(parsed) ? defaultValue : parsed;
    }

    public getSettingAsBoolean(key: string, defaultValue: boolean = false): boolean {
        const value = this.getSetting(key);
        if (value === null) return defaultValue;
        return value.toLowerCase() === 'true' || value === '1';
    }

    public setSetting(key: string, value: string, description?: string): void {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO app_settings (key, value, description, updatedAt) 
            VALUES (?, ?, COALESCE(?, (SELECT description FROM app_settings WHERE key = ?)), strftime('%s', 'now'))
        `);
        stmt.run(key, value, description, key);
    }

    // Get pricing and limits as a structured object (for API responses)
    public getAppConfig(): {
        branding: { appName: string; premiumTitle: string };
        pricing: {
            monthly: number;
            yearly: number;
            lifetime: number;
            currency: string;
        };
        limits: {
            free: { bookmarks: number; browsers: number; collections: number };
            premium: { bookmarks: number; browsers: number; collections: number };
        };
        abusePrevention: {
            browserRegistrationRateLimit: number;
            browserRegistrationRatePeriodDays: number;
        };
        features: {
            syncEnabled: boolean;
            registrationsEnabled: boolean;
        };
    } {
        const settings = this.getAllSettings();

        return {
            branding: {
                appName: settings['app_name'] || 'BookMarx',
                premiumTitle: settings['premium_title'] || 'Premium',
            },
            pricing: {
                monthly: parseInt(settings['price_monthly_cents'] || '249', 10),
                yearly: parseInt(settings['price_yearly_cents'] || '2499', 10),
                lifetime: parseInt(settings['price_lifetime_cents'] || '4999', 10),
                currency: settings['currency'] || 'USD',
            },
            limits: {
                free: {
                    bookmarks: parseInt(settings['free_bookmark_limit'] || '250', 10),
                    browsers: parseInt(settings['free_browser_limit'] || '2', 10),
                    collections: parseInt(settings['free_collection_limit'] || '1', 10),
                },
                premium: {
                    bookmarks: parseInt(settings['premium_bookmark_limit'] || '10000', 10),
                    browsers: parseInt(settings['premium_browser_limit'] || '100', 10),
                    collections: parseInt(settings['premium_collection_limit'] || '50', 10),
                },
            },
            abusePrevention: {
                browserRegistrationRateLimit: parseInt(settings['browser_registration_rate_limit'] || '5', 10),
                browserRegistrationRatePeriodDays: parseInt(settings['browser_registration_rate_period_days'] || '30', 10),
            },
            features: {
                syncEnabled: (settings['sync_enabled'] || 'true').toLowerCase() === 'true',
                registrationsEnabled: (settings['registrations_enabled'] || 'true').toLowerCase() === 'true',
            },
        };
    }

    public getCollectionCount(userId: string): number {
        const stmt = this.db.prepare(`
            SELECT COUNT(*) as count 
            FROM collections 
            WHERE userId = ?
        `);
        const result = stmt.get(userId) as { count: number };
        return result.count;
    }

    // Collection operations
    public createCollection(collection: { userId: string; name: string; description?: string; isDefault?: boolean }): string {
        const id = crypto.randomUUID();
        const stmt = this.db.prepare(`
            INSERT INTO collections (id, userId, name, description, isDefault, sortOrder)
            VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sortOrder), 0) + 1 FROM collections WHERE userId = ?))
        `);
        stmt.run(id, collection.userId, collection.name, collection.description || null, collection.isDefault ? 1 : 0, collection.userId);

        // Seed default top-level folders that mirror standard browser bookmark structure
        // Create for ALL collections (including default) so bookmarks have a parent folder
        const now = Math.floor(Date.now() / 1000);
        const defaultFolders = [
            { title: 'Bookmarks Bar', position: 0, browserId: `website-${id}-bar` },
            { title: 'Other Bookmarks', position: 1, browserId: `website-${id}-other` }
        ];
        const folderStmt = this.db.prepare(`
            INSERT INTO folders (
                masterId, browserId, browserInstanceId, userId, collectionId, title, parentId,
                masterParentId, position, dateAdded, sourceBrowser, sessionId,
                status, syncVersion, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const folder of defaultFolders) {
            const masterId = crypto.randomUUID();
            folderStmt.run(
                masterId,
                folder.browserId,
                null,
                collection.userId,
                id,
                folder.title,
                '0',
                null,
                folder.position,
                now,
                'website',
                null,
                'active',
                1,
                now
            );
        }

        return id;
    }

    public getCollectionsByUserId(userId: string): any[] {
        const stmt = this.db.prepare(`
            SELECT * FROM collections 
            WHERE userId = ? AND (status IS NULL OR status != 'archived')
            ORDER BY isDefault DESC, sortOrder ASC
        `);
        return stmt.all(userId);
    }

    public getCollectionById(collectionId: string, userId: string): any {
        const stmt = this.db.prepare(`
            SELECT * FROM collections 
            WHERE id = ? AND userId = ?
        `);
        return stmt.get(collectionId, userId);
    }

    public getDefaultCollection(userId: string): any {
        const stmt = this.db.prepare(`
            SELECT * FROM collections 
            WHERE userId = ? AND isDefault = 1
        `);
        return stmt.get(userId);
    }

    public updateCollection(collectionId: string, userId: string, updates: { name?: string; description?: string }): boolean {
        const stmt = this.db.prepare(`
            UPDATE collections 
            SET name = COALESCE(?, name),
                description = COALESCE(?, description),
                updatedAt = strftime('%s', 'now')
            WHERE id = ? AND userId = ?
        `);
        const result = stmt.run(updates.name, updates.description, collectionId, userId);
        return result.changes > 0;
    }

    public deleteCollection(collectionId: string, userId: string): boolean {
        // Can't delete default collection
        const collection = this.getCollectionById(collectionId, userId);
        if (!collection || collection.isDefault) {
            return false;
        }
        const defaultCollectionId = this.getDefaultCollection(userId)?.id ?? null;

        // Other tables hold foreign keys to collections, so the DELETE alone fails with
        // "FOREIGN KEY constraint failed" once the collection has been synced or viewed. Clear them first:
        //  - the collection's bookmarks and folders go with it (the UI says so when a collection is archived)
        //  - sync_history keeps its rows, without the collection link
        //  - browsers viewing this collection switch to the default one
        //  - collection_events for it are removed (they can't outlive their collection)
        const deleteWithUnlinks = this.db.transaction(() => {
            this.db.prepare(`
                DELETE FROM bookmarks WHERE collectionId = ? AND userId = ?
            `).run(collectionId, userId);
            this.db.prepare(`
                DELETE FROM folders WHERE collectionId = ? AND userId = ?
            `).run(collectionId, userId);
            this.db.prepare(`
                UPDATE sync_history SET collectionId = NULL
                WHERE collectionId = ? AND userId = ?
            `).run(collectionId, userId);
            this.db.prepare(`
                DELETE FROM collection_events
                WHERE collectionId = ? AND userId = ?
            `).run(collectionId, userId);
            this.db.prepare(`
                UPDATE browsers SET currentCollectionId = ?
                WHERE currentCollectionId = ? AND userId = ?
            `).run(defaultCollectionId, collectionId, userId);
            const result = this.db.prepare(`
                DELETE FROM collections
                WHERE id = ? AND userId = ? AND isDefault = 0
            `).run(collectionId, userId);
            return result.changes > 0;
        });
        return deleteWithUnlinks();
    }

    public getBrowsersUsingCollection(collectionId: string, userId: string): any[] {
        const stmt = this.db.prepare(`
            SELECT DISTINCT b.browserInstanceId, b.browser, b.os, b.nickname, b.lastSeen
            FROM browsers b
            INNER JOIN sync_history sh ON sh.browserInstanceId = b.browserInstanceId AND sh.userId = b.userId
            WHERE sh.collectionId = ? AND sh.userId = ?
            ORDER BY b.lastSeen DESC
        `);
        return stmt.all(collectionId, userId);
    }

    public archiveCollection(collectionId: string, userId: string): boolean {
        const collection = this.getCollectionById(collectionId, userId);
        if (!collection || collection.isDefault) {
            return false;
        }
        const now = Math.floor(Date.now() / 1000);
        const stmt = this.db.prepare(`
            UPDATE collections
            SET status = 'archived', archivedAt = ?, updatedAt = ?
            WHERE id = ? AND userId = ? AND isDefault = 0
        `);
        const result = stmt.run(now, now, collectionId, userId);
        return result.changes > 0;
    }

    public copyItemsToCollection(
        destCollectionId: string,
        sourceCollectionId: string,
        userId: string,
        items: { masterId: string; type: 'folder' | 'bookmark'; targetParentId: string | null }[]
    ): { copiedFolders: number; copiedBookmarks: number } {
        let copiedFolders = 0;
        let copiedBookmarks = 0;
        const now = Math.floor(Date.now() / 1000);

        const folderStmt = this.db.prepare(`
            INSERT INTO folders (
                masterId, browserId, browserInstanceId, userId, collectionId, title, parentId,
                masterParentId, position, dateAdded, sourceBrowser, sessionId,
                status, syncVersion, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const bookmarkStmt = this.db.prepare(`
            INSERT INTO bookmarks (
                masterId, browserId, browserInstanceId, userId, collectionId, url, title,
                parentId, masterParentId, position, dateAdded, sourceBrowser, sessionId,
                status, syncVersion, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        // Get all source folders and bookmarks for lookup
        const sourceFolders = this.getFoldersByCollection(sourceCollectionId, userId);
        const sourceBookmarks = this.getBookmarksByCollection(sourceCollectionId, userId);

        const folderMap = new Map<string, any>();
        sourceFolders.forEach((f: any) => folderMap.set(f.masterId, f));
        const bookmarkMap = new Map<string, any>();
        sourceBookmarks.forEach((b: any) => bookmarkMap.set(b.masterId, b));

        // Recursively copy a folder and all its children
        const copyFolder = (sourceMasterId: string, newParentMasterId: string | null) => {
            const folder = folderMap.get(sourceMasterId);
            if (!folder) return;

            const newMasterId = crypto.randomUUID();
            folderStmt.run(
                newMasterId,
                `copy-${sourceMasterId.slice(0, 8)}-${Math.floor(Date.now() / 1000)}`,
                null,
                userId,
                destCollectionId,
                folder.title,
                '0',
                newParentMasterId,
                folder.position,
                now,
                null,
                null,
                'active',
                1,
                now
            );
            copiedFolders++;

            // Copy child folders
            sourceFolders
                .filter((f: any) => f.masterParentId === sourceMasterId)
                .forEach((child: any) => copyFolder(child.masterId, newMasterId));

            // Copy child bookmarks
            sourceBookmarks
                .filter((b: any) => b.masterParentId === sourceMasterId)
                .forEach((b: any) => {
                    const newBmId = crypto.randomUUID();
                    bookmarkStmt.run(
                        newBmId,
                        `copy-${b.masterId.slice(0, 8)}-${Date.now()}`,
                        null,
                        userId,
                        destCollectionId,
                        b.url,
                        b.title,
                        '0',
                        newMasterId,
                        b.position,
                        now,
                        null,
                        null,
                        'active',
                        1,
                        now
                    );
                    copiedBookmarks++;
                });
        };

        for (const item of items) {
            if (item.type === 'folder') {
                const folder = folderMap.get(item.masterId);
                if (!folder) continue;

                const newMasterId = crypto.randomUUID();
                folderStmt.run(
                    newMasterId,
                    `copy-${item.masterId.slice(0, 8)}-${Date.now()}`,
                    null,
                    userId,
                    destCollectionId,
                    folder.title,
                    '0',
                    item.targetParentId,
                    folder.position,
                    now,
                    null,
                    null,
                    'active',
                    1,
                    now
                );
                copiedFolders++;

                // Deep copy: recursively copy children
                sourceFolders
                    .filter((f: any) => f.masterParentId === item.masterId)
                    .forEach((child: any) => copyFolder(child.masterId, newMasterId));

                sourceBookmarks
                    .filter((b: any) => b.masterParentId === item.masterId)
                    .forEach((b: any) => {
                        const newBmId = crypto.randomUUID();
                        bookmarkStmt.run(
                            newBmId,
                            `copy-${b.masterId.slice(0, 8)}-${Date.now()}`,
                            null,
                            userId,
                            destCollectionId,
                            b.url,
                            b.title,
                            '0',
                            newMasterId,
                            b.position,
                            now,
                            null,
                            null,
                            'active',
                            1,
                            now
                        );
                        copiedBookmarks++;
                    });
            } else {
                const bookmark = bookmarkMap.get(item.masterId);
                if (!bookmark) continue;

                const newBmId = crypto.randomUUID();
                bookmarkStmt.run(
                    newBmId,
                    `copy-${item.masterId.slice(0, 8)}-${Date.now()}`,
                    null,
                    userId,
                    destCollectionId,
                    bookmark.url,
                    bookmark.title,
                    '0',
                    item.targetParentId,
                    bookmark.position,
                    now,
                    null,
                    null,
                    'active',
                    1,
                    now
                );
                copiedBookmarks++;
            }
        }

        return { copiedFolders, copiedBookmarks };
    }

    public ensureDefaultCollection(userId: string): string {
        // Check if user has a default collection
        const existing = this.getDefaultCollection(userId);
        if (existing) {
            return existing.id;
        }
        // Create default "Master Collection"
        return this.createCollection({
            userId,
            name: 'Master Collection',
            description: 'Your main bookmark collection',
            isDefault: true
        });
    }

    public getCollectionSnapshot(collectionId: string, userId: string): any {
        const collection = this.getCollectionById(collectionId, userId);
        if (!collection) {
            return null;
        }

        const folders = this.db.prepare(`
            SELECT * FROM folders
            WHERE collectionId = ? AND userId = ? AND status = 'active'
            ORDER BY createdAt ASC
        `).all(collectionId, userId);

        const bookmarks = this.db.prepare(`
            SELECT * FROM bookmarks
            WHERE collectionId = ? AND userId = ? AND status = 'active'
            ORDER BY createdAt ASC
        `).all(collectionId, userId);

        return {
            collection,
            folders,
            bookmarks
        };
    }

    public createCollectionEvent(event: {
        userId: string;
        collectionId: string;
        type: string;
        sourceBrowser?: string | null;
        sessionId?: string | null;
        changesCount?: number;
        snapshot: any;
        details?: any;
    }): string {
        const eventId = crypto.randomUUID();
        const stmt = this.db.prepare(`
            INSERT INTO collection_events (
                eventId, userId, collectionId, type, sourceBrowser, sessionId,
                changesCount, snapshotJson, detailsJson, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
            eventId,
            event.userId,
            event.collectionId,
            event.type,
            event.sourceBrowser || null,
            event.sessionId || null,
            event.changesCount ?? 0,
            JSON.stringify(event.snapshot),
            event.details ? JSON.stringify(event.details) : null,
            Math.floor(Date.now() / 1000)
        );

        return eventId;
    }

    public getCollectionEvents(collectionId: string, userId: string, limit = 50): any[] {
        const stmt = this.db.prepare(`
            SELECT
                eventId,
                collectionId,
                type,
                sourceBrowser,
                sessionId,
                changesCount,
                detailsJson,
                rolledBackAt,
                timestamp,
                createdAt
            FROM collection_events
            WHERE collectionId = ? AND userId = ?
            ORDER BY createdAt DESC
            LIMIT ?
        `);

        const rows = stmt.all(collectionId, userId, limit) as any[];
        return rows.map(row => ({
            ...row,
            details: row.detailsJson ? JSON.parse(row.detailsJson) : null
        }));
    }

    public getCollectionEvent(eventId: string, collectionId: string, userId: string): any {
        const stmt = this.db.prepare(`
            SELECT *
            FROM collection_events
            WHERE eventId = ? AND collectionId = ? AND userId = ?
            LIMIT 1
        `);

        const row = stmt.get(eventId, collectionId, userId) as any;
        if (!row) {
            return null;
        }

        return {
            ...row,
            snapshot: row.snapshotJson ? JSON.parse(row.snapshotJson) : null,
            details: row.detailsJson ? JSON.parse(row.detailsJson) : null
        };
    }

    public rollbackCollectionEvent(eventId: string, collectionId: string, userId: string): any {
        const event = this.getCollectionEvent(eventId, collectionId, userId);
        if (!event?.snapshot?.collection) {
            return null;
        }

        const snapshot = event.snapshot;
        const now = Math.floor(Date.now() / 1000);
        const folderMasterIds = (snapshot.folders || []).map((folder: any) => folder.masterId).filter(Boolean);
        const bookmarkMasterIds = (snapshot.bookmarks || []).map((bookmark: any) => bookmark.masterId).filter(Boolean);

        const upsertCollection = this.db.prepare(`
            INSERT INTO collections (id, userId, name, description, isDefault, sortOrder, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                userId = excluded.userId,
                name = excluded.name,
                description = excluded.description,
                isDefault = excluded.isDefault,
                sortOrder = excluded.sortOrder,
                updatedAt = excluded.updatedAt
        `);

        const upsertFolder = this.db.prepare(`
            INSERT INTO folders (
                masterId, browserId, browserInstanceId, userId, collectionId, title, parentId,
                masterParentId, position, dateAdded, sourceBrowser, sessionId,
                status, syncVersion, timestamp, createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(masterId) DO UPDATE SET
                browserId = excluded.browserId,
                browserInstanceId = excluded.browserInstanceId,
                userId = excluded.userId,
                collectionId = excluded.collectionId,
                title = excluded.title,
                parentId = excluded.parentId,
                masterParentId = excluded.masterParentId,
                position = excluded.position,
                dateAdded = excluded.dateAdded,
                sourceBrowser = excluded.sourceBrowser,
                sessionId = excluded.sessionId,
                status = excluded.status,
                syncVersion = excluded.syncVersion,
                timestamp = excluded.timestamp,
                updatedAt = excluded.updatedAt
        `);

        const upsertBookmark = this.db.prepare(`
            INSERT INTO bookmarks (
                masterId, browserId, browserInstanceId, userId, collectionId, url, title,
                parentId, masterParentId, position, dateAdded, sourceBrowser, sessionId,
                status, syncVersion, timestamp, createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(masterId) DO UPDATE SET
                browserId = excluded.browserId,
                browserInstanceId = excluded.browserInstanceId,
                userId = excluded.userId,
                collectionId = excluded.collectionId,
                url = excluded.url,
                title = excluded.title,
                parentId = excluded.parentId,
                masterParentId = excluded.masterParentId,
                position = excluded.position,
                dateAdded = excluded.dateAdded,
                sourceBrowser = excluded.sourceBrowser,
                sessionId = excluded.sessionId,
                status = excluded.status,
                syncVersion = excluded.syncVersion,
                timestamp = excluded.timestamp,
                updatedAt = excluded.updatedAt
        `);

        const run = this.db.transaction(() => {
            upsertCollection.run(
                snapshot.collection.id,
                snapshot.collection.userId || userId,
                snapshot.collection.name,
                snapshot.collection.description || null,
                snapshot.collection.isDefault ? 1 : 0,
                snapshot.collection.sortOrder ?? 0,
                snapshot.collection.createdAt || now,
                now
            );

            let removedFolders = 0;
            let removedBookmarks = 0;

            if (folderMasterIds.length > 0) {
                const folderPlaceholders = folderMasterIds.map(() => '?').join(', ');
                removedFolders = this.db.prepare(`
                    UPDATE folders
                    SET status = 'rolled_back', updatedAt = ?
                    WHERE collectionId = ? AND userId = ? AND status = 'active' AND masterId NOT IN (${folderPlaceholders})
                `).run(now, collectionId, userId, ...folderMasterIds).changes;
            } else {
                removedFolders = this.db.prepare(`
                    UPDATE folders
                    SET status = 'rolled_back', updatedAt = ?
                    WHERE collectionId = ? AND userId = ? AND status = 'active'
                `).run(now, collectionId, userId).changes;
            }

            if (bookmarkMasterIds.length > 0) {
                const bookmarkPlaceholders = bookmarkMasterIds.map(() => '?').join(', ');
                removedBookmarks = this.db.prepare(`
                    UPDATE bookmarks
                    SET status = 'rolled_back', updatedAt = ?
                    WHERE collectionId = ? AND userId = ? AND status = 'active' AND masterId NOT IN (${bookmarkPlaceholders})
                `).run(now, collectionId, userId, ...bookmarkMasterIds).changes;
            } else {
                removedBookmarks = this.db.prepare(`
                    UPDATE bookmarks
                    SET status = 'rolled_back', updatedAt = ?
                    WHERE collectionId = ? AND userId = ? AND status = 'active'
                `).run(now, collectionId, userId).changes;
            }

            for (const folder of snapshot.folders || []) {
                upsertFolder.run(
                    folder.masterId,
                    folder.browserId || folder.masterId,
                    folder.browserInstanceId || null,
                    folder.userId || userId,
                    snapshot.collection.id,
                    folder.title,
                    folder.parentId || null,
                    folder.masterParentId || null,
                    folder.position ?? 0,
                    folder.dateAdded || now,
                    folder.sourceBrowser || null,
                    folder.sessionId || null,
                    'active',
                    folder.syncVersion || 1,
                    folder.timestamp || null,
                    folder.createdAt || now,
                    now
                );
            }

            for (const bookmark of snapshot.bookmarks || []) {
                upsertBookmark.run(
                    bookmark.masterId,
                    bookmark.browserId || bookmark.masterId,
                    bookmark.browserInstanceId || null,
                    bookmark.userId || userId,
                    snapshot.collection.id,
                    bookmark.url,
                    bookmark.title,
                    bookmark.parentId || '',
                    bookmark.masterParentId || null,
                    bookmark.position ?? 0,
                    bookmark.dateAdded || now,
                    bookmark.sourceBrowser || null,
                    bookmark.sessionId || null,
                    'active',
                    bookmark.syncVersion || 1,
                    bookmark.timestamp || null,
                    bookmark.createdAt || now,
                    now
                );
            }

            const deletedEvents = this.db.prepare(`
                DELETE FROM collection_events
                WHERE collectionId = ? AND userId = ? AND createdAt >= ?
            `).run(collectionId, userId, event.createdAt).changes;

            return {
                eventId,
                collectionId,
                restoredFolders: (snapshot.folders || []).length,
                restoredBookmarks: (snapshot.bookmarks || []).length,
                removedFolders,
                removedBookmarks,
                deletedEvents
            };
        });

        return run();
    }

    // Session history operations
    public getSessionHistory(userId: string, limit = 50): any[] {
        const stmt = this.db.prepare(`
            SELECT 
                sessionId,
                sourceBrowser,
                MIN(createdAt) as timestamp,
                COUNT(*) as itemCount,
                SUM(CASE WHEN type = 'bookmark' THEN 1 ELSE 0 END) as bookmarksAdded,
                SUM(CASE WHEN type = 'folder' THEN 1 ELSE 0 END) as foldersAdded
            FROM (
                SELECT sessionId, sourceBrowser, createdAt, 'bookmark' as type 
                FROM bookmarks 
                WHERE userId = ? AND sessionId IS NOT NULL AND status != 'rolled_back'
                UNION ALL
                SELECT sessionId, sourceBrowser, createdAt, 'folder' as type 
                FROM folders 
                WHERE userId = ? AND sessionId IS NOT NULL AND status != 'rolled_back'
            )
            GROUP BY sessionId
            ORDER BY timestamp DESC
            LIMIT ?
        `);
        return stmt.all(userId, userId, limit);
    }

    public getSessionItems(sessionId: string, userId: string): { bookmarks: any[]; folders: any[] } {
        const bookmarks = this.db.prepare(`
            SELECT * FROM bookmarks 
            WHERE sessionId = ? AND userId = ?
            ORDER BY createdAt ASC
        `).all(sessionId, userId);

        const folders = this.db.prepare(`
            SELECT * FROM folders 
            WHERE sessionId = ? AND userId = ?
            ORDER BY createdAt ASC
        `).all(sessionId, userId);

        return { bookmarks, folders };
    }

    public rollbackSession(sessionId: string, userId: string): number {
        const now = Math.floor(Date.now() / 1000);

        const stmt1 = this.db.prepare(`
            UPDATE bookmarks 
            SET status = 'rolled_back', updatedAt = ?
            WHERE sessionId = ? AND userId = ? AND status = 'active'
        `);
        const stmt2 = this.db.prepare(`
            UPDATE folders 
            SET status = 'rolled_back', updatedAt = ?
            WHERE sessionId = ? AND userId = ? AND status = 'active'
        `);

        const r1 = stmt1.run(now, sessionId, userId);
        const r2 = stmt2.run(now, sessionId, userId);
        return r1.changes + r2.changes;
    }

    public restoreSession(sessionId: string, userId: string): number {
        const now = Math.floor(Date.now() / 1000);

        const stmt1 = this.db.prepare(`
            UPDATE bookmarks 
            SET status = 'active', updatedAt = ?
            WHERE sessionId = ? AND userId = ? AND status = 'rolled_back'
        `);
        const stmt2 = this.db.prepare(`
            UPDATE folders 
            SET status = 'active', updatedAt = ?
            WHERE sessionId = ? AND userId = ? AND status = 'rolled_back'
        `);

        const r1 = stmt1.run(now, sessionId, userId);
        const r2 = stmt2.run(now, sessionId, userId);
        return r1.changes + r2.changes;
    }

    // User subscription operations
    public getUserById(userId: string): any {
        const stmt = this.db.prepare(`
            SELECT * FROM users WHERE id = ?
        `);
        return stmt.get(userId);
    }

    public updateUserSubscription(userId: string, updates: {
        subscriptionTier?: string;
        subscriptionExpiresAt?: number | null;
        bookmarkLimit?: number;
        browserLimit?: number;
        collectionLimit?: number;
        polarCustomerId?: string;
    }): boolean {
        // Limits come from the tier settings (auth middleware), not from per-user columns. Those columns
        // are gone from fresh schemas, so this statement must not write them.
        const stmt = this.db.prepare(`
            UPDATE users
            SET subscriptionTier = COALESCE(?, subscriptionTier),
                subscriptionExpiresAt = COALESCE(?, subscriptionExpiresAt),
                polarCustomerId = COALESCE(?, polarCustomerId),
                updatedAt = strftime('%s', 'now')
            WHERE id = ?
        `);
        const result = stmt.run(
            updates.subscriptionTier,
            updates.subscriptionExpiresAt,
            updates.polarCustomerId,
            userId
        );
        return result.changes > 0;
    }

    public getUserByPolarCustomerId(polarCustomerId: string): any {
        const stmt = this.db.prepare(`
            SELECT * FROM users WHERE polarCustomerId = ?
        `);
        return stmt.get(polarCustomerId);
    }

    // Subscription record operations
    public createSubscription(subscription: {
        userId: string;
        planType: string;
        status: string;
        amount: number;
        currency?: string;
        startsAt: number;
        endsAt?: number;
        paymentProvider?: string;
        externalSubscriptionId?: string;
        externalCustomerId?: string;
    }): string {
        const id = crypto.randomUUID();
        const stmt = this.db.prepare(`
            INSERT INTO subscriptions (
                id, userId, planType, status, amount, currency, 
                startsAt, endsAt, paymentProvider, externalSubscriptionId, externalCustomerId
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
            id,
            subscription.userId,
            subscription.planType,
            subscription.status,
            subscription.amount,
            subscription.currency || 'USD',
            subscription.startsAt,
            subscription.endsAt || null,
            subscription.paymentProvider || 'paypal',
            subscription.externalSubscriptionId || null,
            subscription.externalCustomerId || null
        );
        return id;
    }

    public getSubscriptionByExternalId(externalSubscriptionId: string): any {
        const stmt = this.db.prepare(`
            SELECT * FROM subscriptions WHERE externalSubscriptionId = ?
        `);
        return stmt.get(externalSubscriptionId);
    }

    public updateSubscription(subscriptionId: string, updates: {
        status?: string;
        endsAt?: number;
        cancelledAt?: number;
    }): boolean {
        const stmt = this.db.prepare(`
            UPDATE subscriptions 
            SET status = COALESCE(?, status),
                endsAt = COALESCE(?, endsAt),
                cancelledAt = COALESCE(?, cancelledAt),
                updatedAt = strftime('%s', 'now')
            WHERE id = ?
        `);
        const result = stmt.run(updates.status, updates.endsAt, updates.cancelledAt, subscriptionId);
        return result.changes > 0;
    }

    public getActiveSubscription(userId: string): any {
        const stmt = this.db.prepare(`
            SELECT * FROM subscriptions 
            WHERE userId = ? AND status = 'active'
            ORDER BY createdAt DESC
            LIMIT 1
        `);
        return stmt.get(userId);
    }

    // Collection-based queries
    public getFoldersByCollection(collectionId: string | null, userId: string): any[] {
        if (collectionId === null || collectionId === 'default') {
            // Get default collection items (null collectionId)
            const stmt = this.db.prepare(`
                SELECT * FROM folders 
                WHERE userId = ? AND (collectionId IS NULL OR collectionId = '') AND status = 'active'
                ORDER BY parentId, position
            `);
            return stmt.all(userId);
        }
        const stmt = this.db.prepare(`
            SELECT * FROM folders 
            WHERE collectionId = ? AND userId = ? AND status = 'active'
            ORDER BY parentId, position
        `);
        return stmt.all(collectionId, userId);
    }

    public getBookmarksByCollection(collectionId: string | null, userId: string): any[] {
        if (collectionId === null || collectionId === 'default') {
            // Get default collection items (null collectionId)
            const stmt = this.db.prepare(`
                SELECT * FROM bookmarks 
                WHERE userId = ? AND (collectionId IS NULL OR collectionId = '') AND status = 'active'
                ORDER BY parentId, position
            `);
            return stmt.all(userId);
        }
        const stmt = this.db.prepare(`
            SELECT * FROM bookmarks 
            WHERE collectionId = ? AND userId = ? AND status = 'active'
            ORDER BY parentId, position
        `);
        return stmt.all(collectionId, userId);
    }

    // Update operations - now uses masterId for cross-device editing
    public updateBookmark(bookmark: any) {
        // If masterId is provided, use it (mobile/cross-device edit)
        // Otherwise fall back to browserId + browserInstanceId (legacy extension edit)
        if (bookmark.masterId) {
            const stmt = this.db.prepare(`
                UPDATE bookmarks 
                SET title = COALESCE(?, title),
                    url = COALESCE(?, url),
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
                bookmark.metadata?.timestamp || Math.floor(Date.now() / 1000),
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
                SET title = COALESCE(?, title), 
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
            return db.transaction(() => {
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
            return db.transaction(() => {
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
                sourceBrowser,
                sessionId,
                createdAt,
                updatedAt
            FROM bookmarks 
            WHERE userId = ? 
            AND status = 'active'
            ORDER BY masterParentId, position, dateAdded ASC
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
                sourceBrowser,
                sessionId,
                createdAt,
                updatedAt
            FROM folders 
            WHERE userId = ? 
            AND status = 'active'
            ORDER BY masterParentId, position, dateAdded ASC
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
            SELECT id, email, passwordHash, displayName, subscriptionTier, subscriptionExpiresAt
            FROM users
            WHERE email = ?
        `);

        return stmt.get(email) as {
            id: string;
            email: string;
            passwordHash: string | null;
            displayName: string | null;
            subscriptionTier?: string;
            subscriptionExpiresAt?: number | null;
        } | undefined;
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

    // The active item this browser already created under this browserId, if any. Lets a re-sent
    // CREATE return the existing item instead of adding a duplicate.
    public findActiveCreatedMasterId(
        kind: 'bookmarks' | 'folders',
        browserId: string,
        browserInstanceId: string,
        userId: string,
        collectionId: string | null
    ): string | null {
        const row = this.db.prepare(`
            SELECT masterId FROM ${kind}
            WHERE browserId = ? AND browserInstanceId = ? AND userId = ?
              AND collectionId IS ? AND status = 'active'
            ORDER BY updatedAt DESC
            LIMIT 1
        `).get(browserId, browserInstanceId, userId, collectionId) as { masterId: string } | undefined;
        return row?.masterId ?? null;
    }

    // Whether an active item with this masterId is a bookmark or a folder. A masterId is global, so this works
    // across browsers, unlike browserId.
    public findMasterItemKind(masterId: string, userId: string): 'bookmark' | 'folder' | null {
        const bookmark = this.db.prepare(`
            SELECT 1 FROM bookmarks WHERE masterId = ? AND userId = ? AND status = 'active' LIMIT 1
        `).get(masterId, userId);
        if (bookmark) return 'bookmark';
        const folder = this.db.prepare(`
            SELECT 1 FROM folders WHERE masterId = ? AND userId = ? AND status = 'active' LIMIT 1
        `).get(masterId, userId);
        return folder ? 'folder' : null;
    }

    // Whether an active item with this browserId was created by this browser instance, and if so whether it is
    // a bookmark or a folder. Scoped to the instance: browser ids repeat across browsers and accounts.
    public findBrowserItemKind(browserId: string, browserInstanceId: string | undefined, userId: string): 'bookmark' | 'folder' | null {
        if (!browserInstanceId) return null;
        const bookmark = this.db.prepare(`
            SELECT 1 FROM bookmarks
            WHERE browserId = ? AND browserInstanceId = ? AND userId = ? AND status = 'active'
            LIMIT 1
        `).get(browserId, browserInstanceId, userId);
        if (bookmark) return 'bookmark';
        const folder = this.db.prepare(`
            SELECT 1 FROM folders
            WHERE browserId = ? AND browserInstanceId = ? AND userId = ? AND status = 'active'
            LIMIT 1
        `).get(browserId, browserInstanceId, userId);
        return folder ? 'folder' : null;
    }

    public normalizeBrowserItemId(rawBrowserId: unknown, browserInstanceId: unknown, prefix: 'folder' | 'bookmark'): string {
        return this.normalizeEntityBrowserId(rawBrowserId, browserInstanceId, prefix);
    }

    // Get folder masterId by browserId (for resolving parentId references)
    public getFolderMasterIdByBrowserId(browserId: string, userId: string, collectionId?: string): string | null {
        const stmt = collectionId
            ? this.db.prepare(`
                SELECT masterId FROM folders 
                WHERE browserId = ? AND userId = ? AND collectionId = ? AND status = 'active'
                ORDER BY updatedAt DESC
                LIMIT 1
            `)
            : this.db.prepare(`
                SELECT masterId FROM folders 
                WHERE browserId = ? AND userId = ? AND status = 'active'
                ORDER BY updatedAt DESC
                LIMIT 1
            `);
        const result = (collectionId
            ? stmt.get(browserId, userId, collectionId)
            : stmt.get(browserId, userId)) as { masterId: string } | undefined;
        return result?.masterId || null;
    }

    public getFolderBrowserIdByMasterId(masterId: string, userId: string, collectionId?: string): string | null {
        const stmt = collectionId
            ? this.db.prepare(`
                SELECT browserId FROM folders
                WHERE masterId = ? AND userId = ? AND collectionId = ? AND status = 'active'
                LIMIT 1
            `)
            : this.db.prepare(`
                SELECT browserId FROM folders
                WHERE masterId = ? AND userId = ? AND status = 'active'
                LIMIT 1
            `);

        const result = (collectionId
            ? stmt.get(masterId, userId, collectionId)
            : stmt.get(masterId, userId)) as { browserId: string } | undefined;

        return result?.browserId || null;
    }

    /**
     * Get the actual pending changes for a browser to sync down.
     * Returns folders and bookmarks that have been created, updated, or deleted
     * by OTHER browsers since this browser's last sync.
     */
    public getPendingChangesDetails(userId: string, browserInstanceId: string, lastSyncSeconds: number) {
        // Get new folders (created by other browsers after last sync)
        const newFolders = this.db.prepare(`
            SELECT 
                masterId,
                browserId,
                title,
                parentId,
                masterParentId,
                position,
                dateAdded,
                status,
                createdAt,
                updatedAt
            FROM folders
            WHERE userId = ?
              AND (browserInstanceId IS NULL OR browserInstanceId != ?)
              AND status = 'active'
              AND createdAt > ?
            ORDER BY createdAt ASC
        `).all(userId, browserInstanceId, lastSyncSeconds);

        // Get new bookmarks (created by other browsers after last sync)
        const newBookmarks = this.db.prepare(`
            SELECT 
                masterId,
                browserId,
                url,
                title,
                parentId,
                masterParentId,
                position,
                dateAdded,
                status,
                createdAt,
                updatedAt
            FROM bookmarks
            WHERE userId = ?
              AND (browserInstanceId IS NULL OR browserInstanceId != ?)
              AND status = 'active'
              AND createdAt > ?
            ORDER BY createdAt ASC
        `).all(userId, browserInstanceId, lastSyncSeconds);

        // Get updated folders (modified by other browsers after last sync, but created before)
        const updatedFolders = this.db.prepare(`
            SELECT 
                masterId,
                browserId,
                title,
                parentId,
                masterParentId,
                position,
                dateAdded,
                status,
                createdAt,
                updatedAt
            FROM folders
            WHERE userId = ?
              AND (browserInstanceId IS NULL OR browserInstanceId != ?)
              AND status = 'active'
              AND updatedAt > ?
              AND createdAt <= ?
            ORDER BY updatedAt ASC
        `).all(userId, browserInstanceId, lastSyncSeconds, lastSyncSeconds);

        // Get updated bookmarks (modified by other browsers after last sync, but created before)
        const updatedBookmarks = this.db.prepare(`
            SELECT 
                masterId,
                browserId,
                url,
                title,
                parentId,
                masterParentId,
                position,
                dateAdded,
                status,
                createdAt,
                updatedAt
            FROM bookmarks
            WHERE userId = ?
              AND (browserInstanceId IS NULL OR browserInstanceId != ?)
              AND status = 'active'
              AND updatedAt > ?
              AND createdAt <= ?
            ORDER BY updatedAt ASC
        `).all(userId, browserInstanceId, lastSyncSeconds, lastSyncSeconds);

        // Get deleted folders (marked deleted by other browsers after last sync)
        const deletedFolders = this.db.prepare(`
            SELECT 
                masterId,
                browserId,
                title,
                parentId,
                masterParentId,
                updatedAt
            FROM folders
            WHERE userId = ?
              AND (browserInstanceId IS NULL OR browserInstanceId != ?)
              AND status = 'deleted'
              AND updatedAt > ?
        `).all(userId, browserInstanceId, lastSyncSeconds);

        // Get deleted bookmarks (marked deleted by other browsers after last sync)
        const deletedBookmarks = this.db.prepare(`
            SELECT 
                masterId,
                browserId,
                url,
                title,
                parentId,
                masterParentId,
                updatedAt
            FROM bookmarks
            WHERE userId = ?
              AND (browserInstanceId IS NULL OR browserInstanceId != ?)
              AND status = 'deleted'
              AND updatedAt > ?
        `).all(userId, browserInstanceId, lastSyncSeconds);

        return {
            creates: {
                folders: newFolders,
                bookmarks: newBookmarks
            },
            updates: {
                folders: updatedFolders,
                bookmarks: updatedBookmarks
            },
            deletes: {
                folders: deletedFolders,
                bookmarks: deletedBookmarks
            }
        };
    }

    /**
     * Record that a browser has synced down changes.
     * This updates the browser's last sync timestamp so it won't receive these changes again.
     *
     * IMPORTANT: Before calling this function, ensure the browser is registered via registerBrowser().
     * Otherwise, createSyncHistory will fail with a FOREIGN KEY constraint error because
     * browserInstanceId must exist in the browsers table.
     */
    public recordSyncDown(userId: string, browserInstanceId: string, changesApplied: number) {
        return this.createSyncHistory({
            userId,
            browserInstanceId,
            type: 'SYNC',
            changesCount: changesApplied,
            status: 'SUCCESS',
            bookmarksProcessed: 0,
            foldersProcessed: 0,
            metadata: {
                timestamp: Math.floor(Date.now() / 1000),
                deviceInfo: { browserInstanceId }
            }
        });
    }

    // --- DATA REPAIR UTILITIES ---

    // Password reset token operations
    public createPasswordResetToken(userId: string, token: string, expiresAt: number): void {
        // Invalidate any existing tokens for this user
        this.db.prepare(`
            DELETE FROM password_reset_tokens WHERE userId = ?
        `).run(userId);

        const stmt = this.db.prepare(`
            INSERT INTO password_reset_tokens (userId, token, expiresAt)
            VALUES (?, ?, ?)
        `);
        stmt.run(userId, token, expiresAt);
    }

    public getPasswordResetToken(token: string): { userId: string; token: string; expiresAt: number; usedAt: number | null } | undefined {
        const stmt = this.db.prepare(`
            SELECT userId, token, expiresAt, usedAt
            FROM password_reset_tokens
            WHERE token = ?
        `);
        return stmt.get(token) as { userId: string; token: string; expiresAt: number; usedAt: number | null } | undefined;
    }

    public markPasswordResetTokenUsed(token: string): void {
        const stmt = this.db.prepare(`
            UPDATE password_reset_tokens
            SET usedAt = strftime('%s', 'now')
            WHERE token = ?
        `);
        stmt.run(token);
    }

    public updateUserPassword(userId: string, passwordHash: string): boolean {
        const stmt = this.db.prepare(`
            UPDATE users
            SET passwordHash = ?, updatedAt = strftime('%s', 'now')
            WHERE id = ?
        `);
        const result = stmt.run(passwordHash, userId);
        return result.changes > 0;
    }

    public repairStructure(userId: string): { fixedFolders: number; fixedBookmarks: number } {
        // Link orphaned folders to their parents
        const folderFixStmt = this.db.prepare(`
            UPDATE folders
            SET masterParentId = (
                SELECT parent.masterId
                FROM folders AS parent
                WHERE parent.browserId = folders.parentId
                AND parent.browserInstanceId = folders.browserInstanceId
            )
            WHERE masterParentId IS NULL
            AND parentId != '0'
            AND EXISTS (
                SELECT 1
                FROM folders AS parent
                WHERE parent.browserId = folders.parentId
                AND parent.browserInstanceId = folders.browserInstanceId
            )
            AND userId = ?
        `);

        const folderResult = folderFixStmt.run(userId);

        // Link orphaned bookmarks to their parents (folders)
        const bookmarkFixStmt = this.db.prepare(`
            UPDATE bookmarks
            SET masterParentId = (
                SELECT parent.masterId
                FROM folders AS parent
                WHERE parent.browserId = bookmarks.parentId
                AND parent.browserInstanceId = bookmarks.browserInstanceId
            )
            WHERE masterParentId IS NULL
            AND EXISTS (
                SELECT 1
                FROM folders AS parent
                WHERE parent.browserId = bookmarks.parentId
                AND parent.browserInstanceId = bookmarks.browserInstanceId
            )
            AND userId = ?
        `);

        const bookmarkResult = bookmarkFixStmt.run(userId);

        return {
            fixedFolders: folderResult.changes,
            fixedBookmarks: bookmarkResult.changes
        };
    }
}

export const db = DatabaseService.getInstance();

// Resolves once `runFileMigrations()` has applied every migration in
// `db/migrations/`. Tests should `await dbReady` before issuing requests so
// schema add-ons (002-006) don't race any request handler. See
// `DatabaseService.readyPromise` above for the rationale.
export const dbReady: Promise<void> =
    // `db` was just created by `getInstance()` above, which ran the
    // constructor's synchronous `initializeDatabase()` and started the
    // async file-migration. By the time this initializer runs the promise
    // is guaranteed to be set, but the assertion clarifies intent for the
    // type-checker that the narrowing-from-undefined still applies here.
    DatabaseService.readyPromise ?? Promise.resolve();
