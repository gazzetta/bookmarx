import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
    db.transaction(() => {
        const addColumn = (table: string, name: string, definition: string) => {
            const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
            if (!columns.some(c => c.name === name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
        };
        addColumn('users', 'tokenVersion', 'INTEGER NOT NULL DEFAULT 0');
        addColumn('collections', 'initializedAt', 'INTEGER');
        for (const table of ['folders', 'bookmarks']) {
            addColumn(table, 'rootKind', 'TEXT');
            addColumn(table, 'lastModifiedByBrowserInstanceId', 'TEXT');
        }
        db.exec(`UPDATE folders SET rootKind = CASE lower(title)
            WHEN 'bookmarks bar' THEN 'bar' WHEN 'bookmarks toolbar' THEN 'bar' WHEN 'favourites bar' THEN 'bar' WHEN 'favorites bar' THEN 'bar'
            WHEN 'other bookmarks' THEN 'other' WHEN 'other favourites' THEN 'other' WHEN 'other favorites' THEN 'other'
            WHEN 'bookmarks menu' THEN 'menu' WHEN 'mobile bookmarks' THEN 'mobile' WHEN 'imported bookmarks' THEN 'imported' WHEN 'unsorted bookmarks' THEN 'unsorted' END
            WHERE masterParentId IS NULL AND parentId IN ('0', 'root________');
            UPDATE collections SET initializedAt = strftime('%s', 'now') WHERE EXISTS (SELECT 1 FROM bookmarks WHERE collectionId = collections.id)
                OR EXISTS (SELECT 1 FROM folders WHERE collectionId = collections.id AND rootKind IS NULL)
                OR EXISTS (SELECT 1 FROM sync_history WHERE collectionId = collections.id AND type IN ('INITIAL_IMPORT', 'MERGE_IMPORT'));
        `);
        db.exec(`
            CREATE TABLE auth_rate_limits (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expiresAt INTEGER NOT NULL);
            CREATE TABLE sync_cursors (
                userId TEXT NOT NULL, browserInstanceId TEXT NOT NULL, collectionId TEXT NOT NULL,
                revision INTEGER NOT NULL DEFAULT 0, offeredRevision INTEGER NOT NULL DEFAULT 0,
                timestamp INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (userId, browserInstanceId, collectionId)
            );
            CREATE TABLE sync_changes (
                revision INTEGER PRIMARY KEY AUTOINCREMENT,
                userId TEXT NOT NULL, collectionId TEXT, masterId TEXT NOT NULL,
                itemType TEXT NOT NULL, action TEXT NOT NULL, itemJson TEXT NOT NULL
            );
            CREATE INDEX idx_sync_changes_scope ON sync_changes(userId, collectionId, revision);
            CREATE TABLE mutation_receipts (
                userId TEXT NOT NULL, collectionId TEXT NOT NULL, operationId TEXT NOT NULL,
                requestHash TEXT NOT NULL, resultJson TEXT NOT NULL,
                PRIMARY KEY (userId, collectionId, operationId)
            );
            CREATE TABLE paypal_checkouts (
                externalId TEXT PRIMARY KEY, userId TEXT NOT NULL, planType TEXT NOT NULL,
                amount INTEGER NOT NULL, currency TEXT NOT NULL, createdAt INTEGER NOT NULL,
                FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE TABLE payment_events (
                provider TEXT NOT NULL, eventId TEXT NOT NULL, processedAt INTEGER NOT NULL,
                PRIMARY KEY (provider, eventId)
            );
            CREATE UNIQUE INDEX idx_subscription_provider_external
                ON subscriptions(paymentProvider, externalSubscriptionId) WHERE externalSubscriptionId IS NOT NULL;
        `);
        // Database triggers cover website edits, sync, rollback and hard collection deletion.
        // A revision is allocated in the same transaction as its underlying mutation.
        for (const [table, kind] of [['folders', 'folder'], ['bookmarks', 'bookmark']]) {
            const json = (row: string) => `json_object(
                'masterId', ${row}.masterId, 'browserId', ${row}.browserId,
                'title', ${row}.title, 'parentId', ${row}.parentId, 'masterParentId', ${row}.masterParentId,
                'position', ${row}.position, 'rootKind', ${row}.rootKind, 'createdAt', ${row}.createdAt,
                'updatedAt', ${row}.updatedAt, 'status', ${row}.status${kind === 'bookmark' ? `, 'url', ${row}.url` : ''})`;
            db.exec(`
                CREATE TRIGGER ${table}_sync_insert AFTER INSERT ON ${table} BEGIN
                    UPDATE collections SET initializedAt = COALESCE(initializedAt, strftime('%s', 'now')), updatedAt = strftime('%s', 'now')
                        WHERE id = NEW.collectionId AND ${kind === 'bookmark' ? '1' : 'NEW.rootKind IS NULL'};
                    INSERT INTO sync_changes(userId, collectionId, masterId, itemType, action, itemJson)
                    VALUES (NEW.userId, NEW.collectionId, NEW.masterId, '${kind}',
                        CASE WHEN NEW.status = 'active' THEN 'upsert' ELSE 'delete' END, ${json('NEW')});
                END;
                CREATE TRIGGER ${table}_sync_update AFTER UPDATE ON ${table} BEGIN
                    UPDATE collections SET updatedAt = strftime('%s', 'now') WHERE id = NEW.collectionId;
                    INSERT INTO sync_changes(userId, collectionId, masterId, itemType, action, itemJson)
                    SELECT OLD.userId, OLD.collectionId, OLD.masterId, '${kind}', 'delete', ${json('OLD')}
                    WHERE OLD.collectionId IS NOT NEW.collectionId;
                    INSERT INTO sync_changes(userId, collectionId, masterId, itemType, action, itemJson)
                    VALUES (NEW.userId, NEW.collectionId, NEW.masterId, '${kind}',
                        CASE WHEN NEW.status = 'active' THEN 'upsert' ELSE 'delete' END, ${json('NEW')});
                END;
                CREATE TRIGGER ${table}_sync_delete AFTER DELETE ON ${table} BEGIN
                    INSERT INTO sync_changes(userId, collectionId, masterId, itemType, action, itemJson)
                    VALUES (OLD.userId, OLD.collectionId, OLD.masterId, '${kind}', 'delete', ${json('OLD')});
                END;
                INSERT INTO sync_changes(userId, collectionId, masterId, itemType, action, itemJson)
                SELECT userId, collectionId, masterId, '${kind}',
                    CASE WHEN status = 'active' THEN 'upsert' ELSE 'delete' END, ${json(table)} FROM ${table};
            `);
        }
    })();
}
