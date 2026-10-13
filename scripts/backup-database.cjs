const path = require('node:path');
const fs = require('node:fs');
const Database = require('../src/website/node_modules/better-sqlite3');
const root = path.resolve(__dirname, '..');
const source = process.env.DATABASE_PATH || path.join(root, 'src/website/data/bookmarx.db');
(async () => {
    if (process.argv[2] === '--verify') {
        const file = path.resolve(process.argv[3] || '');
        const backup = new Database(file, { readonly: true, fileMustExist: true });
        if (backup.pragma('integrity_check', { simple: true }) !== 'ok' || backup.pragma('foreign_key_check').length) throw new Error('Backup integrity check failed');
        backup.close(); console.log('Backup verified'); return;
    }
    const folder = path.join(root, '.backups');
    fs.mkdirSync(folder, { recursive: true });
    const target = path.join(folder, `bookmarx-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
    const db = new Database(source, { readonly: true, fileMustExist: true });
    await db.backup(target);
    db.close();
    const verification = new Database(target, { readonly: true });
    if (verification.pragma('integrity_check', { simple: true }) !== 'ok' || verification.pragma('foreign_key_check').length) throw new Error('Backup integrity check failed');
    verification.close(); console.log(target);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
