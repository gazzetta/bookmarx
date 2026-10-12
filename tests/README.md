# BookMarx test harness

Top-level Vitest workspace for cross-component tests. Today only the API
backend suite is wired up; website E2E (Playwright), extension E2E, and mobile
(Maestro) suites will plug into the same tree as they get written.

## Layout

```
tests/
├── setup.ts        # ESM-time env pinning (DATABASE_PATH / JWT_SECRET). MUST be
│                   # the first import in every test file (helpers.ts does it).
├── helpers.ts      # HTTP client (supertest), registered-user factory,
│                   # device-info / sync-metadata / bookmark+folder factories,
│                   # and the bound Express `app`.
└── api/
    ├── auth.test.ts              # /health, /config, register/login/me, password reset
    ├── sync.test.ts              # initial sync, delta sync CREATE/DELETE, master-collection
    │                             # round-trip, cross-user isolation, premium browser-limit
    ├── capture.test.ts           # /api/v1/capture (mobile share sheet)
    └── sync-convergence.test.ts  # multi-device sync harness: initial-sync union,
                                  # cross-device UPDATE/MOVE/DELETE by masterId, partial
                                  # UPDATE field preservation, recursive folder DELETE,
                                  # converged-shape invariants (no orphans, no dup masterIds)
```

## How isolation works

Each test file runs in its own Vitest fork. `tests/setup.ts` sets
`process.env.DATABASE_PATH` to a unique temp SQLite file per worker, then the
`DatabaseService` singleton (constructed when helpers.ts imports
`backend/server.ts`) initializes against that file. Result: every test file
gets a **fresh, ephemeral SQLite database** that's destroyed when the fork
exits — no `npm run dev` data ever crosses in, tests don't pollute each other,
and we don't have to drop tables between cases.

The migration runner in `DatabaseService` adds columns asynchronously inside
its constructor; `helpers.ts` re-exports `dbReady` so each file's `beforeAll`
can `await dbReady` before issuing any request. Without that wait handlers
race against column add-ons (`browsers.currentCollectionId`, the
`password_reset_tokens` table) — observable only in tests because production
has Next.js's `nextApp.prepare()` as a long natural brake.

## Run

```powershell
# at repo root
npm install          # one-time, installs Vitest + supertest at the root tree
npm test             # whole suite
npm run test:api     # just tests/api
npm run test:watch   # watch mode
npm run test:ci      # JUnit report → test-results.junit.xml
npm run typecheck    # tsc -p tsconfig.test.json --noEmit
```

Tests resolve app dependencies (`better-sqlite3`, `express`, `helmet`,
`jsonwebtoken`, `resend`, ...) from `src/website/node_modules/`, *not* the
root tree — so you must have run `npm install` inside `src/website/` first.
The root `package.json` only adds the test runner (`vitest`) and the HTTP
client (`supertest`).

### Native module rebuild

If `better-sqlite3` was installed under a different Node major (e.g. you
upgraded Node), Vitest may refuse to load it with
`NODE_MODULE_VERSION ... This version of Node.js requires ...`. Fix:

```powershell
cd src/website
npm rebuild better-sqlite3
```

## Adding a new API test

1. Create `tests/api/<area>.test.ts`.
2. Import from `../helpers`:
   ```ts
   import { describe, it, expect, beforeAll } from 'vitest';
   import request from 'supertest';
   import { app, baseUrl, bearer, registerUser, dbReady } from '../helpers';
   beforeAll(async () => { await dbReady; });
   ```
3. Write tests with `request(app).post('/api/v1/...')` — `registerUser()`
   returns a real account + bearer token against the ephemeral DB.

## What this suite *already* caught (real bugs fixed while writing it)

These were all latent production bugs surfaced by the API suite during the
first wiring-up; each is fixed in `src/website`:

- **Migration runner dead-code (`db/migrations/001-add-master-ids.ts`)** — the
  file exported `runMigration()` but the runner in `database.ts` calls
  `migration.up(db)`, so it never ran AND it used `__dirname`, which throws
  "Not defined in ES module scope" the moment the file is loaded as ESM.
  Rewrote it to export `up(db)` and stop using `__dirname`.
- **ESM-unsafe migration loader (`backend/db/database.ts:runFileMigrations`)** —
  it called `require(path...)` to dynamically load migration files, which
  throws under native ESM (vitest, and any future `"type": "module"` flip in
  the website workspace). Switched to `await import(pathToFileURL(...).href)`.
- **Migration race (`DatabaseService`)** — the constructor calls
  `this.runFileMigrations()` (async) without awaiting, so the first
  in-flight requests can land before migrations 002-006 finish adding
  `browsers.currentCollectionId` / `password_reset_tokens` / etc. In dev this
  is masked by `nextApp.prepare()` being slow; the test harness has no
  `nextApp.prepare()` and immediately hit the bug. Exposed
  `DatabaseService.readyPromise` + `export const dbReady`, awaited in each
  test's `beforeAll`.
- **`/api/v1/capture` wrote bookmarks with `collectionId IS NULL`** —
  mobile-shared URLs were therefore invisible to the desktop extension's
  `/sync/master-collection` read (which filters `collectionId = ?`). Passing
  `collectionId = db.getDefaultCollection(userId)?.id ?? ensureDefaultCollection(userId)`
  so captures land in the user's default collection and round-trip back to
  the desktop client.

### Caught by the cross-device convergence harness (next slice)

- **`handleSync` MOVE branch dropped `userId`** —
  `db.moveBookmark`/`moveFolder` (database.ts:1937,1985) use
  `WHERE masterId = ? AND userId = ?`. The handler in `server.ts:200` was
  forwarding only `...data` (no userId), so the `userId` filter was
  `NULL IS ?`-shaped against the column and never matched. Effect: a
  **cross-device MOVE on someone else's bookmark silently no-oped**. Wrecked
  the core masterId contract (PROGRESS.md:71-73). Fix: forward `userId` from
  the authenticated `authUser.id` into every moveBookmark/moveFolder call.
- **`handleSync` DELETE branch dropped both `masterId` AND `userId`** —
  `db.deleteBookmark`/`deleteFolder` branch on `bookmark.masterId`:
  if set, use the masterId-keyed cross-device UPDATE; if not, fall back to
  `WHERE browserId = ? AND browserInstanceId = ?` (only the originating
  browser can delete its own rows that way). The handler forwarded only
  `id` + `metadata`, so the cross-device DELETE never worked — and since
  `metadata.deviceInfo.browserInstanceId` was the *deleter's*, the
  fallback path didn't match either, returning `ITEM_NOT_FOUND` from the
  DELETE branch (not even `db.deleteBookmark`). Wrecked the same
  masterId contract. Fix: forward `masterId` and `userId` from the
  request envelope into both delete calls. The existing recursive
  `masterParentId`-keyed child-soft-delete logic in `deleteFolder` then
  also worked for free.

## Next slices (not done — picked deliberately per ROI)

1. **Cross-device sync convergence harness** — N fake devices pushing
   `/api/v1/sync` in parallel, asserting the master-collection converges.
   Picks off the PROGRESS.md "Test backward compatibility with existing
   extension" checkbox.
2. **Website Playwright E2E** — the drag/drop collection editor + session
   rollback UI, which has zero coverage and is fragile.
3. **Extension E2E** — Playwright `--load-extension` for Chrome/Brave/Edge;
   `web-ext lint` and a build-smoke for Firefox.
4. **Mobile** — Jest + @testing-library/react-native unit tests for hooks,
   plus Maestro YAML flows on iOS/Android sim/emulators.