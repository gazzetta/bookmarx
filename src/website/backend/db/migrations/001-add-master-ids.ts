import Database from 'better-sqlite3';
import * as path from 'path';
import * as crypto from 'crypto';

const dbPath = path.join(__dirname, '../../../data/bookmarx.db');

export function runMigration() {
    console.log('Starting migration: 001-add-master-ids');
    console.log('Database path:', dbPath);

    const db = new Database(dbPath);
    db.pragma('foreign_keys = OFF');

    try {
        db.transaction(() => {
            // Check if masterId column already exists in bookmarks
            const bookmarkColumns = db.prepare("PRAGMA table_info(bookmarks)").all() as { name: string }[];
            const hasMasterIdBookmarks = bookmarkColumns.some(col => col.name === 'masterId');

            if (!hasMasterIdBookmarks) {
                console.log('Adding masterId column to bookmarks table...');
                // SQLite doesn't allow adding UNIQUE columns directly, add without constraint first
                db.exec('ALTER TABLE bookmarks ADD COLUMN masterId TEXT');
                db.exec('ALTER TABLE bookmarks ADD COLUMN masterParentId TEXT');
            } else {
                console.log('masterId column already exists in bookmarks table');
            }

            // Check if masterId column already exists in folders
            const folderColumns = db.prepare("PRAGMA table_info(folders)").all() as { name: string }[];
            const hasMasterIdFolders = folderColumns.some(col => col.name === 'masterId');

            if (!hasMasterIdFolders) {
                console.log('Adding masterId column to folders table...');
                // SQLite doesn't allow adding UNIQUE columns directly, add without constraint first
                db.exec('ALTER TABLE folders ADD COLUMN masterId TEXT');
                db.exec('ALTER TABLE folders ADD COLUMN masterParentId TEXT');
            } else {
                console.log('masterId column already exists in folders table');
            }

            // Generate UUIDs for existing folders first (so we can reference them for bookmarks)
            const foldersWithoutMasterId = db.prepare(`
                SELECT id, browserId, parentId FROM folders WHERE masterId IS NULL
            `).all() as { id: number; browserId: string; parentId: string | null }[];

            console.log(`Generating masterIds for ${foldersWithoutMasterId.length} folders...`);

            const folderMasterIdMap = new Map<string, string>(); // browserId -> masterId

            for (const folder of foldersWithoutMasterId) {
                const masterId = crypto.randomUUID();
                folderMasterIdMap.set(folder.browserId, masterId);
                
                db.prepare('UPDATE folders SET masterId = ? WHERE id = ?').run(masterId, folder.id);
            }

            // Now update masterParentId for folders
            console.log('Updating masterParentId for folders...');
            for (const folder of foldersWithoutMasterId) {
                if (folder.parentId && folderMasterIdMap.has(folder.parentId)) {
                    const masterParentId = folderMasterIdMap.get(folder.parentId);
                    db.prepare('UPDATE folders SET masterParentId = ? WHERE browserId = ?')
                        .run(masterParentId, folder.browserId);
                }
            }

            // Generate UUIDs for existing bookmarks
            const bookmarksWithoutMasterId = db.prepare(`
                SELECT id, browserId, parentId FROM bookmarks WHERE masterId IS NULL
            `).all() as { id: number; browserId: string; parentId: string }[];

            console.log(`Generating masterIds for ${bookmarksWithoutMasterId.length} bookmarks...`);

            for (const bookmark of bookmarksWithoutMasterId) {
                const masterId = crypto.randomUUID();
                const masterParentId = folderMasterIdMap.get(bookmark.parentId) || null;
                
                db.prepare('UPDATE bookmarks SET masterId = ?, masterParentId = ? WHERE id = ?')
                    .run(masterId, masterParentId, bookmark.id);
            }

            // Create indexes if they don't exist
            console.log('Creating indexes...');
            db.exec('CREATE INDEX IF NOT EXISTS idx_bookmarks_masterid ON bookmarks(masterId)');
            db.exec('CREATE INDEX IF NOT EXISTS idx_folders_masterid ON folders(masterId)');
            db.exec('CREATE INDEX IF NOT EXISTS idx_bookmarks_masterparentid ON bookmarks(masterParentId)');
            db.exec('CREATE INDEX IF NOT EXISTS idx_folders_masterparentid ON folders(masterParentId)');

            console.log('Migration completed successfully!');
            console.log(`  - Folders processed: ${foldersWithoutMasterId.length}`);
            console.log(`  - Bookmarks processed: ${bookmarksWithoutMasterId.length}`);
        })();
    } catch (error) {
        console.error('Migration failed:', error);
        throw error;
    } finally {
        db.pragma('foreign_keys = ON');
        db.close();
    }
}

// Run if called directly
if (require.main === module) {
    runMigration();
}
