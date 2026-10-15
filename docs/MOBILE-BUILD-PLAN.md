# Build Mobile: BookMarx Premium

Updated: 15 October 2026. Baseline: `2f08247` on `master`.
Status: website/source audit and implementation plan complete; the new access policy and feature-parity phases below are not implemented yet.
This replaces the outdated scaffold-era plan. Old native-share snippets and the completion labels in `PROGRESS.md` are not evidence of a tested mobile release.

## Product decisions

- The paid membership is **Premium**, not Pro. Confirmed both in the live `/api/v1/config` response (`branding.premiumTitle`) and on the live homepage/FAQ. Use the server's branding value consistently, with Premium as the fallback.
- Native iOS/Android access is for eligible Premium members. A free account can register, verify its email, sign in, recover its password and manage/delete its account; it cannot enter the mobile bookmark library.
- Membership eligibility comes from the backend's effective `isPremium` entitlement and expiry, including valid trial, annual, monthly, lifetime and configured override access. Do not infer eligibility from a checkout redirect, a locally editable flag or a plan label alone. Cancellation retains access until the backend says it has expired; refunded/revoked access is blocked after revalidation.
- The nonmember destination is a **membership-required screen**, not a purchasing page. Copy: “This app requires a BookMarx Premium membership.” Actions: “Check membership”, “Use another account”, and account/privacy/support functions. No prices, trial promotion, upgrade CTA, checkout/subscription-purchase links, or automatic opening of the website on either platform.
- Registration uses the same account and verification-email backend as the website. It does not grant Premium or bypass verification.
- The mobile app manages bookmarks itself. No browser extension dependency, browser profile management, browser sync setup or browser-limit usage. Normal synchronization with the same account's cloud library remains: changes should appear on the website and other signed-in devices.
- OS share-in and share-out are mobile conveniences, not browser integration. Saving a link shared from another app still checks authentication, email verification and membership before saving.
- This is a native mobile experience with website feature parity, not a WebView wrapper. Adapt desktop drag/drop and side-by-side panels to touch-friendly selection and destination sheets.

## Evidence and audit limits

Reviewed the live public homepage, public config and login redirect; no authenticated website session was available, so private workflows were examined in their source, backend implementations and tests. No production accounts, bookmarks or emails were created for this audit.

Website sources of truth:

- `src/website/app/page.tsx`: native apps described as planned for Premium members; mobile access crossed out in the Free comparison.
- `src/website/app/dashboard/page.tsx` and `app/collections/**`: dashboard, collection listing/viewing/editing and restore-point UI.
- `src/website/lib/editor-store.ts`: create, rename, URL update, move/reorder, delete, selection/search, copy from source collections, staged changes and revert.
- `src/website/components/SourceCollectionPanel.tsx`: selection and copying from another collection.
- `src/website/components/BookmarkTransfer.tsx`: HTML/JSON files, pasted URL lists/tab-separated title/URL input, previews, exports and copying URLs.
- `src/website/backend/utils/collectionChanges.ts`: transactional editor operations, stable operation receipts, temporary-ID mapping and restore-point snapshots.
- `src/website/backend/api/collections.ts`: collection CRUD, copying, events/rollback and archive safeguards.
- `src/website/backend/api/bookmark-files.ts`: import preview/commit and export contracts.
- `src/website/backend/api/sessions.ts`: session contents, rollback and restore.
- `src/website/backend/api/auth.ts`, `middleware/auth.ts`, `utils/email.ts`: effective entitlements, signup, verification, resend, password reset, email delivery and verified-email enforcement.
- `src/website/app/verify-email/page.tsx`, `components/EmailVerificationPanel.tsx`: delivery-failure messages, resend and recheck behavior.

### What is already present in mobile

Expo configuration, shared state, login/signup, collection switching, folder/bookmark CRUD, search, inbound sharing integration, per-account caches, durable queued edits, stable retry IDs and stale-response protection exist. Baseline validation from the preceding bug-fix batch: 28 regression tests, mobile/test TypeScript checks, Expo dependency alignment and Android/iOS JS exports pass. Those checks are not native device or store-release certification.

### Confirmed gaps and contract issues

1. Mobile library access is not restricted to Premium members. Existing checks protect selected features rather than the entire library, and deep links need a central guard.
2. `app/upgrade.tsx` still advertises prices and contains Android checkout links; settings, collection prompts and shared Premium components can also expose purchase messaging.
3. Signup already POSTs to the website registration endpoint, which attempts to send the same Resend verification email. Mobile discards `verificationEmailSent`, does not model `emailVerified`, and has no verification/resend screen. Backend library routes already reject unverified accounts. Delivery success into a real inbox is not established by source inspection.
4. The actual `/auth/me` response is `{ success, data: User }`; mobile currently expects `data.user`. Startup/profile refresh tests must use the real backend shape, not only matching mocks.
5. Session details return `sessionId`, `folders`, `bookmarks`, `summary`, etc.; mobile currently expects a `{ session, items }` response. Reconcile contracts before claiming history works.
6. Mobile still uses browser sync endpoints/identity and therefore browser registration/quota machinery. Move native mutations to the website collection editor APIs and introduce mobile session/device semantics where needed.
7. Copying/duplication, bulk operations, explicit ordering, staged commit/revert, import/export and collection restore points lack complete native workflows.
8. Cross-collection MOVE is not an existing atomic operation. Never implement it as client-side “copy then delete” without a server transaction and idempotency.
9. Website account settings currently offer Google account linking, not a complete deletion/profile-management backend. Add missing account capabilities explicitly; do not assume APIs exist because the website has a Settings link.
10. Public privacy copy currently says no native app is available. Update it before release. Some website “unlimited” wording also differs from configured limits; mobile must display real server limits rather than copying that wording.

## Access state and navigation contract

Evaluate on login, registration, cold start, foreground, verification refresh, membership refresh, protected deep links and before replaying queued changes.

| State | Destination | Library access / queue |
| --- | --- | --- |
| Signed out / invalid session | Sign in | None; no replay |
| Signed in, email unverified or status unknown | Verify email | None; queue paused |
| Verified, no effective Premium entitlement | Membership required | None; queue paused |
| Verified and Premium, validated online | Library | Allowed; normal replay |
| Previously eligible, temporarily offline | Cached library only within the offline entitlement window | Local edits may queue; no transmission offline |
| Membership/verification revoked, or offline entitlement window elapsed | Membership/verification/recheck screen | Hide protected screens and pause replay; preserve account-owned queued work |

Proposed offline policy: a configurable maximum 24-hour grace period after the last successful server eligibility check, never beyond a known subscription expiry. A new login must validate online. Unknown verification/entitlement status must not unlock the library. A transport failure is not a reason to delete credentials, cached bookmarks or pending edits. A confirmed denial must never be converted into offline grace.

The access guard must sit above all library routes. Hiding the Home button is insufficient: folder/edit/search/collections/history/share routes must be guarded, and store mutations/replay must enforce the same policy. Clear active UI on account changes; never replay another account's pending work.

## Website-to-mobile parity scope

| Area | Native implementation and completion condition |
| --- | --- |
| Dashboard/library | Counts for bookmarks/folders/collections, recent work, pending/failed sync status, empty-state creation; usable before any browser is connected |
| Bookmarks | Create, open safely, rename, edit URL, move, copy URL, duplicate, delete; immediate consistent results across navigation |
| Folders | Create/nest/rename/move, copy entire subtrees, recursive delete with affected-item confirmation; protect structural roots and prevent cycles |
| Selection/bulk actions | Long-press selection, select all/clear, bulk move/copy/delete, useful counts; selecting parent and child must not duplicate processing |
| Ordering | Persist order within folders and at root; touch reorder plus accessible move-up/down or destination controls; sorting must clearly distinguish view order from saved order |
| Collections | Create, rename, description, switch, inspect contents, archive/delete safeguards and capacity display; default collection protections match backend |
| Copy/transfer | Copy selected bookmarks/folders across or within collections, choosing target folder; preserve hierarchy, generate new identities and preserve duplicate URLs intentionally |
| Cross-collection move | New atomic server transfer with source/destination validation, a stable operation ID, restore points and all-or-nothing behavior |
| Editor changes | Draft/pending change review, Commit and Discard/Revert matching website semantics; leaving with unsaved work prompts; crash-safe drafts scoped to account/collection |
| Search | Titles, URLs and folder names; current collection plus explicit all-collections mode, useful containing-folder context, edit/move/copy from results |
| Import | Native file picker for browser HTML/BookMarx JSON; pasted URL lists and title-tab-URL lines; server preview, counts/warnings, destination, confirmation, stable retry ID and post-import restore point |
| Export | HTML and JSON backups through OS save/share; copy selected/all URLs; honor platform file permissions and delete temporary exports appropriately |
| History/recovery | Collection event/restore-point list, inspect affected items, preview consequences, rollback with confirmation, refresh library; session history/rollback/restore mapped to actual server contracts |
| Sharing | Cold/warm-start shares, URL extraction, editable title, account/collection/folder selection and offline queueing; blocked users cannot save; pending share preserved through access checks without auto-saving |
| Account | Verified-email status/resend/recheck, forgot/reset password, secure logout, profile/membership status, account deletion; Google-only website accounts must have a supported mobile sign-in route |
| Appearance/accessibility | Website's BookMarx branding, light/dark/system themes, large text, screen-reader labels, keyboard avoidance, safe areas, tablet layout, reachable controls |
| Support/privacy | Help/contact and privacy/terms/data-deletion information available even when membership blocks the library; no links that funnel users to checkout |

Website workflows do not currently provide a full clipboard cut/paste or undo/redo stack. Treat native cut/copy/paste/duplicate and draft undo as explicit mobile additions, not features already proven on the website. Browser screens, extension installation, browser registrations and billing purchase flows are excluded from parity.

## Implementation phases

### Phase 1 — Membership, verification and auth contracts (first implementation batch)

- [ ] Normalize the real `/auth/me` response and add contract tests against the actual endpoint. Keep server effective entitlements as the authority.
- [ ] Add verification fields to User and preserve signup `verificationEmailSent`. Do not claim delivery when the API reports failure.
- [ ] Implement Verify Email with masked/full signed-in address, inbox/junk guidance, resend cooldown, “I have verified my email”, delivery-failure retry and sign out.
- [ ] Reuse `/auth/resend-verification` and `/auth/verify-email`; retain the website email template and one-use 24-hour token policy. Support opening the existing website link and refreshing after return; add verified universal/app links only after domain association is correctly deployed. Never log tokens or leak them to analytics.
- [ ] Replace upgrade/plan/checkout UI on both platforms with neutral membership status. Remove indirect purchase prompts from settings, PremiumGate, collection dialogs and routes. Preserve old `/upgrade` deep links only as redirects to the neutral screen.
- [ ] Introduce one access-state guard and central store/queue enforcement. Free and unverified users must not fetch/hydrate protected content or register a browser simply by signing in.
- [ ] Revalidate before replay and on foreground; enforce expiry and the agreed offline window. Pause and preserve changes on entitlement/email denial instead of treating the 403 as a permanently rejected bookmark and dropping it.
- [ ] Add forgot-password/reset flows using the existing backend; generic reset responses and no secret leakage.

Exit tests: verified Premium, verified Free, unverified Premium/Free, expired/canceled/revoked membership, valid trial/lifetime/override, invalid credentials, offline/reconnect, forged local state, direct library/share links, delivery failure, resend 429, expired/reused verification token, and verification on another device. Test the exact real API shapes.

### Phase 2 — Native account/API foundation without browser integration

- [ ] Read via account-scoped collection endpoints; write via the website transactional collection editor service with native operation IDs, temporary-ID mapping and collection restore points. Adapt the existing durable queue rather than adding a second mutation system.
- [ ] Introduce signed mobile-session audience/client claims or explicit mobile API routes so the server can recheck verified email and effective Premium on native library calls without changing Free website/extension access. A caller-supplied header or User-Agent is not authorization.
- [ ] Keep neutral auth/status/recovery/deletion endpoints available when library access is blocked. Add contract and authorization tests for every native endpoint.
- [ ] Represent phones as mobile devices/sessions, separate from browser-profile registrations and quotas. Opening the app on a phone must not require or consume a desktop browser slot.
- [ ] Fix real history response types. Define stable shared request/response schemas for web/mobile without importing web UI into native.
- [ ] Handle account changes, user deletion, expired tokens and subscription/email changes during in-flight work. Preserve operation receipts and timestamps across restarts.

Exit tests: a new verified Premium account can manage a complete library without ever installing an extension; the phone does not appear as a browser or reduce browser capacity; old mobile tokens cannot bypass a downgrade.

### Phase 3 — Complete native bookmark/folder editing

- [ ] Finish all single-item actions, breadcrumb/folder navigation and safe URL handling.
- [ ] Add multi-selection, destination sheets, bulk actions, persistent ordering and accessible alternatives to dragging.
- [ ] Add draft sessions with commit/discard and clear pending-vs-confirmed feedback. Keep retryable transport errors distinct from validation and access failures.
- [ ] Preserve current folder/selection/draft state across app backgrounding and process restart where appropriate. Implement guarded root/descendant behavior.

Exit tests: equivalent create/rename/URL-edit/move/reorder/delete sequences on website and mobile produce the same tree and restore points. Validate with the configured Premium-sized library (currently up to 10,000 bookmarks), deep nesting and large text.

### Phase 4 — Collections, copies, duplicates and transfers

- [ ] Complete description/editing/capacity/default protections and archive/delete confirmations.
- [ ] Implement recursive copy/duplicate via the existing copy-from editor operation, including copies within a collection and destination selection.
- [ ] Add atomic cross-collection move service where the current backend has no safe equivalent. Validate permissions, duplicate selection roots, cycles, missing destinations, limits and archived collections in one transaction.
- [ ] Stable IDs must prevent duplicate transfers after a timeout. Refresh both collections and create meaningful recovery points.

Exit tests: nested cross-collection copy/move preserves structure; interrupted/retried operations neither duplicate nor delete source data prematurely; parent/child selection processes each subtree once.

### Phase 5 — Files, clipboard, sharing and recovery

- [ ] Native import picker and preview using existing HTML/JSON/text import services. Mirror the website's 8 MB file selection limit or reconcile server/client limits before release.
- [ ] HTML/JSON export through the OS file/share workflow; clipboard copy/paste actions and safe URL validation.
- [ ] Replace ambiguous history screens with collection restore points plus accurately modeled session history. Rollback/restore refreshes caches, search, counts and drafts; prevent restoring over uncommitted edits without resolving them.
- [ ] Test share extensions/intents on actual iOS and Android development/release builds, including locked/unverified/free/offline states. Expo Go or copied native source is not proof of integration.

Exit tests: HTML/JSON export/import round trip retains hierarchy and intentional duplicate URLs; denied/failed imports are atomic; retry is idempotent; recovery returns the collection to the advertised snapshot.

### Phase 6 — Account completeness and mobile polish

- [ ] Support native sign-in for accounts originally created with Google, including secure explicit linking. If third-party login is offered, implement the equivalent Apple-compliant login option where required; do not silently merge accounts based only on matching email addresses.
- [ ] Add a real account-deletion backend and in-app initiation, reauthentication/confirmation, session revocation, scoped local-data cleanup and clearly explained retention/subscription consequences. Provide the public web deletion-request resource required for Play distribution.
- [ ] Add supported profile/password/account settings, privacy-safe support, light/dark/system theme, accessible controls and tablet behavior.
- [ ] Make privacy/terms/store declarations describe the native app, storage, sync and share extensions accurately. Avoid optional analytics until configured and consent handling is defined.

Exit tests: account deletion is reachable from nonmember and unverified states; Google-only users can sign in; sensitive flows cannot be completed with another account's stale screen or token.

### Phase 7 — Reliability and production API verification

- [ ] Preserve and extend the existing mobile regression suite. Add integration coverage for the actual deployed API contracts and native-session enforcement using isolated test databases.
- [ ] Test web-to-mobile and mobile-to-web convergence, concurrent devices, conflicting edits, force-quit during queue persistence, parent ID remaps, retries, timeouts, 429/5xx, revoked access and low-storage failures.
- [ ] Define conflict UX/version checking for remote edits; do not silently overwrite newer server changes with an old offline draft. Make pending/rejected operations inspectable and recoverable.
- [ ] Run native Android and iOS tests on representative phone/tablet sizes, small screens, dark mode, large text, screen readers, background/foreground and cold launch. Use an isolated Premium fixture account.
- [ ] Review native dependency/security support and migrate Expo/React Native to a supported release compatible with current store toolchain/target requirements. The current SDK 52 build's passing JS export is not a reason to freeze an outdated toolchain for launch.

Exit: no open critical authentication, authorization, data-loss, duplication or broken-core-flow defects; all release-blocking acceptance tests pass with recorded evidence.

### Phase 8 — TestFlight, Play testing and release

- [ ] Use Expo owner **gazzetta2**. Validate the real EAS project ID and package IDs (`com.bookmarx.app`), signing, APNs/share-extension entitlements where needed, Android intent filters and verified app-link association files.
- [ ] Produce signed internal Android AAB/APK and iOS TestFlight builds with production HTTPS configuration; keep credentials out of Git. Windows supports Android work; use macOS or EAS cloud for iOS.
- [ ] Supply reviewer access with a verified active Premium fixture account; describe the existing-service companion model and all non-obvious flows in review notes.
- [ ] Audit every app route/link/share sheet for purchase promotion. Recheck store rules at submission; approval is not guaranteed by a particular screen label.
- [ ] Complete privacy/data-safety disclosures, deletion URL, permissions, support URL, age rating, screenshots, icons, versioning and crash reporting.
- [ ] Update website app availability/FAQ/privacy wording only when testing/release availability is real; retain “planned” until then. Add App Store/Play links once live.
- [ ] Record internal-test results, production smoke checks, staged rollout/rollback procedure and support ownership.

Exit: tested signed binaries accepted into TestFlight and Play internal testing, then production release after acceptance criteria and store review. “Built”, “uploaded”, “accepted for testing” and “publicly released” are separate statuses.

## Backend reuse and new work boundaries

Reuse: shared registration/Resend delivery, email verify/resend, password reset, effective entitlements, collection read/edit/copy/events/rollback, file import/export and session history.

New or changed server work: native-session authorization/device semantics, atomic cross-collection move where needed, supported account deletion and missing account/login APIs, optional link handoff, and history contract cleanup. Cover these with tests showing existing website and extension behavior remains intact.

No browser integration is required to operate the app. Existing cloud collections may already contain browser-origin bookmarks; preserve their data and structural protections rather than deleting origins or flattening their folders.

## Release acceptance checklist

- [ ] No library route, native share entry or queue replay bypasses verified-email/Premium access.
- [ ] Free users see only neutral membership status; purchase links/prices/promotions are absent on both platforms.
- [ ] Real registration email is delivered to an authorized test mailbox, can be used once, expires, and can be resent with the same website protections. A provider-mocked unit test is not inbox-delivery proof.
- [ ] All parity rows above have executable or recorded acceptance evidence. Features absent from the website are recorded as deliberate additions.
- [ ] No browser/extension installation or browser slot is needed on the phone.
- [ ] Offline data, drafts and queue cannot cross accounts or silently disappear on access/network failure.
- [ ] Copy/import/transfer retries are idempotent; destructive operations are atomic/recoverable.
- [ ] Device-tested native builds, account deletion, updated privacy disclosures and store submissions are complete.

## Validation commands

From repository root:

```powershell
npm run test:mobile
npm run typecheck:mobile
```

From `src/mobile`:

```powershell
npx expo install --check
npx expo export --platform android --platform ios --max-workers 1
```

Run the relevant backend API suites when changing shared endpoints. Keep the known unrelated root test typecheck failure in `tests/api/contact.test.ts` separate from mobile status. Native builds and device acceptance remain required in addition to these commands.

## Store-policy basis (checked 15 October 2026)

The no-promotion/no-purchase model is the user's product decision for both platforms. Rules are not a blanket worldwide ban on all external messaging: storefront, programme and category exceptions exist. We do not rely on those exceptions in this build.

- Apple: [App Review Guidelines, 3.1.3(f)](https://developer.apple.com/app-store/review/guidelines/#free-stand-alone-apps) describes companion apps to paid web tools without in-app purchases or external purchase calls to action. Our proposed model should be assessed against that provision at submission, not asserted as guaranteed approval.
- Google: [Understanding the Payments policy](https://support.google.com/googleplay/android-developer/answer/10281818?hl=en) permits consumption-only apps; its rules distinguish purchase links from certain informational messaging. We choose the neutral screen on both platforms.
- Apple: [Account deletion](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion) requires deletion support for apps offering account creation.
- Google: [Account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en) require in-app and web deletion-request paths for qualifying apps.

## Delivery tracking

Work stays in `C:/CODING/bookmarx` on `master`, following the chosen workflow. Commit small, tested batches, update this file with each phase's evidence, and push completed batches. Do not mark a phase complete based only on source code, old PROGRESS checkmarks or a JS bundle export.

Next implementation batch: Phase 1 — real auth-response normalization, verified-email journey, neutral membership screen and central native access/queue guard. Later phases remain planned; this planning update does not silently change production authentication or send emails.
