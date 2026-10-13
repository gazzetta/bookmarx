# BookMarx launch audit — 13 October 2026

**Decision: do not launch paid subscriptions yet.** The existing tests pass many basic flows, but this audit reproduces failures affecting account isolation, bookmark integrity, hierarchy, recovery and payment fulfilment.

This is an audit of the current checkout on Windows, not certification of every browser/profile/OS combination or the deployed production service. Product code was left unchanged. Nothing was committed or deployed. The audit adds executable launch gates and evidence files so remediation can be checked objectively.

## Evidence and limits

| Check | Result |
| --- | --- |
| Existing Vitest API suite | 57/57 passed |
| Existing website E2E | 22 passed; 3 premium tests skipped because credentials were absent |
| Existing extension E2E | 22 passed; 6 premium tests skipped; 2 failed intermittently |
| Isolated repeat of the failing extension file | 3/3 passed; intermittent defects remain unresolved |
| New audit gates | **26 failed; 2 controls passed**, across 28 checks |
| Website production build | Passed API compilation and Next production build |
| Chrome and Firefox extension builds | Both passed; URLs still target localhost |
| Firefox `web-ext lint` | 0 errors, 12 warnings; see evidence file |
| Root typecheck | Passed after adding null guards to the two existing premium dashboard tests and supplying Chrome types to the new audit tests |
| Website production dependency audit | 12 vulnerable package entries: 2 critical, 4 high, 5 moderate, 1 low |

The API gates use real Express handlers and SQLite in disposable test databases. Extension gates use actual manager classes with deterministic browser API mocks and failure injection. They are intentionally assertions of desired behaviour, not tests which bless the bugs. Their failures are release blockers. They are excluded from the established default suite and run with `vitest.audit.config.ts`.

Two passing controls establish that normal authenticated master reads exclude another account's bookmarks, and the storage write chain retains overlapping queue writes. Neither control covers the legacy-update exploit or the in-flight push race below.

The first extension full run reproduced `Not authenticated. Please log in first.` in the two-peer flow and an unexpected failed sync in the browser-limit flow. The isolated repeat passed. These cannot be dismissed as fixed. Initial install has two paths which call `setDefaults()` and can reset auth/IDs; this is a plausible race to investigate, not a proven explanation of the observed failures.

A production build was initially run against the live dev server's shared `.next` directory. It caused missing-chunk errors in subsequent website probes. The dev server was restarted with fresh dev output, and those probes were rerun successfully. Missing-chunk errors from the first probe are not counted as product defects. Avoid simultaneous builds and development serving from the same output directory.

## Real Windows browser results

These used actual executables and disposable profiles, not spoofed user agents. Website coverage here means HTTP 200, hero rendered, and no page exceptions. Local CRUD means folder/bookmark create, rename, move and delete through the loaded extension worker. It does **not** mean complete cross-browser sync acceptance.

| Browser | Website smoke | Extension / local CRUD | Remaining verification |
| --- | --- | --- | --- |
| Bundled Chromium 149 | Pass | Pass | Full integrity gates fail independently of engine |
| Chrome 150 | Pass | No worker after command-line loading | Install through supported unpacked/store workflow; real extension acceptance remains open |
| Edge 155 | Pass | Pass | Signed distribution, multiple profiles, failure recovery, paid flows |
| Opera 136 | Pass | Pass | Eight native roots; delta sync mappings fail the Opera gate below |
| Helium, Chromium 141 | Pass | Pass | Actual UA lacks a Helium token; current detector labels it Chrome |
| Brave | Not run | Not run | Executable not found at configured locations; old Brave directories exist |
| Firefox | Not run | Build/lint only | Root mapping gate fails; actual install, auth, sync and notification checks remain open |
| Linux / macOS | Not run | Not run | Deliberately deferred until Windows integrity gates pass |

Raw results: [Windows browser probe](windows-browser-audit-results.json). Reusable probe: [windows-probe.cjs](../tests/audit/windows-probe.cjs). `BOOKMARX_BRAVE_EXE` can supply a real Brave path.

Opera's observed roots are `1 Bookmarks bar`, `2 Imported Bookmarks`, `7 Pinboard`, `6 Speed Dials`, `9 Bin`, `4 Unsorted bookmarks`, `8 Unsynchronized Pinboard`, `5 Other bookmarks`. An Opera UA on bundled Chromium provides none of this fidelity.

Modern Chrome also exposes `folderType`, `syncing`, and managed-node information; there can be multiple folders of the same native type. Hardcoded IDs and English titles are insufficient. [Chrome bookmark API documentation](https://developer.chrome.com/docs/extensions/reference/api/bookmarks).

## Reproduced release blockers

IDs correspond to the executable tests in [API audit](../tests/audit/api.audit.ts) and [extension audit](../tests/audit/extension.audit.ts).

### Account safety and billing

| Gate | Severity | Reproduction and observed result | Required change |
| --- | --- | --- | --- |
| A06 | Critical | Account B sends legacy UPDATE with account A's browser instance/item IDs. A's bookmark title changes to `Hijacked`. | Scope every mutation to authenticated user and selected collection. Prevent browser ownership reassignment in `registerBrowser`. Reject conflicting header/body IDs. |
| A05 | Critical, configuration dependent | With no `PAYPAL_WEBHOOK_ID`, an unsigned event with an unrecognised plan upgrades a disposable free account to premium. | Fail closed; verify events; validate known plans and settled payment facts; remove any development bypass from externally reachable routes. |
| E07 | High | Logout then login as another account retains the old queue, collection and identity map. | Partition sync state by account/collection and explicitly handle account transitions. Native bookmarks are shared within a browser profile; syncing them into a new account must require an intentional onboarding choice. |
| A07 | High | Three pending GETs register three browsers for a free account. | Enforce limits on every registration/read-bootstrap path; reads must not silently expand registration. |
| A08 | High | Updating expiry to `null` leaves the old timestamp because SQL uses `COALESCE`. | Distinguish omitted fields from explicit null; add subscription transition coverage. |
| A13 | High | A mocked completed $49.99 lifetime capture returns success but leaves its user free. | Implement trusted order ownership, amount/currency/status validation and idempotent entitlement fulfilment. |
| A12 | High | Direct API registration accepts a one-character password. | Apply server-side validation consistently with reset and website rules; add login/reset abuse controls. |

Code: `database.ts:408` reassigns browser ownership on conflict; `database.ts:1830` legacy UPDATE omits userId; similar legacy mutation branches deserve the same review. The UUID must not act as an ownership credential.

Lifetime billing is broken at several points beyond A13: the subscription page opens checkout after an awaited request, which can be popup-blocked; it has no return handler invoking `api.capturePayment`; the webhook handles `PAYMENT.SALE.COMPLETED`, whereas the Orders v2 capture flow uses `PAYMENT.CAPTURE.COMPLETED`; capture currently validates neither the authenticated user's order ownership nor entitlement. PayPal documents fulfilment on the capture-completed event. [PayPal checkout webhooks](https://developer.paypal.com/payment-methods/webhooks/).

The old Polar webhook route is still mounted and also skips signature checks when its secret is absent. Review or remove this obsolete entry point. Payment events are not backed by a durable event ledger which safely handles retries, stale delivery, refunds, disputes and multiple simultaneous plans. An old subscription expiry can downgrade an account which has since purchased another entitlement. These are static findings; no real payment was made and no live provider credentials were exercised.

### Sync integrity and recovery

| Gate | Severity | Observed failure | Required change |
| --- | --- | --- | --- |
| A01 | High | Pull for collection A includes collection B's bookmarks. | Filter all six delta queries and status counts by selected collection. |
| A02 | High | A website edit never reaches the browser which originally created the item. | Exclusion uses creator browser, not last writer. Track mutation origin/revision independently of provenance. |
| E01 | High | A new change queued while push is in flight is erased by clearing the whole queue on success. | Give queued operations durable IDs and remove only acknowledged IDs from the captured batch. |
| E02 | High | Even an edit containing a master ID loses it in the push serializer. | Persist and transmit item and parent master IDs; consume CREATE response mappings directly. |
| E03 | High | Pull reports success after changing title/URL but never moves the bookmark. | Apply parent and sibling position for both bookmark and folder updates. |
| E04 | High | Fifth failed apply sends ack and advances past unapplied changes. | Never acknowledge failed work; surface a recoverable blocked state or durable dead-letter record, without losing the change. |
| E11 | High | Missing local item on UPDATE is warned about then acknowledged as success. | Recreate/reconcile or fail and retain the operation. |
| E09 | High | Failed collection fetch leaves new selection active and old queued changes erased. | Fetch and validate first; snapshot local state; switch transactionally; restore on any failure. |
| A09 | High | Session rollback sets `rolled_back` but pending deletes only query `deleted`; extensions receive no removal. | Emit durable removal events for rollback and collection deletion, including reconciliation after missed history. |
| E06 | High | `/Account?token=AbC` and `/account?token=abc` become the same identity. | Preserve case-sensitive paths, queries and fragments; do not use URL equality as bookmark identity. |

The watermark is keyed to user/browser, not collection (`database.ts:622`). Ack receives a collection header but does not resolve/store it. Once collection filtering is fixed, a pull/ack in one collection can still skip older changes in another. Use collection-specific durable revisions.

URL/path matching also collapses same-URL bookmarks and same-name folder siblings. `buildLocalIdMaps` overwrites a URL-to-master map and matches before merging persisted identities. Replayed creates may reuse the wrong bookmark; URL-fallback deletion can remove multiple local copies. These are code-established risks, not separate real-browser reproductions.

Pulls, overwrites and switches do not share the `sync()` lock. Global queue suppression hides both extension-generated events and genuine user edits during an apply; persisted suppression can remain set if the worker dies. Missing parents fall back to the bar, and delta folder creates sort by second-resolution creation time rather than dependencies. Add worker-restart, concurrent-operation and unresolved-parent tests before release.

Bookmark event handlers are registered after asynchronous storage initialisation, and sync alarm handlers after a config fetch. MV3 wake-up behaviour needs an explicit worker-stop/restart test and synchronous listener registration; initial worker boot tests do not establish that the event which wakes the worker will be captured.

### Hierarchy, ordering and editor commits

| Gate | Severity | Observed failure | Required change |
| --- | --- | --- | --- |
| A03 | High | Move to root leaves old `masterParentId` due to SQL `COALESCE`. | Explicitly clear parent links; validate new parent and sibling order. |
| A04 | High | Add folder then child in one commit stores `temp-parent` as the child's masterParentId instead of the new server ID. | Resolve temporary IDs within the batch and return the mapping. |
| A10 | High | Folder can be moved into itself; API reports success. | Reject self/descendant cycles and cross-collection parents on the server. |
| A11 | High | A changes request for collection A renames an item in collection B. | Validate every item belongs to the addressed collection. |
| E08 | Medium | Reorder within the same folder is ignored by event handler. | Queue same-parent index changes and handle children-reordered events. |
| E10 | Medium | Delta CREATE omits index, losing sibling position. | Preserve ordered siblings for all imports, creates and moves. |
| E05 | High for Firefox | Local parent resolver returns Chromium `1` instead of Firefox `toolbar_____`. | Resolve canonical roles to roots actually found on the destination browser. |
| E12 | High for Opera | Opera root `Other bookmarks` ID 5 maps to ID 2, which is `Imported Bookmarks`. | Define mappings for browser-specific roots; retain additional roots as distinct containers. |
| E13 | Medium | A German-titled bookmarks bar is skipped by overwrite cleanup. | Use native root identity/metadata, not English title allowlists. |

The editor also reports success for some zero-row mutations, omits move index when applying changes, and applies successful operations before catching failed ones. Retrying a partially successful commit can duplicate adds/copies. Add request idempotency or explicitly return/retain only failed operations. Imported preview items have temporary IDs too; editing or deleting them before commit needs the same mapping contract as A04.

## Import, export, clipboard and notifications

**Import today means browser initial upload, merge/overwrite, or cross-collection drag-copy.** The inspected website has no Netscape bookmark HTML parser, JSON file importer, file upload workflow, or account export/download route. There is no website clipboard read/write or paste event workflow; only the extension debug page copies diagnostics. If “copy and paste” means drag-copy between collection panels, that is present but temporary-ID and partial-commit risks above remain. OS clipboard support is not implemented in this checkout.

Before calling this a complete bookmark product, add and test:

- Netscape HTML import/export and a lossless JSON backup format; round trip nested structure, order, duplicate URLs, duplicate titles, empty folders and Unicode.
- Preview, validation, counts and rollback for imports; never silently deduplicate distinct bookmarks.
- Supported URL policy covering http/https, file/browser-internal URLs and bookmarklets, with safe rendering/export escaping. Decide what preserves data versus what users may execute.
- Paste from text/HTML with clear handling of malformed URLs, duplicate selections, cancellation and unsupported clipboard permissions. Keyboard copy/paste should be tested if promised.
- Large libraries, malformed/truncated files, offline uploads, request/body size limits and resumed imports.

Notification tests cover extension state and an actual 30-second alarm, not visible Windows toast delivery, notification clicks, Focus Assist, denied OS permissions or browser shutdown. Website browser notifications are not implemented. Firefox's unsupported `getPermissionLevel` has a feature check, so the lint warnings on that API alone are not a demonstrated crash. The notification permission and OS behaviour still need real Firefox/Windows acceptance.

## Production and store readiness

- Extension config remains localhost, Firefox host permissions omit the production site, and the default webpack build is development mode. Add explicit reproducible dev/production targets and a release check rejecting localhost permissions/endpoints and debug pages.
- Firefox manifest is MV2 and lacks `identity` while the shared Google login path calls `chrome.identity`. Build success is not login compatibility. `web-ext lint` reports missing data collection permissions plus unsafe dynamic HTML assignments. [Firefox data consent requirements](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/). Evidence: [Firefox lint results](firefox-audit-lint-results.json).
- [Production dependency results](dependency-audit-results.json) include critical advisories against installed Next and proxy-addr. Upgrade with compatibility checks. Audit severity is not proof every advisory is exploitable here, but these are not acceptable unreviewed launch dependencies. The Windows Next advisory is particularly relevant if hosting on Windows. [Next Windows advisory](https://github.com/advisories/GHSA-p293-qw3h-jr36).
- The tracked `src/extension/bookmarx.pem` contains a private key. Remove it from source control and handle history/key rotation appropriate to its use. Tracked browser profiles and SQLite WAL/SHM files should also be removed from the repository and scanned for historical auth/user data. This audit does not print secret contents.
- The landing page claims encryption at rest, export availability, 50K+ users and 99.9% uptime. Plain SQLite bookmark storage does not implement application-level at-rest encryption; host disk encryption and operational claims were not verified. Correct claims to substantiated behaviour before charging.
- All inspected upgrade links target `/upgrade`, but no website route exists at that path. Point them at the working subscription page.
- Browser fingerprint replacement uses only browser/OS/version characteristics, so distinct profiles/machines can evict each other. The same profile can change its apparent fingerprint after pending/master GET overwrites its metadata as `unknown`. Identity and paid device counting need a stable registration model, not browser-label guessing.
- Authentication lacks demonstrated API rate limiting, revocation of issued JWTs after password reset, and email verification before automatic account linking/QA premium allowlisting. Google provider and signed-store login were not exercised.
- SQLite backup/restore, production migrations, retention, monitoring, TLS/CORS/proxy configuration and mail deliverability were not operationally tested. Migration completion should be awaited explicitly at startup instead of relying on slow Next preparation.

## Recommended release order

1. Close cross-account mutation and unsigned webhook paths; remove obsolete billing endpoints and exposed private artifacts. Review dependency upgrades.
2. Define durable item identity, collection-specific revisions, ordered operations, explicit null semantics and idempotent acknowledgements. Fix queue loss and failed-apply acknowledgement before adding features.
3. Centralise native-root discovery and canonical roles. Preserve Firefox menu and Opera extra roots as distinct containers where the destination has no equivalent; never infer a system root solely from a user-editable title.
4. Fix editor batch temporary IDs, cycle validation, same-parent order and partial retries. Verify website edits and rollback converge back to their origin browser.
5. Complete payment capture/return/webhook fulfilment, cancellation, renewal, refund, expiry and lifetime conversion in sandbox. Repeat with signed production extension artifacts.
6. Implement the promised import/export/clipboard flows, then run Windows acceptance for each real browser and multiple profiles. Only claim browser/OS support that has passed.

A release candidate needs all audit gates passing, no skipped paid flows, stable repeated cross-browser convergence, proven backup recovery and successful payment fulfilment. Build success and an API smoke suite cannot substitute for those gates.

## Reproduce and continue

```powershell
# Standard baseline
npm test
npm run typecheck
npx playwright test --config=playwright.website.config.ts
npx playwright test --config=playwright.extension.config.ts

# Explicit launch blockers; currently exits nonzero (26 failing assertions)
npx vitest run --config=vitest.audit.config.ts
# Equivalent shortcut: npm run test:audit

# Real Windows roots and basic local extension CRUD, isolated browser profiles
node tests/audit/windows-probe.cjs

# Firefox packaging checks
npx web-ext lint --source-dir src/extension/dist-firefox --output json
```

Build the extensions first. Run website builds while the dev server is stopped or use a separate checkout/output directory. Existing browser suites use the dev database and leave synthetic accounts behind; their cleanup removes registered test browsers/collections, not all user rows. New API security gates use ephemeral databases. The dev WAL/SHM files changed during this audit and were not reverted while the database was running. No personal browser profile or personal bookmark tree was used.

Raw terminal logs remain locally as ignored `audit-*.log` files. The reproducible gates and the three JSON evidence files are the durable audit artifacts.
