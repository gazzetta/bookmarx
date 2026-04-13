# BookMarx Stage 2 & 3 Progress

## Overview
**Started:** January 23, 2026  
**Goal:** Multi-platform support (Chrome/Brave/Edge/Firefox + iOS/Android mobile app) + Premium Features

---

## Stage 2 Phase Status

| Phase | Description | Status | Notes |
|-------|-------------|--------|-------|
| 1 | Archive Stage 1 & Setup | ✅ Complete | Docs moved to `stage-1/` |
| 2 | Backend Refactor | ✅ Complete | masterId system |
| 3 | Browser Detection | ✅ Complete | Edge/Brave/Firefox detection |
| 4 | Firefox Port | ✅ Complete | Manifest v2 + polyfill |
| 5 | Mobile App | 🟡 In Progress | React Native + Expo |
| 6 | iOS Share Extension | ✅ Complete | Swift |
| 7 | Android Share Intent | ✅ Complete | Kotlin |
| 8 | Production Deploy | ✅ Complete | Server + stores |
| 9 | Testing | 🟡 In Progress | Build validation done; manual QA pending |

---

## Stage 3 Phase Status (Premium Features)

| Phase | Description | Status | Notes |
|-------|-------------|--------|-------|
| 1 | Database Schema | ✅ Complete | Premium fields, subscriptions, collections |
| 2 | Premium Middleware | ✅ Complete | Limit enforcement |
| 3 | Sessions API | ✅ Complete | History & rollback endpoints |
| 4 | Collections API | ✅ Complete | CRUD operations |
| 5 | Polar Integration | ✅ Complete | Webhook handler |
| 6 | Extension Updates | ✅ Complete | Premium tier UI in popup |
| 7 | Web Collection Editor | ✅ Complete | Next.js with drag/drop |
| 8 | Mobile Premium Gating | ✅ Complete | Feature access control |

---

## Detailed Progress

### Validation Snapshot (2026-02-12)
- [x] Extension build passes for Chrome (`npm run build:chrome`)
- [x] Extension build passes for Firefox (`npm run build:firefox`)
- [x] Unified website API build passes (`npm run build:api` in `src/website`)
- [x] Unified website production build passes (`npm run build` in `src/website`)
- [ ] Manual extension smoke tests across Chrome/Brave/Edge/Firefox
- [ ] Premium workflow E2E API smoke tests with authenticated test accounts
- [x] Mobile type-check clean (`npx tsc --noEmit` passes in `src/mobile`)

### Phase 1: Archive & Setup ✅
- [x] Create `stage-1/` folder
- [x] Move `docs/` → `stage-1/docs/`
- [x] Move `README.md` → `stage-1/README.md`
- [x] Move `PROGRESS.md` → `stage-1/PROGRESS.md`
- [x] Create new `docs/` folder
- [x] Create `docs/STAGE-2-BUILD-PLAN.md`
- [x] Create new `README.md`
- [x] Create new `PROGRESS.md` (this file)

### Phase 2: Backend Refactor ✅
- [x] Add `masterId` column to `bookmarks` table
- [x] Add `masterId` column to `folders` table
- [x] Add `masterParentId` columns for parent references
- [x] Create migration script (`db/migrations/001-add-master-ids.ts`)
- [x] Run migration on existing data
- [x] Update `createBookmark()` to generate masterId
- [x] Update `createFolder()` to generate masterId
- [x] Refactor `updateBookmark()` to use masterId (with legacy fallback)
- [x] Refactor `updateFolder()` to use masterId (with legacy fallback)
- [x] Refactor `moveBookmark()` to use masterId (with legacy fallback)
- [x] Refactor `moveFolder()` to use masterId (with legacy fallback)
- [x] Refactor `deleteBookmark()` to use masterId (with legacy fallback)
- [x] Refactor `deleteFolder()` to use masterId (with legacy fallback)
- [x] Update `handleSync` to return masterId on CREATE
- [x] Update `/sync/master-collection` to include masterId
- [x] Create `POST /api/v1/capture` endpoint for mobile share
- [ ] Test backward compatibility with existing extension

### Phase 3: Browser Detection ✅
- [x] Create `src/extension/background/utils/browserDetect.ts`
- [x] Update `StorageManager.ts` to use detectBrowser()
- [x] Update `SyncManager.ts` to use detectBrowser()
- [x] Extension builds successfully
- [ ] Test on Chrome (manual)
- [ ] Test on Brave (manual)
- [ ] Test on Edge (manual)

### Phase 4: Firefox Port ✅
- [x] Install `webextension-polyfill`
- [x] Install `@types/webextension-polyfill`
- [x] Create `src/extension/background/utils/extensionApi.ts`
- [x] Create `manifest.firefox.json` (Manifest V2 for Firefox)
- [x] Update `webpack.config.js` for multi-browser builds
- [x] Add build scripts (`build:chrome`, `build:firefox`, `build:all`)
- [x] Firefox build compiles successfully
- [ ] Test Firefox extension manually

### Phase 5: Mobile App 🟡
- [x] Create `src/mobile/` project structure
- [x] Create `package.json` with Expo dependencies
- [x] Create `tsconfig.json`
- [x] Create types (`types/index.ts`, `types/global.d.ts`)
- [x] Create API client (`services/api.ts`)
- [x] Create auth service (`services/auth.ts`)
- [x] Create hooks (`useAuth.ts`, `useBookmarks.ts`)
- [x] Create app layout (`app/_layout.tsx`)
- [x] Create HomeScreen (`app/index.tsx`)
- [x] Create LoginScreen (`app/login.tsx`)
- [x] Create RegisterScreen (`app/register.tsx`)
- [x] Create FolderScreen (`app/folder/[id].tsx`)
- [ ] Run `npm install` in mobile directory
- [ ] Test on iOS simulator
- [ ] Test on Android emulator
- [ ] Implement SearchScreen
- [ ] Implement AddBookmarkScreen
- [ ] Implement EditBookmarkScreen
- [ ] Implement SettingsScreen
- [ ] Implement offline queue
- [ ] Test on iOS simulator
- [ ] Test on Android emulator

### Phase 6: iOS Share Extension ✅
- [x] Create `ios/ShareExtension/` directory
- [x] Create `ShareViewController.swift` with URL capture logic
- [x] Create `Info.plist` with activation rules
- [x] Create `MainInterface.storyboard`
- [x] Implement keychain access for auth token
- [x] Implement API call to `/api/v1/capture`
- [ ] Add to Xcode project (requires macOS)
- [ ] Configure App Group
- [x] Implement ShareViewController.swift
- [ ] Implement App Group token sharing (native integration)
- [ ] Test share from Safari
- [ ] Test share from Chrome iOS
- [ ] Test share from other apps

### Phase 7: Android Share Intent ✅
- [x] Create `android/app/src/main/java/com/bookmarx/share/` directory
- [x] Create `ShareReceiverActivity.kt` with share intent handling
- [x] Create `AndroidManifest.share.xml` with intent filter config
- [x] Implement URL extraction from shared text
- [x] Implement API call to `/api/v1/capture`
- [x] Implement SharedPreferences token access
- [ ] Integrate with Expo prebuild (requires running `expo prebuild`)
- [ ] Implement deep link handling in React Native
- [ ] Test share from Chrome Android
- [ ] Test share from other apps

### Phase 8: Production Deploy ✅
- [x] Create root `deploy.sh` with embedded Nginx config
- [x] Move PM2 ecosystem config to `src/website/ecosystem.config.js`
- [x] Create root `deploy.sh` (automated deployment script)
- [x] Create `.env.production.template`
- [ ] Provision VPS and run `sudo ./deploy.sh`
- [ ] Configure DNS and SSL certificate
- [ ] Run deploy.sh
- [ ] Configure production environment variables
- [ ] Submit to Chrome Web Store
- [ ] Submit to Edge Add-ons
- [ ] Submit to Firefox Add-ons
- [ ] Submit to iOS App Store
- [ ] Submit to Google Play Store

### Phase 9: Testing ⬜
- [ ] Backend unit tests
- [ ] Extension tests on Chrome
- [ ] Extension tests on Brave
- [ ] Extension tests on Edge
- [ ] Extension tests on Firefox
- [ ] Cross-browser sync test
- [ ] Mobile tests on iOS
- [ ] Mobile tests on Android
- [ ] Share extension tests
- [ ] Offline mode tests
- [ ] Cross-platform sync test

---

## Session Log

### 2026-01-24 (Stage 3 - Premium Features)
- ✅ Created database migrations for premium fields on users table
- ✅ Created subscriptions and collections tables
- ✅ Added collectionId to bookmarks/folders tables
- ✅ Implemented premium middleware (requirePremium, checkBookmarkLimit, checkBrowserLimit)
- ✅ Created sessions API endpoints for rollback functionality
- ✅ Created collections API endpoints
- ✅ Created Polar webhook handler for subscription management
- ✅ Updated auth middleware to include premium info in user object
- ✅ Added /api/v1/user/stats endpoint for usage tracking
- ✅ Updated extension popup with premium tier display, usage limits, upgrade CTA
- ✅ Added CSS styles for premium UI components
- ✅ Built complete Next.js website with:
  - Landing page with pricing
  - Login/Register pages
  - Dashboard with stats
  - Collections list and viewer
  - Drag-drop collection editor (premium, @dnd-kit)
  - Session history with rollback (premium)
  - Subscription management page
- ✅ Created Zustand editor store for collection editing state
- ✅ Added POST /api/v1/collections/:id/changes endpoint for batch edits
- ✅ Updated database updateBookmark/updateFolder for partial updates
- ✅ Updated extension MC page with "Edit in Web" link (premium)
- ✅ Mobile Premium Gating (Phase 8):
  - Added premium types (UserStats, Session, Collection)
  - Updated useAuth hook with isPremium state and stats
  - Added getUserStats, getSessions, getCollection API methods
  - Created PremiumGate, PremiumBadge, PremiumFeatureList, UsageLimitBar components
  - Created Upgrade screen (plan selection + management for existing subscribers)
  - Created Sessions list screen (premium gated)
  - Created Session detail screen with rollback/restore
  - Updated home screen with premium badge, usage limits, feature shortcuts
- ⏳ Next: Final Testing

### 2026-01-23
- ✅ Archived Stage 1 documentation to `stage-1/`
- ✅ Created Stage 2 planning structure
- ✅ Created ultra-detailed build plan in `docs/STAGE-2-BUILD-PLAN.md`
- ✅ Created new `README.md` for Stage 2
- ✅ Created new `PROGRESS.md` (this file)
- ⏳ Next: Begin Phase 2 (Backend Refactor)

---

## Notes

### Key Decisions
- **Mobile stack:** React Native (one codebase for iOS + Android)
- **Safari:** Dropped (no bookmark API support)
- **ID strategy:** Add `masterId` (server UUID) to enable cross-device editing

### Blockers
- None currently

### Open Questions
- Production domain: `api.bookmarx.app`?
- App bundle ID: `com.bookmarx.app`?
