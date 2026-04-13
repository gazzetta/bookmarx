
import { Database } from 'better-sqlite3';

export async function up(db: Database) {
    console.log('Migrating: Removing limit columns from users table');

    db.transaction(() => {
        // 1. Create new table without limit columns
        db.prepare(`
            CREATE TABLE IF NOT EXISTS users_new (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                passwordHash TEXT,
                displayName TEXT,
                subscriptionTier TEXT DEFAULT 'free',
                subscriptionExpiresAt INTEGER,
                polarCustomerId TEXT,
                createdAt INTEGER DEFAULT (strftime('%s', 'now')),
                updatedAt INTEGER DEFAULT (strftime('%s', 'now'))
            )
        `).run();

        // 2. Copy data from old table to new table
        db.prepare(`
            INSERT INTO users_new (
                id, email, passwordHash, displayName, subscriptionTier, 
                subscriptionExpiresAt, polarCustomerId, createdAt, updatedAt
            )
            SELECT 
                id, email, passwordHash, displayName, subscriptionTier, 
                subscriptionExpiresAt, polarCustomerId, createdAt, updatedAt
            FROM users
        `).run();

        // 3. Drop old table
        db.prepare('DROP TABLE users').run();

        // 4. Rename new table to old table name
        db.prepare('ALTER TABLE users_new RENAME TO users').run();

        // 5. Recreate index
        db.prepare('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)').run();

        console.log('Successfully removed limit columns from users table');
    })();
}

export async function down(db: Database) {
    console.log('Rollback: Restoring limit columns to users table');

    db.transaction(() => {
        // 1. Create table with old schema
        db.prepare(`
            CREATE TABLE IF NOT EXISTS users_old (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                passwordHash TEXT,
                displayName TEXT,
                subscriptionTier TEXT DEFAULT 'free',
                subscriptionExpiresAt INTEGER,
                bookmarkLimit INTEGER DEFAULT 250,
                browserLimit INTEGER DEFAULT 2,
                collectionLimit INTEGER DEFAULT 1,
                polarCustomerId TEXT,
                createdAt INTEGER DEFAULT (strftime('%s', 'now')),
                updatedAt INTEGER DEFAULT (strftime('%s', 'now'))
            )
        `).run();

        // 2. Copy data back
        db.prepare(`
            INSERT INTO users_old (
                id, email, passwordHash, displayName, subscriptionTier, 
                subscriptionExpiresAt, polarCustomerId, createdAt, updatedAt
            )
            SELECT 
                id, email, passwordHash, displayName, subscriptionTier, 
                subscriptionExpiresAt, polarCustomerId, createdAt, updatedAt
            FROM users
        `).run();

        // 3. Drop current table
        db.prepare('DROP TABLE users').run();

        // 4. Rename old structure back to main
        db.prepare('ALTER TABLE users_old RENAME TO users').run();

        // 5. Recreate index
        db.prepare('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)').run();

        console.log('Successfully restored limit columns');
    })();
}
