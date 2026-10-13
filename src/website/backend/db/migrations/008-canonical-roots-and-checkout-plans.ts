import type Database from 'better-sqlite3';

export function up(database: Database.Database): void {
    database.transaction(() => {
        if (!(database.prepare('PRAGMA table_info(paypal_checkouts)').all() as any[]).some(column => column.name === 'providerPlanId')) {
            database.exec('ALTER TABLE paypal_checkouts ADD COLUMN providerPlanId TEXT');
        }
        const duplicates = database.prepare(`SELECT userId, collectionId, rootKind FROM folders
            WHERE rootKind IS NOT NULL AND collectionId IS NOT NULL AND status = 'active'
            GROUP BY userId, collectionId, rootKind HAVING COUNT(*) > 1`).all() as any[];
        for (const group of duplicates) {
            const roots = database.prepare(`SELECT masterId FROM folders WHERE userId = ? AND collectionId = ?
                AND rootKind = ? AND status = 'active' ORDER BY browserInstanceId IS NOT NULL, createdAt, masterId`)
                .all(group.userId, group.collectionId, group.rootKind) as any[];
            const canonicalId = roots[0].masterId;
            for (const duplicate of roots.slice(1)) {
                // Move every child to the canonical role before retiring the duplicate root.
                // Journal triggers deliver these parent changes to existing browser profiles.
                for (const table of ['folders', 'bookmarks']) database.prepare(`UPDATE ${table}
                    SET masterParentId = ?, updatedAt = strftime('%s', 'now')
                    WHERE userId = ? AND collectionId = ? AND masterParentId = ?`)
                    .run(canonicalId, group.userId, group.collectionId, duplicate.masterId);
                database.prepare("UPDATE folders SET status = 'deleted', updatedAt = strftime('%s', 'now') WHERE masterId = ? AND userId = ?")
                    .run(duplicate.masterId, group.userId);
            }
        }
        database.exec(`CREATE UNIQUE INDEX IF NOT EXISTS unique_active_root_role ON folders(userId, collectionId, rootKind)
            WHERE rootKind IS NOT NULL AND status = 'active'`);
    })();
}
