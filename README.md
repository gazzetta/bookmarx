# BookMarx — Stage 2: Multi-Platform

Cross-browser bookmark synchronization system with mobile app support.

## Current Status: Stage 2 + Stage 3 Development

**Stage 1 (Complete):** Chrome extension + Node.js server + SQLite database  
**Stage 2 (Mostly Implemented):** Multi-browser + mobile foundations are in repo; manual QA/release tasks remain  
**Stage 3 (Feature-Implemented, Validation Ongoing):** Premium tiers, collections, sessions, and web editor are implemented

---

## Supported Platforms (Target)

### Desktop Browsers
| Browser | Status | Notes |
|---------|--------|-------|
| Chrome | ✅ Stage 1 | Full support |
| Brave | ✅ Stage 1 | Same build as Chrome |
| Edge | 🟡 Stage 2 | Detection/build-ready, manual QA pending |
| Firefox | 🟡 Stage 2 | Manifest v2 + polyfill in place, manual QA pending |

### Mobile
| Platform | Status | Notes |
|----------|--------|-------|
| iOS | 🟡 Stage 2 | React Native app + Share Extension scaffolded; device QA pending |
| Android | 🟡 Stage 2 | React Native app + Share Intent scaffolded; device QA pending |

---

## Project Structure

```
bookmarx/
├── src/
│   ├── website/            # Next.js app + unified API runtime
│   │   └── data/           # SQLite database (single source)
│   ├── extension/          # Browser extension (Chrome/Firefox)
│   └── mobile/             # React Native app (Stage 2)
├── docs/                   # Stage 2 documentation
│   └── STAGE-2-BUILD-PLAN.md
├── stage-1/                # Archived Stage 1 docs
│   ├── docs/
│   ├── README.md
│   └── PROGRESS.md
├── README.md               # This file
└── PROGRESS.md             # Stage 2 progress tracking
```

---

## Quick Start (Development)

### 1. Start the Unified Website + API
```powershell
cd 'c:\CODING\bookmarx\src\website'
npm install
npm run dev
```

### 2. Build the Extension
```powershell
cd 'c:\CODING\bookmarx\src\extension'
npm install
npm run build
```

### 3. Load in Browser
- **Chrome/Brave/Edge:** Go to `chrome://extensions` / `brave://extensions` / `edge://extensions`
- Enable Developer mode
- Click "Load unpacked" → select `src/extension/dist`

---

## Stage 2 Build Plan

See [docs/STAGE-2-BUILD-PLAN.md](docs/STAGE-2-BUILD-PLAN.md) for the complete implementation plan covering:

1. **Backend Refactor** - masterId system for cross-device editing
2. **Browser Detection** - Proper Edge/Brave/Firefox identification
3. **Firefox Port** - WebExtension polyfill + manifest v2
4. **Mobile App** - React Native iOS/Android
5. **Share Extensions** - iOS Share Extension + Android Share Intent
6. **Production Deployment** - Server, stores, certificates

## Stage 3 Build Plan (Premium)

See [docs/STAGE-3-BUILD-PLAN.md](docs/STAGE-3-BUILD-PLAN.md) for premium feature rollout:

1. **Tier & Limits** - Free vs Premium enforcement
2. **Sessions API** - History, rollback, restore
3. **Collections API** - Collection CRUD + editor changes endpoint
4. **Web Editor** - Next.js collection management experience
5. **Mobile Gating** - Premium access paths for mobile

## Latest Validation Snapshot (2026-02-12)

- ✅ Extension bundles compile for Chrome and Firefox
- ✅ Unified website build compiles API + Next.js successfully
- ⚠️ Manual browser/device smoke tests are still required before calling release-ready
- ✅ Mobile TypeScript check passes in `src/mobile` (`npx tsc --noEmit`)

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/register` | Register new user |
| POST | `/api/v1/auth/login` | Login with email/password |
| POST | `/api/v1/auth/google` | Login with Google |
| GET | `/api/v1/auth/me` | Get current user |
| POST | `/api/v1/sync` | Sync changes (CREATE/UPDATE/DELETE/MOVE) |
| POST | `/api/v1/sync/initial` | Initial full sync |
| GET | `/api/v1/sync/status` | Check sync status |
| GET | `/api/v1/sync/master-collection` | Fetch full master collection |
| GET | `/api/v1/sync/master-summary` | Get collection stats |
| POST | `/api/v1/capture` | Quick URL capture (Stage 2) |

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Browser Ext    │     │  Mobile App     │     │  Node.js API    │
│  (Chrome/FF/    │────▶│  (iOS/Android)  │────▶│  Server         │
│   Edge/Brave)   │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                                                         ▼
                                                ┌─────────────────┐
                                                │  SQLite DB      │
                                                │  (Master        │
                                                │   Collection)   │
                                                └─────────────────┘
```

---

## Stage 1 Reference

All Stage 1 documentation has been archived to `stage-1/`:
- `stage-1/README.md` - Original technical summary
- `stage-1/PROGRESS.md` - Stage 1 progress tracking
- `stage-1/docs/` - Detailed design documents

---

## License

MIT
