import type Database from 'better-sqlite3';

export function up(db: Database.Database) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId TEXT NOT NULL,
            token TEXT NOT NULL UNIQUE,
            expiresAt INTEGER NOT NULL,
            usedAt INTEGER,
            createdAt INTEGER DEFAULT (strftime('%s', 'now')),
            FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
        CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_userid ON password_reset_tokens(userId);
    `);
    console.log('Migration 004: Created password_reset_tokens table');
}
