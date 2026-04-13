
import { Database } from 'better-sqlite3';

export async function up(db: Database) {
    console.log('Migrating: Adding status and archivedAt columns to collections table');

    db.transaction(() => {
        // Add status column (active, archived)
        db.prepare(`
            ALTER TABLE collections ADD COLUMN status TEXT DEFAULT 'active'
        `).run();

        // Add archivedAt timestamp
        db.prepare(`
            ALTER TABLE collections ADD COLUMN archivedAt INTEGER
        `).run();

        console.log('Successfully added status and archivedAt columns to collections');
    })();
}

export async function down(db: Database) {
    console.log('Rollback: Removing status and archivedAt columns from collections table');

    db.transaction(() => {
        db.prepare(`
            CREATE TABLE IF NOT EXISTS collections_new (
                id TEXT PRIMARY KEY,
                userId TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                isDefault INTEGER DEFAULT 0,
                sortOrder INTEGER DEFAULT 0,
                createdAt INTEGER DEFAULT (strftime('%s', 'now')),
                updatedAt INTEGER DEFAULT (strftime('%s', 'now'))
            )
        `).run();

        db.prepare(`
            INSERT INTO collections_new (id, userId, name, description, isDefault, sortOrder, createdAt, updatedAt)
            SELECT id, userId, name, description, isDefault, sortOrder, createdAt, updatedAt
            FROM collections
        `).run();

        db.prepare('DROP TABLE collections').run();
        db.prepare('ALTER TABLE collections_new RENAME TO collections').run();

        console.log('Successfully removed status and archivedAt columns');
    })();
}
