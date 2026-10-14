import type Database from 'better-sqlite3';

export function up(database: Database.Database): void {
    database.transaction(() => {
        if (!(database.prepare('PRAGMA table_info(users)').all() as any[]).some(column => column.name === 'emailVerifiedAt')) {
            database.exec('ALTER TABLE users ADD COLUMN emailVerifiedAt INTEGER');
        }
        database.exec(`CREATE TABLE IF NOT EXISTS email_verification_tokens (
            tokenHash TEXT PRIMARY KEY, userId TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            email TEXT NOT NULL, expiresAt INTEGER NOT NULL, createdAt INTEGER NOT NULL
        )`);
    })();
}
