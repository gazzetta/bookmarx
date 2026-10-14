// tests/setup.ts
//
// MUST be the first import in every test file. It installs a deterministic,
// isolated environment for the BookMarx API before any application module
// (server.ts → DatabaseService singleton) gets evaluated.
//
// Why this matters:
//   - `DatabaseService` is a process-wide singleton (`DatabaseService.getInstance()`)
//     constructed lazily on first import. It reads `process.env.DATABASE_PATH`
//     *at construction time*. If we run multiple test files in one process
//     (isolate:true resets the module registry between files, forcing
//     re-construction), each file gets a brand-new temp DB file. If two files
//     *did* share a path, foreign-key fixtures would leak between them.
//   - `JWT_SECRET` must be a fixed test value so `json web token` verification
//     works without depending on the developer's real `.env.local`.
//   - We explicitly clear `RESEND_API_KEY` so dotenv cannot fill it from a
//     developer configuration and the unit/API suite never sends real mail.
//
// Do not import anything app-side here; only Node built-ins.

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

function ensureTestEnv(): void {
  // A fresh SQLite file per test-worker process. Using pid + timestamp + rand
  // guarantees uniqueness even when isolate:true re-runs setup within one
  // process across multiple files (the registry reset re-imports this file).
  if (!process.env.DATABASE_PATH) {
    const dbDir = path.join(os.tmpdir(), 'bookmarx-tests');
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    const unique = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    process.env.DATABASE_PATH = path.join(dbDir, `test-${unique}.db`);
  }

  // Fixed, well-known secret so tests can mint tokens if they ever need to,
  // and the server's `authenticate` middleware verifies them correctly.
  // dotenv (loaded inside server.ts) only fills *missing* vars, so this wins
  // over a developer's .env.local.
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'bookmarx-test-secret-do-not-use-in-prod';
  process.env.TOKEN_EXPIRY = process.env.TOKEN_EXPIRY || '1h';

  // Force "development" semantics:authenticate's X-Test-User-Id bypass path
  // (auth.ts:32) is gated on NODE_ENV !== 'production'; keep it usable.
  process.env.NODE_ENV = process.env.NODE_ENV || 'development';

  // Defensive: never hit Polar/Resend/Google network paths during the suite.
  if (!('POLAR_ACCESS_TOKEN' in process.env)) process.env.POLAR_ACCESS_TOKEN = '';
  if (!('GOOGLE_CLIENT_ID' in process.env)) process.env.GOOGLE_CLIENT_ID = '';
  process.env.RESEND_API_KEY = '';
}

ensureTestEnv();
