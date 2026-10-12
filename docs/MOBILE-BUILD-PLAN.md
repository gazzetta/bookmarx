# BookMarx Mobile — Build Plan

**Status:** Scaffolded, not runnable. Expo Router screens exist but the project is missing required Expo config files, has no shared state, no device ID, stub actions, and orphaned native share code.

**Stack (as built):** Expo SDK 52, expo-router 4, React Native 0.76, `fetch` API client, `expo-secure-store` for token storage. Do NOT follow the old bare-RN/axios layout in `STAGE-2-BUILD-PLAN.md` Phase 5 — it predates the Expo implementation.

**Environment constraint:** This machine is Windows. iOS builds require macOS or EAS Build (cloud). Android can be built and tested locally. Plan accordingly — iOS work is isolated in Phase 7.

---

## Current State Audit

### Exists and works (TypeScript compiles)
| File | Purpose |
|------|---------|
| `app/_layout.tsx` | Stack navigator, 7 screens registered |
| `app/index.tsx` | Home — root folders/bookmarks, premium badge, usage bar |
| `app/login.tsx`, `app/register.tsx` | Auth screens |
| `app/folder/[id].tsx` | Folder drill-down |
| `app/upgrade.tsx` | Premium upgrade/plan management |
| `app/sessions/index.tsx`, `app/sessions/[id].tsx` | Sync history + rollback (premium) |
| `components/PremiumGate.tsx` | PremiumBadge, PremiumGate, UsageLimitBar, PremiumFeatureList |
| `services/api.ts` | API client — auth, stats, sessions, collections, master-collection, capture, sync CRUD |
| `services/auth.ts` | Token storage via `expo-secure-store` |
| `hooks/useAuth.ts` | Auth state + premium stats |
| `hooks/useBookmarks.ts` | Fetch/filter/capture/delete/createFolder |
| `constants/config.ts` | `API_BASE_URL` (dev `localhost:3005`, prod `www.bookmarx.cc`), `STORAGE_KEYS` |
| `types/index.ts` | User, Bookmark, Folder, MasterCollection, ApiResponse, UserStats, Session, Collection |

### Missing / broken
- No `app.json` — **Expo will not start without it**
- No `babel.config.js`, no `assets/` (icon, splash, adaptive icon)
- No `.gitignore` in `src/mobile/`
- No shared state — each screen instantiates its own `useBookmarks()` copy
- Device ID falls back to literal `'mobile-app'` — every install collides
- Bookmark tap does nothing (`onPress={() => {/* Open URL */}}` in `index.tsx` and `folder/[id].tsx`)
- Missing screens: search, add bookmark, edit bookmark, settings, folder picker (move)
- `useBookmarks` doesn't expose `updateBookmark`/`updateFolder` (API methods exist, unused)
- No offline queue, no local cache — blank screen without network
- `ios/` and `android/` contain orphan share snippets, not real native projects (see Phase 6)
- `ShareReceiverActivity.kt` reads token from SharedPreferences `bookmarx_auth` — RN never writes it there (token lives in expo-secure-store). As written it always fails auth. Hardcoded `http://10.0.2.2:3005` emulator URL.

---

## Phase 1 — Make the Project Bootable

**Goal:** `npx expo start` works; app loads in Expo Go / emulator.

### 1.1 Create `src/mobile/app.json`
```json
{
  "expo": {
    "name": "BookMarx",
    "slug": "bookmarx",
    "version": "1.0.0",
    "orientation": "portrait",
    "scheme": "bookmarx",
    "userInterfaceStyle": "automatic",
    "newArchEnabled": true,
    "icon": "./assets/icon.png",
    "splash": {
      "image": "./assets/splash-icon.png",
      "resizeMode": "contain",
      "backgroundColor": "#3B82F6"
    },
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.bookmarx.app"
    },
    "android": {
      "package": "com.bookmarx.app",
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#3B82F6"
      },
      "edgeToEdgeEnabled": true
    },
    "plugins": ["expo-router", "expo-secure-store"],
    "experiments": { "typedRoutes": true }
  }
}
```
Notes:
- `scheme: "bookmarx"` enables deep links (`bookmarx://`) needed later for share-intent handoff and future OAuth.
- Bundle ID `com.bookmarx.app` matches the open question in `PROGRESS.md` — confirm with user if different.
- `newArchEnabled: true` is default for SDK 52; keep it unless a dependency breaks.

### 1.2 Create `src/mobile/babel.config.js`
```js
module.exports = function (api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
```

### 1.3 Create `src/mobile/assets/`
Generate placeholders (replace with real art later):
- `icon.png` — 1024×1024
- `adaptive-icon.png` — 1024×1024 foreground
- `splash-icon.png` — ~400×400 centered logo
- `favicon.png` — 48×48 (web, optional)

A solid `#3B82F6` square with a white bookmark glyph is fine for dev.

### 1.4 Create `src/mobile/.gitignore`
```
node_modules/
.expo/
dist/
build/
*.jks
*.p8
*.p12
*.key
*.mobileprovision
*.orig.*
ios/
android/
```
(`ios/`/`android/` are prebuild artifacts — do not commit generated projects. The share snippets get relocated in Phase 6 first.)

### 1.5 Install missing dependencies
```powershell
cd 'c:\CODING\bookmarx\src\mobile'
npx expo install expo-web-browser expo-crypto @react-native-async-storage/async-storage @react-native-community/netinfo
npm install zustand
```
- `expo-web-browser` — open bookmark URLs in-app
- `expo-crypto` — `Crypto.randomUUID()` for device ID
- `async-storage` — offline cache + sync queue (SecureStore has a 2KB/key limit; can't hold a collection)
- `netinfo` — connectivity detection for the offline queue
- `zustand` — shared store; already used by the website editor (`src/website`), keeps the codebase consistent

### 1.6 Fix device ID — `services/device.ts` (new file)
```typescript
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { STORAGE_KEYS } from '../constants/config';

export async function getDeviceId(): Promise<string> {
  let id = await SecureStore.getItemAsync(STORAGE_KEYS.DEVICE_ID);
  if (!id) {
    id = `mobile-${Crypto.randomUUID()}`;
    await SecureStore.setItemAsync(STORAGE_KEYS.DEVICE_ID, id);
  }
  return id;
}
```
Then in `services/api.ts`: replace the three `SecureStore.getItemAsync(STORAGE_KEYS.DEVICE_ID)` + `'mobile-app'` fallbacks with `await getDeviceId()`. Also add the `X-Device-ID` header to `/sync` POST calls (`updateBookmark`, `deleteBookmark`, `createFolder`, `updateFolder`, `deleteFolder`) — currently missing, and the server requires it.

### 1.7 Fix `request()` hardening in `services/api.ts`
- Add a 15s `AbortController` timeout.
- If `response.status === 401`, clear the stored token via `authService.logout()` so the app bounces to login instead of showing stale errors.

**Verify:**
```powershell
cd 'c:\CODING\bookmarx\src\mobile'
npx expo start
```
App launches; login screen renders. Typecheck: `npx tsc --noEmit`.

---

## Phase 2 — Shared State Store

**Goal:** One source of truth for the collection; edits propagate across screens without refetch storms.

### 2.1 Create `store/bookmarkStore.ts` (zustand)
State:
```typescript
interface BookmarkState {
  folders: Folder[];
  bookmarks: Bookmark[];
  isLoading: boolean;
  error: string | null;
  lastFetched: number | null;
  fetchMasterCollection: (force?: boolean) => Promise<void>;
  getBookmarksInFolder: (masterParentId: string | null) => Bookmark[];
  getFoldersInFolder: (masterParentId: string | null) => Folder[];
  captureBookmark: (url: string, title?: string, masterParentId?: string) => Promise<Result>;
  updateBookmark: (masterId: string, data: { title?: string; url?: string; masterParentId?: string }) => Promise<Result>;
  deleteBookmark: (masterId: string) => Promise<Result>;
  createFolder: (title: string, masterParentId?: string) => Promise<Result>;
  updateFolder: (masterId: string, data: { title?: string }) => Promise<Result>;
  deleteFolder: (masterId: string) => Promise<Result>;
  moveBookmark: (masterId: string, masterParentId: string | null) => Promise<Result>;
}
```
Rules:
- CREATE/UPDATE/DELETE all go through `api` → `/sync`, then refresh via `fetchMasterCollection(true)` (server is source of truth; optimistic local update optional, keep it simple first).
- `fetchMasterCollection` skips if fetched <30s ago unless `force`.
- Delete folder: server should cascade, but UI must also remove descendant items locally after refresh anyway — rely on refetch.

### 2.2 Same for auth — `store/authStore.ts`
Move `useAuth` logic into a zustand store (token/user/isPremium/stats/login/register/logout/refreshStats/checkAuth). Keep `hooks/useAuth.ts` as a thin re-export so screens don't all change at once, or update imports directly — pick one and be consistent.

### 2.3 Update screens to consume the store
- `app/index.tsx`, `app/folder/[id].tsx`: replace `useBookmarks()` with `useBookmarkStore()`.
- Delete the per-screen `useBookmarks` hook (or repoint it to the store and mark deprecated — prefer deleting).

**Verify:** Open a folder, delete a bookmark, navigate back — home list reflects it without manual refresh.

---

## Phase 3 — Core UX Completion

### 3.1 Open bookmark URLs
- `npx expo install expo-web-browser` (done in 1.5)
- In bookmark `onPress`: `WebBrowser.openBrowserAsync(item.url)`. Add long-press → action sheet (Edit / Move / Delete / Copy URL). Use a simple `Alert.alert` with buttons — no new dependency needed.

### 3.2 Add Bookmark — `app/add-bookmark.tsx` (new screen)
- Fields: URL (required, validate `https?://`), title (optional), folder picker (default: current folder if launched from one, else root).
- Submit → `captureBookmark` → success toast → `router.back()`.
- Register in `_layout.tsx` as a modal (`presentation: 'modal'`).
- Entry points: FAB on home + folder screens.

### 3.3 Edit Bookmark — `app/edit-bookmark/[id].tsx` (new screen)
- Prefill title/URL from store by `masterId`; folder picker for move.
- Save → `updateBookmark` (+ `moveBookmark` if folder changed) → `router.back()`.
- Add `app/edit-folder/[id].tsx` for rename (title only).

### 3.4 Search — `app/search.tsx` (new screen)
- Debounced text input; filter `bookmarks` by title/URL substring (client-side — collection is already fully loaded).
- Tap result → open URL or navigate to containing folder.
- Entry point: search icon in home header.

### 3.5 Settings — `app/settings.tsx` (new screen)
- Account info (email, tier badge), usage stats, links to Sessions + Upgrade, logout button, app version (`expo-constants`).
- Move the sessions/upgrade/logout header buttons from `index.tsx` into settings; keep header clean (search + settings icons only).

### 3.6 Folder picker — `components/FolderPicker.tsx`
- Modal listing the folder tree with indentation; "Root" option; exclude the folder being moved and its descendants when picking a move target.
- Reused by add-bookmark, edit-bookmark, and folder create.

**Verify:** `npx tsc --noEmit` clean; full CRUD round-trip against dev API (`localhost:3005`) — create, edit, move, delete visible after refresh.

---

## Phase 4 — Offline Support

### 4.1 Persist collection cache
- After every successful `fetchMasterCollection`, `AsyncStorage.setItem('collection_cache', JSON.stringify({folders, bookmarks, timestamp}))`.
- On store init / app start: hydrate from cache immediately, then fetch fresh in background.

### 4.2 Offline queue — `store/syncQueue.ts`
- Wrap store mutations: if `netinfo` reports offline, push `{type, payload, queuedAt}` to `AsyncStorage('sync_queue')` and apply locally with a `pending: true` flag on the item.
- On reconnect (netinfo listener registered in `_layout.tsx`): replay queue in order through `api`, then `fetchMasterCollection(true)`.
- Show a persistent "Offline — N changes pending" banner when queue non-empty.

### 4.3 Failure handling
- If a queued change fails on replay (e.g., item deleted on another device), drop it, count it, and show one summary toast — don't retry-loop.

**Verify:** Airplane-mode an emulator → add/edit/delete → reconnect → changes appear on server (check via extension or web dashboard).

---

## Phase 5 — Android Share Target

**Decision point — pick ONE:**

**Option A (recommended): `expo-share-intent` config plugin.**
JS-level share handling, no Kotlin to maintain, works in a dev build.
```powershell
npx expo install expo-share-intent
```
Add `"expo-share-intent"` plugin to `app.json` with `"androidIntentFilters": ["text/*"]`. Create `app/share.tsx` route: read `useShareIntent()` url → `captureBookmark` → confirmation screen with folder picker → auto-close. Delete the orphan Kotlin activity (Option B artefacts).

**Option B: keep the Kotlin `ShareReceiverActivity`.**
Only if Option A fails. Required fixes first:
- Token bridge: write auth token to `SharedPreferences("bookmarx_auth")` via a tiny Expo module, or change the activity to deep-link into the app (`bookmarx://share?url=...`) and let JS do the capture — **prefer the deep-link**: keeps auth in one place, reuses `app/share.tsx` from Option A.
- Replace hardcoded `http://10.0.2.2:3005` with a build-time URL (deep-link approach makes this moot).

### 5.1 Preserve native snippets before prebuild
`ios/` and `android/` here are NOT native projects — they're loose reference files that `expo prebuild --clean` would clobber. Move them now:
```powershell
New-Item -ItemType Directory 'src\mobile\share-native' -Force
Move-Item 'src\mobile\android\app\src\main\java\com\bookmarx\share\ShareReceiverActivity.kt' 'src\mobile\share-native\'
Move-Item 'src\mobile\android\app\src\main\AndroidManifest.share.xml' 'src\mobile\share-native\'
Move-Item 'src\mobile\ios\ShareExtension' 'src\mobile\share-native\ios-ShareExtension'
Remove-Item 'src\mobile\android', 'src\mobile\ios' -Recurse -Force
```
(Adjust if going with Option A — keep the files for reference anyway.)

### 5.2 Generate native project + build dev client
```powershell
npx expo prebuild --platform android
npx expo run:android
```
Expo Go does NOT support share intents — a dev client build is required to test this phase.

**Verify:** Share a URL from Chrome Android → BookMarx appears in share sheet → bookmark lands in master collection (verify via web/extension).

---

## Phase 6 — iOS Share Extension (macOS or EAS required)

Cannot be done on Windows. Steps for a macOS agent/session:
1. `npx expo prebuild --platform ios` on a Mac.
2. If using `expo-share-intent` (Phase 5 Option A): it generates the share extension target automatically — configure `"iosActivationRules"` in the plugin options.
3. If going native: add `share-native/ios-ShareExtension` as an app extension target in Xcode, enable App Groups (`group.com.bookmarx.app`) on both targets, share the token via Keychain access group, update `ShareViewController.swift` API URL from config.
4. `npx expo run:ios --device` or EAS Build → TestFlight.

**Verify:** Share from Safari → BookMarx → captured.

---

## Phase 7 — Build & Release Config

### 7.1 `eas.json`
```powershell
npx eas-cli build:configure
```
Profiles: `development` (dev client, internal), `preview` (APK + ad-hoc iOS), `production` (AAB + App Store).

### 7.2 Environment/config check
- `constants/config.ts` prod URL is `https://www.bookmarx.cc/api/v1` — confirm this is the live API before release builds.
- Consider `app.config.ts` reading `process.env.APP_VARIANT` so dev builds point at `localhost`/`10.0.2.2` automatically.

### 7.3 Store submissions (from `PROGRESS.md` Phase 8, still unchecked)
- Google Play: AAB via `eas build --platform android --profile production` → `eas submit`.
- App Store: production build → `eas submit --platform ios` → TestFlight → review.

---

## Out of Scope / Future
- Google OAuth button on mobile (API endpoint exists; needs expo-auth-session + server-side token exchange work).
- Collections management UI on mobile (web editor covers this; mobile read-only for now).
- Push sync / background refresh (polling on app foreground is sufficient for v1).
- iPad/tablet layouts.

---

## Definition of Done
- [ ] `npx expo start` boots; login → browse → CRUD all work against dev API
- [ ] `npx tsc --noEmit` clean
- [ ] Shared store: edits propagate between screens with no stale state
- [ ] Unique device ID per install (verify two emulators register separately in `browsers`/sync history)
- [ ] Offline: queue → reconnect → converges with server
- [ ] Android share target works on a dev-client build
- [ ] iOS share extension works on device (macOS/EAS)
- [ ] EAS production build succeeds for Android (iOS when Mac available)
- [ ] Update `PROGRESS.md` Phase 5 checkboxes and add session log entry
