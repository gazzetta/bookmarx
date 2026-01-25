

# BookMarx Chrome Extension - Technical Summary

## Overview
BookMarx is a **cross-browser bookmark synchronization system** that maintains a master collection on a server and syncs bookmarks across multiple Chrome browser instances. Users can authenticate, sync local changes to the server, pull remote changes, and overwrite local bookmarks from the master collection.

---

## Architecture

### Three-Tier System:
1. **Chrome Extension** (client) - Monitors bookmarks, manages sync, provides UI
2. **Node.js API Server** - Handles auth, stores master collection, processes sync requests
3. **SQLite Database** - Stores users, bookmarks, folders, browsers, sync history

---

## Main Extension Files

### **Core Background Scripts** (`src/extension/background/`)

#### [index.ts](cci:7://file:///c:/CODING/bookmarx/src/extension/popup/index.ts:0:0-0:0) - Background Service Worker
- Entry point for background service
- Initializes `BookmarkManager`, [SyncManager](cci:2://file:///c:/CODING/bookmarx/src/extension/background/SyncManager.ts:30:0-818:1), [StorageManager](cci:2://file:///c:/CODING/bookmarx/src/extension/background/StorageManager.ts:23:0-276:1)
- Handles runtime message listeners for:
  - Sync requests
  - Sync status checks
  - Auth management
  - Master collection operations
- Manages sync notifications
- Chrome API: `chrome.runtime`, `chrome.notifications`

#### `BookmarkManager.ts`
- Listens to Chrome bookmark events:
  - `chrome.bookmarks.onCreated`
  - `chrome.bookmarks.onChanged`
  - `chrome.bookmarks.onMoved`
  - `chrome.bookmarks.onRemoved`
- Queues local changes for sync (when not suppressed)
- Suppression mechanism to prevent re-queueing server-applied changes

#### [SyncManager.ts](cci:7://file:///c:/CODING/bookmarx/src/extension/background/SyncManager.ts:0:0-0:0) - **Core Sync Logic**
- [sync()](cci:1://file:///c:/CODING/bookmarx/src/extension/background/SyncManager.ts:51:4-108:5) - Main sync orchestration
- [sendInitialSync()](cci:1://file:///c:/CODING/bookmarx/src/extension/background/SyncManager.ts:185:4-269:5) - First-time full upload
- [sendChangesToServer()](cci:1://file:///c:/CODING/bookmarx/src/extension/background/SyncManager.ts:110:4-183:5) - Send queued local changes
- [applyServerChanges()](cci:1://file:///c:/CODING/bookmarx/src/extension/background/SyncManager.ts:309:4-342:5) - Apply remote changes locally
- [overwriteFromMaster()](cci:1://file:///c:/CODING/bookmarx/src/extension/background/SyncManager.ts:520:4-558:5) - Replace local bookmarks with master collection
- [restoreFromMasterCollection()](cci:1://file:///c:/CODING/bookmarx/src/extension/background/SyncManager.ts:622:4-817:5) - Rebuild bookmark tree from server data
- Uses `fetch()` for API calls

#### [StorageManager.ts](cci:7://file:///c:/CODING/bookmarx/src/extension/background/StorageManager.ts:0:0-0:0)
- Manages `chrome.storage.local`:
  - Auth tokens
  - User info
  - Queued changes
  - Device/browser instance IDs
  - Last sync timestamp
  - Queue suppression flags
- Provides helpers: [queueChange()](cci:1://file:///c:/CODING/bookmarx/src/extension/background/StorageManager.ts:66:4-95:5), [getQueuedChanges()](cci:1://file:///c:/CODING/bookmarx/src/extension/background/StorageManager.ts:146:4-149:5), [clearQueuedChanges()](cci:1://file:///c:/CODING/bookmarx/src/extension/background/StorageManager.ts:156:4-162:5)

---

### **Popup UI** (`src/extension/popup/`)

#### [index.html](cci:7://file:///c:/CODING/bookmarx/src/extension/popup/index.html:0:0-0:0) + [index.ts](cci:7://file:///c:/CODING/bookmarx/src/extension/popup/index.ts:0:0-0:0) + [styles.css](cci:7://file:///c:/CODING/bookmarx/src/extension/popup/styles.css:0:0-0:0)
- Extension popup interface showing:
  - Auth status (login/logout)
  - Sync stats (local/remote bookmarks + folders, pending changes)
  - "Sync Now" button
  - "Overwrite from Master Collection" button
  - "View Master Collection" button
  - Initial sync notice for new accounts
- Uses `chrome.runtime.sendMessage()` to communicate with background

---

### **Master Collection Viewer** (`src/extension/pages/`)

#### [master-collection.html](cci:7://file:///c:/CODING/bookmarx/src/extension/pages/master-collection.html:0:0-0:0) + `master-collection.ts` + [styles.css](cci:7://file:///c:/CODING/bookmarx/src/extension/popup/styles.css:0:0-0:0)
- Full-page view of master collection
- Fetches bookmark tree from server API
- Displays hierarchical folder/bookmark structure
- Shows created/edited timestamps
- Opens in new tab via `chrome.tabs.create()`

---

### **Components** (`src/extension/components/`)

#### `SyncConfirmDialog.ts`
- Reusable confirmation dialog for sync actions
- Shows local/remote change counts before sync

---

### **Build Configuration**

#### [manifest.json](cci:7://file:///c:/CODING/bookmarx/src/manifest.json:0:0-0:0)
- Chrome extension manifest v3
- Declares permissions: `bookmarks`, `storage`, `identity`, `notifications`
- Defines background service worker
- Specifies popup and web-accessible resources

#### [webpack.config.js](cci:7://file:///c:/CODING/bookmarx/src/extension/webpack.config.js:0:0-0:0)
- Bundles TypeScript to JavaScript
- Copies assets (HTML, CSS, icons) to `dist/`
- Entry points: [background/index.ts](cci:7://file:///c:/CODING/bookmarx/src/extension/background/index.ts:0:0-0:0), [popup/index.ts](cci:7://file:///c:/CODING/bookmarx/src/extension/popup/index.ts:0:0-0:0), `pages/master-collection.ts`

#### [package.json](cci:7://file:///c:/CODING/bookmarx/package.json:0:0-0:0)
- Scripts: `build`, `watch`, `dev`
- Dependencies: TypeScript, Webpack, ts-loader, copy-webpack-plugin

---

## Server API Endpoints ([src/server/server.ts](cci:7://file:///c:/CODING/bookmarx/src/server/server.ts:0:0-0:0))

### Auth:
- `POST /api/v1/auth/register` - Email/password registration
- `POST /api/v1/auth/login` - Email/password login
- `POST /api/v1/auth/google` - Google OAuth (not fully implemented)

### Sync:
- `POST /api/v1/sync` - Standard sync (send/receive changes)
- `POST /api/v1/sync/initial` - Initial sync (full upload)
- `GET /api/v1/sync/status` - Check if initial sync needed, get pending changes
- `GET /api/v1/sync/master-summary` - Get master collection counts

### Bookmarks:
- `GET /api/v1/bookmarks/tree/:userId` - Fetch master collection tree

---

## Database Schema ([src/server/db/schema.sql](cci:7://file:///c:/CODING/bookmarx/src/server/db/schema.sql:0:0-0:0))

### Tables:
- **users** - userId, email, passwordHash, googleId, createdAt
- **bookmarks** - browserId, browserInstanceId, userId, title, url, parentId, position, status, timestamps, syncVersion
- **folders** - browserId, browserInstanceId, userId, title, parentId, position, status, timestamps
- **browsers** - browserInstanceId, userId, deviceId, name, lastSyncAt
- **sync_history** - userId, browserInstanceId, timestamp, status, changeCount

---

## Chrome-Specific APIs (Porting Considerations)

### **Critical APIs Used:**
1. **`chrome.bookmarks.*`** - Core bookmark operations
   - `getTree()`, `create()`, `update()`, `move()`, `remove()`
   - Event listeners: `onCreated`, `onChanged`, `onMoved`, `onRemoved`

2. **`chrome.storage.local`** - Local persistent storage
   - Used for auth, queued changes, sync state

3. **`chrome.runtime.*`** - Extension messaging
   - `sendMessage()`, `onMessage` for popup ↔ background communication
   - `getURL()` for loading extension assets

4. **`chrome.notifications.*`** - Sync status notifications

5. **`chrome.tabs.create()`** - Open master collection page

6. **`chrome.identity.*`** - OAuth (not actively used yet)

### **Standard Web APIs:**
- `fetch()` for HTTP requests
- `Promise`, `async/await`
- Standard DOM APIs in popup/pages

---

## Key Concepts

### **Browser Instance ID:**
Each browser installation gets a unique ID to track which changes came from which browser.

### **Queue Suppression:**
Flag to prevent bookmark events from being queued when applying server changes or during overwrite operations.

### **Sync Flow:**
1. Extension detects local bookmark changes → queues them
2. User clicks "Sync Now"
3. Extension sends queued changes to server
4. Server applies changes, returns remote changes
5. Extension applies remote changes to local bookmarks
6. Extension clears queue, updates last sync timestamp

### **Overwrite Flow:**
1. User clicks "Overwrite from Master Collection"
2. Extension fetches master collection tree
3. Extension deletes all local bookmarks
4. Extension rebuilds bookmark tree from master data
5. Extension clears queued changes

---

## Dependencies

### Extension:
- TypeScript
- Webpack + ts-loader
- Chrome Types (`@types/chrome`)
- No external UI frameworks (vanilla JS)

### Server:
- Node.js + Express
- SQLite (`better-sqlite3`)
- JWT (`jsonwebtoken`)
- bcryptjs (password hashing)

---

## Current State & Known Issues

✅ **Working:**
- Auth (email/password)
- Initial sync
- Standard sync (bidirectional)
- Overwrite from master
- Master collection viewer
- Sync notifications
- Split bookmark/folder display in popup

🔧 **Recent Fixes:**
- Initial sync detection now uses master collection count (not per-browser)
- Overwrite hierarchy preservation
- Suppression of false pending changes after overwrite

⚠️ **Limitations:**
- Google OAuth not fully implemented
- No conflict resolution (last-write-wins)
- Pending changes don't split by bookmark/folder type in display

---


## Build Extesion
C:\CODING\bookmarx\src\extension>npm run build:clean

## Start Backend on 3005
C:\CODING\bookmarx\src\server>npm run dev

## View DB on command line
C:\CODING\bookmarx\src\data>sqlite3 bookmarx.db

## Clear DB
DELETE FROM sync_history_errors;DELETE FROM sync_history;DELETE FROM bookmarks;DELETE FROM folders;DELETE FROM browsers;

## Test sync notifications (extension)
1. Build and load the extension, then sign in.
2. **Local pending changes (sync up):** create/update/move/delete a bookmark locally. Wait up to ~5 minutes or open the popup to trigger `getSyncStatus`. You should see a notification that local changes are ready to sync.
3. **Remote pending changes (sync down):** in a second browser instance logged into the same account, make bookmark changes and sync them. In the first browser, wait up to ~5 minutes or open the popup to trigger `getSyncStatus`. You should see a notification about master collection updates.
4. Notifications are informational only (no auto-sync).