import { Database } from 'better-sqlite3';

export async function up(db: Database) {
    console.log('Migrating: Adding currentCollectionId column to browsers table');

    db.transaction(() => {
        db.prepare(`
            ALTER TABLE browsers ADD COLUMN currentCollectionId TEXT REFERENCES collections(id)
        `).run();

        console.log('Successfully added currentCollectionId column to browsers');
    })();
}

export async function down(db: Database) {
    console.log('Rollback: Removing currentCollectionId column from browsers table');

    db.transaction(() => {
        db.prepare(`
            CREATE TABLE IF NOT EXISTS browsers_new (
                browserInstanceId TEXT PRIMARY KEY,
                userId TEXT NOT NULL,
                deviceId TEXT,
                browser TEXT,
                browserVersion TEXT,
                os TEXT,
                osVersion TEXT,
                userAgent TEXT,
                nickname TEXT,
                lastSeen INTEGER,
                createdAt INTEGER DEFAULT (strftime('%s', 'now')),
                updatedAt INTEGER DEFAULT (strftime('%s', 'now')),
                FOREIGN KEY (userId) REFERENCES users(id)
            )
        `).run();

        db.prepare(`
            INSERT INTO browsers_new (browserInstanceId, userId, deviceId, browser, browserVersion, os, osVersion, userAgent, nickname, lastSeen, createdAt, updatedAt)
            SELECT browserInstanceId, userId, deviceId, browser, browserVersion, os, osVersion, userAgent, nickname, lastSeen, createdAt, updatedAt
            FROM browsers
        `).run();

        db.prepare('DROP TABLE browsers').run();
        db.prepare('ALTER TABLE browsers_new RENAME TO browsers').run();

        console.log('Successfully removed currentCollectionId column');
    })();
}
