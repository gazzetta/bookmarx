# BookMarx — Testing Regime

> Single source of truth for what gets tested, how, and by whom (automation vs. you, the human watching this session). When a test moves from manual → automated, update this doc in the same commit.

## 1. Product understanding (so tests model real users)

### What BookMarx is
A cross-browser bookmark synchronizer. The user installs a browser extension in each of their browsers (Chrome at work, Brave at home, maybe Edge on a second work laptop, Firefox on their personal machine). All browsers sync through a single hosted master collection on the BookMarx server. Free tier: 250 bookmarks, 2 browsers, 1 collection. Premium: 10k/100/50, plus a web drag/drop collection editor, session history with rollback, and multiple collections.

### Who uses it and how
- **Work+home, same browser family** — Alice installs in Chrome at the office and Chrome at home. Both register against the same account; master collection arbitrates.
- **Mixed browsers across devices** — Bob uses Brave at home, Edge at work. Root folder IDs differ between browsers (`toolbar_____` vs `1`); the extension has detect + map logic (`SyncManager.ts:1187-1228`) that's easy to break and impossible to assert against without a real browser.
- **Heavy bookmark user w/ tidy habits** — Carol uses the web editor's drag/drop to reorganise from her laptop, then expects her desktop browsers to pick up the new order on next "Sync Down".
- **Casual user who lives in the popup** — Dave adds bookmarks via the native star button, opens the popup, hits "Sync Up". Doesn't know what the master-collection page is.
- **Premium user who rolls back mistakes** — Eve deletes a folder by accident, opens `/sessions/[id]` on the website, hits Rollback, expects the bookmarks to come back on every browser on next sync.

### The four risk surfaces, in priority order
1. **Cross-device sync correctness** — a user's worst moment is when one device silently overwrites or loses another's edits. Highest impact, most complex code path (masterId matrix + browser root-id mapping + change queueing + soft-delete). Already partially covered by Vitest.
2. **Browser interaction edge cases** — `chrome.bookmarks.onCreated/onMoved/onChanged/onRemoved` listeners, debouncing, queue suppression during server-driven writes (`BookmarkManager.ts:30,61,82,139`). A bug here either re-syncs the same change forever or silently drops user edits.
3. **Premium gating** — visible to users at the upgrade decision moment; a regression here is embarrassing. Mostly cheap to assert.
4. **Web editor mutations** — drag/drop reordering, batched `applyChanges` POST, partial-update semantics on the server. A regression can delete bookmarks if a `move` change carries a wrong `newParentId`.

## 2. Test architecture

| Layer | What | Tool | Status |
|---|---|---|---|
| **L1 — API contract** | HTTP endpoints, sync convergence, premium limits, no orphan rows | Vitest + supertest (no browser) | ✅ 37 tests in `tests/` (passes 2026-06-26) |
| **L2 — Website E2E** | Real Next.js UI in a real browser, hitting the real API | Playwright (one Chromium instance) | ✅ 25/25 green (including premium paths with `BOOKMARX_PREMIUM_PASSWORD`) |
| **L3 — Extension in one browser** | Real built extension loaded via `--load-extension`, popup + master-collection page + background scripts driven by Playwright | Playwright `chromium.launchPersistentContext({ args: [`--load-extension=…`, `--disable-extensions-except=…`] })` | ✅ 23/23 green |
| **L4 — Real multi-browser sync** | Two physical browser installs, true cross-device sync semantics | Human-in-the-loop with the agent-browser skill for automation of single-browser steps | ⬜ runbook below |
| **L5 — Edge cases & release gate** | API down, JWT expired, 100+ bookmark tree, unicode, concurrent writes | Mixed | partial (L1 covers some) |

### What CAN'T be automated (and why) — manual-only list
| Manual-only item | Why |
|---|---|
| Firefox extension load + first sync | Playwright can launch Firefox with `--load-extension` but Firefox doesn't accept Chromium-style `--load-extension`; `web-ext run` works but Playwright can't drive the resulting tab. Needs a real human with Firefox open. |
| Chrome ↔ Firefox root-folder-id mapping | Needs Firefox. The extension's `SyncManager.ts:1215-1228` map (`toolbar_____` → `1`) is the bug-prone bit. |
| Native browser "star button" add-bookmark | Playwright's Chrome can't trigger the native star button (it's a toolbar control outside page DOM). Must be human-clicked. |
| Google OAuth (`chrome.identity.launchWebAuthFlow`) | Requires real Google sign-in; Playwright can't bypass consent. Human-only. |
| `chrome.notifications` shown across browsers | Notifications fired from a service worker can be observed in Playwright via `chrome.notifications.getAll`, but cross-browser notification correctness (one browser seeing another's changes) needs two real browsers. |
| **PayPal Advanced Payments checkout end-to-end** | Currently mid-migration (was Polar). Need real PayPal sandbox + test buyer account on a real browser. Deferred until PayPal is wired — see HUMAN ACTION 10. |
| `beforeunload` / `chrome.storage` persistence across physical browser restarts | Need to kill and relaunch real browser processes. |

### What the human is for, in this session
Wait for the agent's call. When called, the agent will tell you exactly:
- which browser to open,
- which URL or extension page to navigate to,
- which single button to click / star / drag,
- what to look for (a notification, a row in a list, etc.)

You'll then report back: pass / fail / observed-value. The agent takes it from there.

## 3. L1 — Vitest API suite (DONE — context)

Already shipped: `tests/api/{auth,sync,capture,sync-convergence}.test.ts`, 37 tests green. Covers register/login/me/forgot-password, initial sync, delta sync CREATE/UPDATE/MOVE/DELETE by masterId, cross-user isolation, capture endpoint, cross-device convergence invariants (no orphan masterParentId, no duplicate masterId, no leaked soft-deleted rows), premium browser-limit, COALESCE partial-update semantics, concurrent CREATE bursts from 4 devices.

Run: `npm test` from repo root. Re-builds `better-sqlite3` after Node upgrades via `./run-tests.ps1`.

Known gaps that L1 alone doesn't cover and that L2/L3/L4 must:
- The website's UI rendering / drag-drop interactions / client-side auth state.
- The extension's `chrome.bookmarks.onCreated` queueing + debouncing.
- `chrome.notifications` and `chrome.alarms` behaviour.
- Native browser bookmark tree idiosyncrasies (`toolbar_____`, `1`, etc.).

## 4. L2 — Website Playwright E2E (scaffold in this commit)

### Goal
Drive the real Next.js app in a real Chromium instance against the running API server. Catches: routing, auth gating, premium gating, drag/drop interaction, batched commit behaviour, session rollback, browsers page, subscription page.

### Setup (one-time)
```powershell
cd C:\CODING\bookmarx
npm install -D @playwright/test
npx playwright install chromium
```

### Pre-flight per run
1. Start API + website in one block in Wave: `wsh run -m -- pwsh -Command "cd src/website; npm run dev"`
2. Wait for `Unified BookMarx app running on http://localhost:3005` in logs.
3. Run tests: `npx playwright test --config=playwright.website.config.ts`

### Test matrix (what the spec covers)
| Spec file | What it asserts | Can-automate? |
|---|---|---|
| `tests/website/landing.spec.ts` | `/` loads, nav buttons work, pricing table renders from `/api/v1/config`, theme toggle persists | ✅ fully |
| `tests/website/auth.spec.ts` | Register → /dashboard; login bad password → 401 toast; logout → /login; forgot-password success path (no email since `RESEND_API_KEY` unset) | ✅ fully |
| `tests/website/dashboard.spec.ts` | Free user sees upgrade banner; premium user (`qa@bookmarx.cc`) doesn't; usage bars render; quick-action tiles route correctly | ✅ fully |
| `tests/website/collections-view.spec.ts` | `/collections` list, `/collections/default` tree expand/collapse, search filters by title+URL, premium-only "Modify Collection" button appears for premium users | ✅ fully |
| `tests/website/collections-editor.spec.ts` | Drag/drop reorder via `@dnd-kit` (pointer events), batched pending changes count, "Commit" POSTs to `/api/v1/collections/:id/changes`, "Discard" reverts, free user redirected to view-only | ✅ fully |
| `tests/website/sessions.spec.ts` | Free user → /dashboard; premium user sees list, drills into detail, hits Rollback and asserts items disappear from `/collections/default` | ✅ fully (premium test uses `qa@bookmarx.cc`) |
| `tests/website/subscription.spec.ts` | ⚠️ **DEFERRED** — see HUMAN ACTION 10. The code currently wires `/api/v1/checkout/create` to Polar, but the codebase is migrating to **PayPal Advanced Payments**. Building the spec now would write tests against code that's about to be replaced. Skip the subscription spec until PayPal wiring lands; the manual action item below is the gate. | — (deferred) |
| `tests/website/browsers.spec.ts` | Lists registered browsers, rename via PATCH, disconnect via DELETE with confirm dialog, slot count and upgrade prompt near free tier limit | ✅ fully |
| `tests/website/auth-gating.spec.ts` | Each protected route redirects to `/login` when token absent from localStorage | ✅ fully |

### Subtleties the harness has to handle
- **Auth state:** persisted in `localStorage` (per `auth-context.tsx`). Tests do `page.addInitScript` to seed `localStorage` with a real JWT minted via `POST /api/v1/auth/login` (test fixture uses premium account `qa@bookmarx.cc` — known password). For free-tier tests, register a fresh user.
- **Server config:** `qa@bookmarx.cc` is in the `ALWAYS_PREMIUM_EMAILS` allowlist in `backend/api/auth.ts:39`. The test account's *password* must be known; if not known the agent will ask you once.
- **Test account strategy (per user decision):**
  - **Premium paths:** harness logs in as `qa@bookmarx.cc`.
  - **Free paths:** harness registers a brand-new free user per spec file (e.g. `free-l2-{pid}-{ts}-{n}@bookmarx.test`), seeds `localStorage` with the resulting JWT, and cleans up whatever that user created via DELETE endpoints in `afterAll`. No hardcoded free-tier credentials.
- **Test DB isolation (per user decision):** L2 runs against the real dev DB (`src/website/data/bookmarx.db`, with the user's 435-bookmark master). **Per-test cleanup is mandatory** — every spec file's `test.afterAll` destroys any collections / browsers / bookmarks it creates. The harness fixture tracks IDs to clean up (in a `try/finally`) so even a partial test failure doesn't leak. NEVER let a test mutate `qa@bookmarx.cc`'s default collection — premium tests that need a scratch collection create one via `POST /api/v1/collections` and delete it in `afterAll`.
- **Drag/drop with `@dnd-kit`:** Pointer events, not HTML5 DnD. Need `page.mouse.move/down/up` not `page.dragAndDrop`. Sensible pattern:
  ```ts
  const handle = page.locator('[data-sortable-id="X"]');
  const target = page.locator('[data-sortable-id="Y"]');
  await handle.hover(); await page.mouse.down();
  await target.hover(); await page.mouse.move(...); await page.mouse.up();
  ```
- **Reset DB per test file:** Per the user's decision, L2 tests run **against the real dev DB** (`src/website/data/bookmarx.db`, with the user's 435-bookmark master collection). No `DATABASE_PATH` override. **Per-test cleanup is mandatory** — every spec file's `test.afterAll` destroys any collections / browsers / bookmarks it created via the DELETE endpoints. A test failure MUST NOT leave pollution. The harness fixture (`tests/website/_fixtures.ts`) will track IDs to clean up and run cleanup in a `finally` block so even zombie processes are tidied on the next run.
- **Web editor commit cycle:** `applyChanges` is destructive. Tests use a throwaway premium-user-created collection to avoid mutating the long-lived `qa@bookmarx.cc` default.

## 5. L3 — Playwright `--load-extension` (Chrome only) (scaffold in this commit)

### Goal
Load the **real built extension** (`src/extension/dist`) into a real Chromium instance, drive the popup and master-collection page, exercise the background scripts' queueing + change-notification behaviour. This is the only layer that catches the actual extension code.

### Pre-flight per run
1. Build extension: `pwsh -Command "cd src/extension; npm run build:chrome"`
2. Start API: `wsh run -m -- pwsh -Command "cd src/website; npm run dev"`
3. Verify dist exists: `Test-Path src/extension/dist/manifest.json`
4. Run: `npx playwright test --config=playwright.extension.config.ts`

### Chrome-only limitation (and why that's fine)
Playwright's `chromium.launchPersistentContext` + `--load-extension` works only on Chromium-family browsers (Chrome, Brave, Edge, Opera, Vivaldi). It does NOT work on Firefox. So all extension-automation tests run in Chromium. **Brave/Edge/Firefox variations fall to L4 (human).**

### Test matrix
| Spec file | What it asserts | Notes |
|---|---|---|
| `tests/extension/install.spec.ts` | Service worker boots without console errors; `chrome.alarms.create('sync-status-check')` registered after install; default `deviceId` + `browserInstanceId` persisted to `chrome.storage.local` | Uses CDP to ping the SW. |
| `tests/extension/popup-auth.spec.ts` | Popup opens at logged-out state; email login against dev API succeeds; popup shows tier badge; logout clears `chrome.storage.local.auth` | Drives popup via `chrome.action.openPopup()` polyfill through CDP. |
| `tests/extension/initial-sync.spec.ts` | Logged-in user with empty dev master-collection hits "Sync Up"; SyncConfirmDialog appears; on confirm, POST `/api/v1/sync/initial` fires; bookmarks round-trip to server; master-collection page shows them | Premium account (`qa@bookmarx.cc`) used so no free-tier limits. |
| `tests/extension/onboarding.spec.ts` | Pre-conditions: master has bookmarks but local bookmark bar is empty → popup shows `OnboardingDialog` with counts; click "Overwrite Local" → `overwriteFromMaster` message → local bookmarks match master | Two-stage: pre-seed master via API然后用 `--load-extension` |
| `tests/extension/pending-changes.spec.ts` | Star a bookmark during automation wait… wait, can't trigger star. So instead: programmatically call `chrome.bookmarks.create({parentId:'1', title:'T', url:'https://x'})` via CDP `Runtime.evaluate`; assert `chrome.storage.local` queues a CREATE change; open popup; see pending-up count bumped | This is how we work around the "no star button" limit. |
| `tests/extension/notifications.spec.ts` | Pre-seed another browser's pending change via API; wait 31s for `chrome.alarms` half-minute cycle; assert `chrome.notifications.getAll()` returns a `bookmarx-remote-pending` notification | Alarm interval is currently 0.5 min (QA value — `background/index.ts:13-15`) |
| `tests/extension/master-collection-page.spec.ts` | `chrome.tabs.create({url: chrome.runtime.getURL('pages/master-collection.html')})` via CDP; tree renders; premium "Edit in Web" link is present and points at `${WEBSITE_BASE_URL}/collections/default/edit` | Assertable programmatically |
| `tests/extension/collection-switch.spec.ts` | With pending local changes, switch collection → SwitchConfirmDialog appears with `localChanges` count; click "Sync" → triggerSync; click "Discard" → switch proceeds, queue cleared | Two pre-existing collections needed (premium account). |

## 6. L4 — Multi-browser cross-sync (HUMAN RUNBOOK)

This is where the human comes in. The agent-browser skill will be used wherever a single-browser step can be automated, but the things that need two physical browsers (Firefox, Brave, Edge) require you.

### Required setup (one-time, before L4 begins)
1. `cd src/extension; npm run build:chrome; npm run build:firefox` — produces `dist/` (Chrome) and `dist-firefox/` (Firefox).
2. `cd src/website; npm run dev` — running on `http://localhost:3005` (unified API + website).
3. Browser installs ready:
   - Chrome (or Brave): `chrome://extensions` → Developer mode → Load unpacked → `src/extension/dist`
   - Firefox: `about:debugging` → This Firefox → Load temporary Add-on → pick `src/extension/dist-firefox/manifest.json`
4. Sign in to the extension in **both** browsers using `qa@bookmarx.cc` (premium) so we don't hit free-tier browser caps.

### HUMAN ACTION 1 — Initial sync sanity (Chrome + Firefox)
- [ ] **Chrome:** open popup, hit Sync Up, click confirm in the SyncConfirmDialog.
- [ ] **Firefox:** fav the page `https://example.com/firefox-test` in the Bookmarks Toolbar.
- [ ] **Firefox:** popup Sync Up.
- [ ] **Chrome:** popup Sync Down.
- [ ] **Report:** did `https://example.com/firefox-test` appear in Chrome's Bookmarks Toolbar? If not, capture the popup's error and the server logs around that time.

### HUMAN ACTION 2 — Native star-button add (Chrome)
- [ ] In Chrome, navigate to `https://news.ycombinator.com`.
- [ ] Click the native star (★) in the toolbar, save into Bookmarks Bar.
- [ ] **Watch:** open popup. Within ~500ms the "pending up count" must increment by 1. If it doesn't, the `BookmarkManager.handleBookmarkCreated` queueing is broken.
- [ ] Hit Sync Up → SyncConfirmDialog → confirm.
- [ ] **Report:** master-collection page (`View Collection` in popup) — is the HN bookmark there?
- [ ] In Firefox, hit Sync Down.
- [ ] **Report:** does HN now show in Firefox's Bookmarks Toolbar?

### HUMAN ACTION 3 — Cross-device MOVE (the masterId contract)
- [ ] **Chrome:** drag a bookmark from one folder to another using the browser's native bookmark manager (`chrome://bookmarks`).
- [ ] **Chrome:** popup Sync Up (the BookmarkManager should have queued a MOVE).
- [ ] **Firefox:** popup Sync Down.
- [ ] **Report:** is the bookmark in Firefox in the same folder as in Chrome? If it stayed in the old folder, the masterId MOVE refactor regressed (this is exactly what `tests/api/sync-convergence.test.ts` catches in-process — if it passes there but fails here, the bug is in extension's network/payload layer, not the server).

### HUMAN ACTION 4 — Cross-device DELETE
- [ ] **Firefox:** delete a bookmark from the Bookmarks Toolbar (right-click → Delete).
- [ ] **Firefox:** popup Sync Up.
- [ ] **Chrome:** popup Sync Down.
- [ ] **Report:** is the bookmark gone from Chrome's toolbar AND from the master-collection page?

### HUMAN ACTION 5 — Notifications
- [ ] **Chrome:** dismiss all existing Chrome notifications from BookMarx.
- [ ] **Firefox:** add a new bookmark, Sync Up.
- [ ] **Chrome:** do NOT manually sync. Wait 30-60 seconds.
- [ ] **Report:** does a Chrome notification titled "BookMarx: Collection updated" appear? If not, the `chrome.alarms` half-minute cycle isn't running, or `chrome.notifications` permission isn't granted (check `chrome://extensions` → BookMarx → details → permissions).

### HUMAN ACTION 6 — Web editor propagates to extension (premium)
- [ ] In a regular browser tab (not the extension), open `http://localhost:3005/collections/default/edit`.
- [ ] Sign in as `qa@bookmarx.cc`.
- [ ] Drag a bookmark from "Bookmarks Bar" to the "Other Bookmarks" folder.
- [ ] Click "Commit changes".
- [ ] **Chrome extension:** popup Sync Down.
- [ ] **Report:** did the bookmark actually move in Chrome's bookmark tree (visible at `chrome://bookmarks`)?

### HUMAN ACTION 7 — Session rollback (premium)
- [ ] On the website, open `/sessions`.
- [ ] Pick the most recent "Initial Sync" entry → click → "Rollback".
- [ ] **Report:** confirm dialog appears; on confirm, server returns `rolledBackCount`.
- [ ] **Chrome extension:** popup Sync Down.
- [ ] **Report:** did the rolled-back items disappear from Chrome?

### HUMAN ACTION 8 — Free-tier browser cap
- [ ] Create a fresh free account via the extension sign-up flow.
- [ ] Install the extension in 2 browsers (e.g. Chrome + Brave), login as free user, complete initial sync in both.
- [ ] Install the extension in a 3rd browser (Edge), login, attempt Sync Up.
- [ ] **Report:** does the popup show a `BROWSER_LIMIT_REACHED` error toast with an upgrade link? Click it and report whether it opens `http://localhost:3005/upgrade` (config-driven via `WEBSITE_BASE_URL` — previously hard-coded, now fixed).

### HUMAN ACTION 9 — Google OAuth (manual only)
- [ ] In Chrome extension popup, click "Continue with Google".
- [ ] Complete Google consent.
- [ ] **Report:** popup shows authenticated state with tier badge. Note: the survey flagged two different OAuth2 client_ids (one in `manifest.json:15`, one in `background/index.ts:167`) — if flow fails with audience mismatch, this is probably why.

### HUMAN ACTION 10 — PayPal migration (BLOCKING — do this before testing subscription)
**User signalled mid-plan: the codebase is migrating from Polar to PayPal Advanced Payments.** See `docs/PAYPAL-MIGRATION-PLAN.md` for the full migration plan. Steps before subscription tests can be written or run:
- [ ] Land the PayPal checkout backend (`/api/v1/checkout/create` switches its provider from Polar to PayPal).
- [ ] Replace the Polar webhook handler if appropriate (`src/website/backend/api/webhooks/polar.ts`).
- [ ] Update `src/website/app/settings/subscription/page.tsx:22` to call the new provider.
- [ ] Wire PayPal sandbox credentials into `.env.local` (or wherever the new handler reads them).
- [ ] Tell the agent "PayPal is wired" so the agent can scaffold `tests/website/subscription.spec.ts` against the new shape.
- [ ] Once wired, the manual end-to-end purchase step needs a PayPal sandbox buyer account; we'll do it together when the time comes.

## 7. L5 — Edge cases & release gate

### Automatable via L1/L2/L3 where noted
| Case | Where |
|---|---|
| Tampered/expired JWT returns 401 from API | L1 (`tests/api/auth.test.ts` 已 covered) |
| Website redirects to `/login` on 401 | L2 (`tests/website/auth-gating.spec.ts`) |
| Extension popup re-shows login form on 401 | L3 (`tests/extension/popup-auth.spec.ts`) |
| Special characters in bookmark title/url (`<>&'"!@#`, `café 日本語 🎉`) | L1 (`tests/api/edge-cases.test.ts` — unicode, XSS, quotes, whitespace) |
| Concurrent sync doesn't lose writes | L1 (`sync-convergence.test.ts` "4-device concurrent CREATE" test) |
| Concurrent UPDATE to same bookmark from 2 devices | L1 (`tests/api/edge-cases.test.ts` — last-write-wins) |
| Large tree (100+ bookmarks) renders without freezing | L1 (`tests/api/edge-cases.test.ts` — 200+ bookmark round-trip) + L2 (collections-view spec with seeded fixtures) |
| Empty/whitespace title, very long URL/title | L1 (`tests/api/edge-cases.test.ts`) |
| JWT rejection variants (expired, malformed, empty) | L1 (`tests/api/edge-cases.test.ts`) |
| API-down behaviour | **Manual** — needs human to `Ctrl-C` the dev server mid-test and observe popup/website; cannot script stopping the server inside a test |

### Release gate checklist (the FINAL call, the agent will reconcile this)
- [ ] L1: `npm test` reports 50/50 (or whatever the current count is when you run it)
- [ ] L2: `npx playwright test --config=playwright.website.config.ts` all green
- [ ] L3: `npx playwright test --config=playwright.extension.config.ts` all green
- [ ] L4: all 10 HUMAN ACTION items above marked PASS by you
- [ ] No new console errors in any browser's devtools across L3+L4
- [ ] Database file size reasonable (no test pollution left from L2)
- [ ] `git status` shows only intentional modifications after the run

## 8. Orchestration: who does what in this session

### Agent (opencode) will do, without needing you:
1. Scaffold the `playwright.website.config.ts` + `playwright.extension.config.ts` + spec files (this commit, after you OK the plan).
2. Run L1 suite (`npm test`) and any L2/L3 specs that don't require external services.
3. Run the agent-browser skill for any single-browser automation that's awkward to express in Playwright (e.g. point-in-time screenshots, form-fills on the eventual PayPal sandbox once you give it credentials).
4. Tally results and update this doc.

### Agent will call you (with a precise instruction) when:
- L4 HUMAN ACTIONs 1–10 above are next in sequence.
- A test reports a problem and we need your eyes on the browser / on a notification.
- We need a Google account / (eventually) PayPal sandbox account.
- A test fails in a way that suggests a real production bug and we need to confirm reproduction in your dev server before fixing.

### The call format you'll see
```
>>> HUMAN ACTION 3 — Cross-device MOVE (the masterId contract)
>>> In Chrome, drag a bookmark from "Bookmarks Bar/Dev" to "Other Bookmarks" using chrome://bookmarks.
>>> Open the BookMarx popup and click "Sync Up".
>>> In Firefox, open the popup and click "Sync Down".
>>> REPORT BACK: did the bookmark appear in Firefox's "Other Bookmarks" after Sync Down? (yes / no / error text)
```
Reply with the report. The agent takes it from there.

---

## Appendix A — Environment we are running in (so you know)

- Working dir: `C:\CODING\bookmarx`
- Terminal: Wave (`https://docs.waveterm.dev/`) — the agent uses `wsh run -m --` to put servers in magnified blocks so you can watch their output alongside test output.
- Already-shipped test infra: `tests/` (Vitest, 37 green), `tests/README.md`, `run-tests.ps1`. See that README for the bugs already found+fixed by L1.
- Pre-existing manual QA baseline: `docs/MANUAL-QA-CHECKLIST.md` (still has many "manual" items unchecked — they fold into L4 above).

## Appendix B — Known issues the regime has to actively guard against (from the explore sweep)

These came out of the extension/website surveys. The test specs above already account for them; flagged here so reviewers understand why we test certain things:

1. **Two different Google OAuth2 client_ids** — `manifest.json:15` ≠ `background/index.ts:167`. If L4 ACTION 9 fails, suspect this.
2. **Hard-coded upgrade URL** ~~`https://www.bookmarx.cc/upgrade`~~ — **FIXED**: now uses `${WEBSITE_BASE_URL}/upgrade` from `config.ts` in both `popup/index.ts` and `SyncManager.ts`. L4 ACTION 8 will verify the fix.
3. **Alarm interval is 0.5 min (QA temp)** — comment at `background/index.ts:13-15` says revert to 5 min after testing. Don't remove the comment; the L3 notifications spec assumes 30s to keep tests fast.
4. **`utils/extensionApi.ts` polyfill wrapper unused** — every other file calls `chrome.*` directly. Not a test problem but flag for the human in case any L4 Firefox-only behaviour breaks and we're left wondering where to wire it.
5. **`getGoogleAccessToken` is dead code** in `popup/index.ts:1205-1215`. Don't write a test against it — the actual Google flow goes through the background `googleLogin` message handler.
6. **No beforeunload handler in web editor** — `MANUAL-QA-CHECKLIST.md:191` already notes this; L2 `collections-editor.spec.ts` will assert navigation-away is silent (i.e. NOT a manual warning) to pin this as designed behaviour, not a regression.