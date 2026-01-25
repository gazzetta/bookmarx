// Migration: Add MERGE_IMPORT to sync_history type constraint
// SQLite doesn't support ALTER CHECK CONSTRAINT, so we need to recreate the table

import Database from 'better-sqlite3';

export function up(db: Database.Database): void {
    console.log('Running migration: 002-add-merge-import-type');
    
    // SQLite doesn't support modifying CHECK constraints directly
    // We need to:
    // 1. Create a new table with the updated constraint
    // 2. Copy data from old table
    // 3. Drop old table
    // 4. Rename new table
    
    db.exec(`
        -- Create new table with updated constraint
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
        
        -- Copy existing data
        INSERT INTO sync_history_new 
        SELECT * FROM sync_history;
        
        -- Drop old table
        DROP TABLE sync_history;
        
        -- Rename new table
        ALTER TABLE sync_history_new RENAME TO sync_history;
        
        -- Recreate indexes
        CREATE INDEX IF NOT EXISTS idx_sync_history_userid ON sync_history(userId);
        CREATE INDEX IF NOT EXISTS idx_sync_history_browserinstanceid ON sync_history(browserInstanceId);
    `);
    
    console.log('Migration 002-add-merge-import-type completed');
}

export function down(db: Database.Database): void {
    // Revert to original constraint (removing MERGE_IMPORT)
    db.exec(`
        CREATE TABLE IF NOT EXISTS sync_history_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId TEXT NOT NULL,
            browserInstanceId TEXT,
            type TEXT CHECK(type IN ('INITIAL_IMPORT', 'SYNC')) NOT NULL,
            changesCount INTEGER NOT NULL,
            status TEXT CHECK(status IN ('SUCCESS', 'FAILED', 'PARTIAL')) NOT NULL,
            bookmarksProcessed INTEGER DEFAULT 0,
            foldersProcessed INTEGER DEFAULT 0,
            timestamp INTEGER,
            createdAt INTEGER DEFAULT (strftime('%s', 'now')),
            updatedAt INTEGER DEFAULT (strftime('%s', 'now')),
            FOREIGN KEY (browserInstanceId) REFERENCES browsers(browserInstanceId)
        );
        
        INSERT INTO sync_history_new 
        SELECT * FROM sync_history WHERE type != 'MERGE_IMPORT';
        
        DROP TABLE sync_history;
        
        ALTER TABLE sync_history_new RENAME TO sync_history;
        
        CREATE INDEX IF NOT EXISTS idx_sync_history_userid ON sync_history(userId);
        CREATE INDEX IF NOT EXISTS idx_sync_history_browserinstanceid ON sync_history(browserInstanceId);
    `);
}
