import type Database from 'better-sqlite3';

export function up(database: Database.Database): void {
    database.transaction(() => {
        database.exec(`CREATE TABLE IF NOT EXISTS sync_applied_items (
            userId TEXT NOT NULL, collectionId TEXT NOT NULL, browserInstanceId TEXT NOT NULL,
            masterId TEXT NOT NULL, revision INTEGER NOT NULL,
            PRIMARY KEY (userId, collectionId, browserInstanceId, masterId)
        )`);
        // Existing successful snapshot receipts prove the sender knows these original items.
        // Only mark the FIRST revision: later peer/website changes must still be delivered.
        database.exec(`INSERT OR IGNORE INTO sync_applied_items
            SELECT r.userId, r.collectionId, b.browserInstanceId,
                json_extract(item.value, '$.masterId'), MIN(c.revision)
            FROM mutation_receipts r
            JOIN browsers b ON b.userId = r.userId
                AND substr(r.operationId, 1, length(b.browserInstanceId) + 10) = 'snapshot:' || b.browserInstanceId || ':'
            JOIN json_each(r.resultJson, '$.processed') item
            JOIN sync_changes c ON c.userId = r.userId AND c.collectionId = r.collectionId
                AND c.masterId = json_extract(item.value, '$.masterId')
            GROUP BY r.userId, r.collectionId, b.browserInstanceId, c.masterId`);
    })();
}
