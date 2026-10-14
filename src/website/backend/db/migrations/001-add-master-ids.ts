import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

// this file used to be invoked two different ways:
//   1. The DatabaseService.runFileMigrations() loop does `require(...)` then
//      calls `migration.up(this.db)`. The previous export was named
//      `runMigration`, so `migration.up` was always undefined -> the migration
//      silently never executed and was never marked as run, so the loop kept
//      re-attempting it on every boot.
//   2. The module also had a `require.main === module` CLI entry that opened
//      its own Database connection by computing a path via `__dirname`, which
//      throws "Not defined in ES module scope" once Node loads this as ESM.
//
// We now expose the runner's expected `up(db)` (receiving the singleton db), and
// keep a small `runMigration()` shell for the rare manual-CLI case that opens
// route through `process.env.DATABASE_PATH` instead of `__dirname`.

// Use the canonical better-sqlite3 database type so callers (the singleton's
// `runFileMigrations` loop) can pass `this.db` directly with no widening, and
// so the manual-CLI path in `runMigration()` doesn't have to cast.
type MigrationDb = Database.Database;

export function up(db: MigrationDb): void {
    console.log('Running migration: 001-add-master-ids');
    // db.transaction(() => {...}) returns a wrapped function that must be
    // invoked to actually run the body inside the transaction — easy to forget
    // (the previous revision did). The trailing () is what makes it execute.
    db.transaction(() => {
        const bookmarkColumns = db.prepare('PRAGMA table_info(bookmarks)').all() as { name: string }[];
        const hasMasterIdBookmarks = bookmarkColumns.some(col => col.name === 'masterId');
        if (!hasMasterIdBookmarks) {
            console.log('Adding masterId/masterParentId columns to bookmarks table...');
            db.exec('ALTER TABLE bookmarks ADD COLUMN masterId TEXT');
            db.exec('ALTER TABLE bookmarks ADD COLUMN masterParentId TEXT');
        } else {
            console.log('masterId column already exists in bookmarks table');
        }

        const folderColumns = db.prepare('PRAGMA table_info(folders)').all() as { name: string }[];
        const hasMasterIdFolders = folderColumns.some(col => col.name === 'masterId');
        if (!hasMasterIdFolders) {
            console.log('Adding masterId/masterParentId columns to folders table...');
            db.exec('ALTER TABLE folders ADD COLUMN masterId TEXT');
            db.exec('ALTER TABLE folders ADD COLUMN masterParentId TEXT');
        } else {
            console.log('masterId column already exists in folders table');
        }

        // Backfill masterIds for any pre-existing rows that lack them. Folders
        // first so we can resolve bookmarks' masterParentId afterwards.
        const foldersWithoutMasterId = db.prepare(
            'SELECT id, browserId, parentId FROM folders WHERE masterId IS NULL'
        ).all() as { id: number; browserId: string; parentId: string | null }[];
        console.log(`Generating masterIds for ${foldersWithoutMasterId.length} folders...`);

        const folderMasterIdMap = new Map<string, string>(); // browserId -> masterId
        for (const folder of foldersWithoutMasterId) {
            const masterId = crypto.randomUUID();
            folderMasterIdMap.set(folder.browserId, masterId);
            db.prepare('UPDATE folders SET masterId = ? WHERE id = ?').run(masterId, folder.id);
        }

        for (const folder of foldersWithoutMasterId) {
            if (folder.parentId && folderMasterIdMap.has(folder.parentId)) {
                const masterParentId = folderMasterIdMap.get(folder.parentId);
                db.prepare('UPDATE folders SET masterParentId = ? WHERE browserId = ?')
                    .run(masterParentId, folder.browserId);
            }
        }

        const bookmarksWithoutMasterId = db.prepare(
            'SELECT id, browserId, parentId FROM bookmarks WHERE masterId IS NULL'
        ).all() as { id: number; browserId: string; parentId: string | null }[];
        console.log(`Generating masterIds for ${bookmarksWithoutMasterId.length} bookmarks...`);

        for (const bookmark of bookmarksWithoutMasterId) {
            const masterId = crypto.randomUUID();
            const masterParentId = (bookmark.parentId && folderMasterIdMap.get(bookmark.parentId)) || null;
            db.prepare('UPDATE bookmarks SET masterId = ?, masterParentId = ? WHERE id = ?')
                .run(masterId, masterParentId, bookmark.id);
        }

        db.exec('CREATE INDEX IF NOT EXISTS idx_bookmarks_masterid ON bookmarks(masterId)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_folders_masterid ON folders(masterId)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_bookmarks_masterparentid ON bookmarks(masterParentId)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_folders_masterparentid ON folders(masterParentId)');

        console.log(`Migration 001-add-master-ids complete (folders: ${foldersWithoutMasterId.length}, bookmarks: ${bookmarksWithoutMasterId.length})`);
    })();
}

// Manual entry point: `$ tsx backend/db/migrations/001-add-master-ids.ts`.
// Opens its own connection against `process.env.DATABASE_PATH` (or the repo
// default) rather than reaching for `__dirname`, which is undefined in ESM.
export function runMigration(): void {
    const dbPath = process.env.DATABASE_PATH
        || path.join(process.cwd(), 'data', 'bookmarx.db');
    if (!fs.existsSync(path.dirname(dbPath))) {
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    const db = new Database(dbPath);
    db.pragma('foreign_keys = OFF');
    try {
        up(db);
    } finally {
        db.pragma('foreign_keys = ON');
        db.close();
    }
}

// Self-invoke if executed directly from a CLI (e.g. `tsx backend/db/migrations/001-add-master-ids.ts`).
// The `typeof require` guard avoids throwing "require is not defined in ES module scope"
// when this file is loaded by vitest as native ESM.
try {
    if (typeof require !== 'undefined' && require.main === module) {
        runMigration();
    }
} catch {
    // Native ESM context: `require` is not available. The runner that called
    // `up(db)` already executes this migration, so standalone-CLI entry is moot.
}
