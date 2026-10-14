const path = require('node:path');
const fs = require('node:fs');
const Database = require('../src/website/node_modules/better-sqlite3');
const root = path.resolve(__dirname, '..');
const source = process.env.DATABASE_PATH || path.join(root, 'src/website/data/bookmarx.db');
const check = (file) => {
    const db = new Database(file, { readonly: true, fileMustExist: true });
    const ok = db.pragma('integrity_check', { simple: true }) === 'ok';
    const fkViolations = db.pragma('foreign_key_check').length;
    db.close();
    if (!ok) throw new Error('Backup integrity check failed');
    // FK violations reflect pre-existing data (e.g. salvaged rows), not a bad
    // backup — warn but do not fail the backup over them.
    if (fkViolations) console.warn(`warning: ${fkViolations} foreign key violations present in data`);
};
(async () => {
    if (process.argv[2] === '--verify') {
        check(path.resolve(process.argv[3] || ''));
        console.log('Backup verified'); return;
    }
    const folder = process.env.BOOKMARX_BACKUP_DIR || path.join(root, '.backups');
    fs.mkdirSync(folder, { recursive: true });
    const target = path.join(folder, `bookmarx-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
    const db = new Database(source, { readonly: true, fileMustExist: true });
    await db.backup(target);
    db.close();
    check(target);
    console.log(target);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
