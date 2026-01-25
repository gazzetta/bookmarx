# BookMarx Stage 2 — Ultra-Detailed Build Plan

## Overview
**Goal:** Extend BookMarx from Chrome-only to multi-platform (Chrome/Brave/Edge + Firefox + Mobile iOS/Android) with production-ready infrastructure.

**End State:**
- Extension works on Chrome, Brave, Edge, Firefox
- Mobile app (React Native) for iOS + Android with share-sheet capture
- Backend supports mobile editing (no browserInstanceId lock)
- Production deployment ready

---

## Phase 1: Archive Stage 1 & Setup Stage 2 Structure ✅

### 1.1 Archive Stage 1 artifacts
- [x] Create `stage-1/` folder
- [x] Move `docs/` to `stage-1/docs/`
- [x] Move `README.md` to `stage-1/README.md`
- [x] Move `PROGRESS.md` to `stage-1/PROGRESS.md`

### 1.2 Create Stage 2 structure
- [x] Create new `docs/` folder
- [x] Create `docs/STAGE-2-BUILD-PLAN.md` (this file)
- [x] Create `README.md` (Stage 2 overview)
- [x] Create `PROGRESS.md` (Stage 2 tracking)

---

## Phase 2: Backend Refactor (Critical for Mobile)

### 2.1 Problem
Current DB operations use `WHERE browserId = ? AND browserInstanceId = ?`
- Mobile app cannot update/delete items created by desktop extension
- Need: items editable by ANY authenticated client for that user

### 2.2 Schema Changes
**File:** `src/server/db/schema.sql`

Add new column for server-side canonical IDs:
```sql
-- Add to bookmarks table
ALTER TABLE bookmarks ADD COLUMN masterId TEXT UNIQUE;

-- Add to folders table  
ALTER TABLE folders ADD COLUMN masterId TEXT UNIQUE;

-- Create index
CREATE INDEX IF NOT EXISTS idx_bookmarks_masterid ON bookmarks(masterId);
CREATE INDEX IF NOT EXISTS idx_folders_masterid ON folders(masterId);
```

### 2.3 Migration Script
**File:** `src/server/db/migrations/001-add-master-ids.ts`
- Generate UUIDs for all existing bookmarks/folders
- Set `masterId = UUID` for each row
- Log migration results

### 2.4 Database Operations Refactor
**File:** `src/server/db/database.ts`

#### 2.4.1 Update `createBookmark`
- Generate `masterId = crypto.randomUUID()` on insert
- Return the `masterId` in response

#### 2.4.2 Update `createFolder`
- Generate `masterId = crypto.randomUUID()` on insert
- Return the `masterId` in response

#### 2.4.3 Refactor `updateBookmark`
Change FROM:
```sql
WHERE browserId = ? AND browserInstanceId = ?
```
TO:
```sql
WHERE masterId = ? AND userId = ?
```

#### 2.4.4 Refactor `updateFolder`
Same pattern as updateBookmark

#### 2.4.5 Refactor `moveBookmark`
Same pattern

#### 2.4.6 Refactor `moveFolder`
Same pattern

#### 2.4.7 Refactor `deleteBookmark`
Same pattern

#### 2.4.8 Refactor `deleteFolder`
Same pattern

### 2.5 API Changes
**File:** `src/server/server.ts`

#### 2.5.1 Update `handleSync` 
- Accept `masterId` in change payloads (for updates/moves/deletes)
- For CREATE: return the new `masterId` in response
- For UPDATE/MOVE/DELETE: use `masterId` to locate item

#### 2.5.2 Update `/api/v1/sync/master-collection`
- Include `masterId` in returned bookmarks/folders

#### 2.5.3 New endpoint: `POST /api/v1/capture`
**Purpose:** Simple URL capture for share sheet
```typescript
// Request
{ url: string, title?: string, parentId?: string }

// Response
{ success: true, data: { masterId: string, ... } }
```

### 2.6 Extension Compatibility
**File:** `src/extension/background/SyncManager.ts`

- Store `masterId` mapping locally after sync
- Use `masterId` for subsequent updates/deletes
- Backward compatible: if no masterId, fall back to browserId

---

## Phase 3: Browser Detection & Edge Support

### 3.1 Browser Detection Utility
**File:** `src/extension/background/utils/browserDetect.ts`

```typescript
interface BrowserInfo {
  name: 'Chrome' | 'Brave' | 'Edge' | 'Firefox' | 'Unknown';
  version: string;
}

export function detectBrowser(): BrowserInfo {
  const ua = navigator.userAgent;
  
  if (ua.includes('Edg/')) {
    return { name: 'Edge', version: ua.match(/Edg\/([0-9.]+)/)?.[1] || '' };
  }
  if ((navigator as any).brave) {
    return { name: 'Brave', version: ua.match(/Chrome\/([0-9.]+)/)?.[1] || '' };
  }
  if (ua.includes('Firefox/')) {
    return { name: 'Firefox', version: ua.match(/Firefox\/([0-9.]+)/)?.[1] || '' };
  }
  if (ua.includes('Chrome/')) {
    return { name: 'Chrome', version: ua.match(/Chrome\/([0-9.]+)/)?.[1] || '' };
  }
  return { name: 'Unknown', version: '' };
}
```

### 3.2 Update StorageManager
**File:** `src/extension/background/StorageManager.ts`

- Replace hardcoded `'Chrome'` with `detectBrowser()`
- Update `getBrowserInfo()` method

### 3.3 Update SyncManager
**File:** `src/extension/background/SyncManager.ts`

- Use `detectBrowser()` for deviceInfo
- Remove hardcoded Chrome references

---

## Phase 4: Firefox Extension Port

### 4.1 WebExtension Polyfill
**Install:** `npm install webextension-polyfill` in `src/extension`

### 4.2 API Abstraction Layer
**File:** `src/extension/background/utils/extensionApi.ts`

```typescript
import browser from 'webextension-polyfill';

// Use browser.* (promise-based) everywhere
export const ext = {
  bookmarks: browser.bookmarks,
  storage: browser.storage,
  runtime: browser.runtime,
  tabs: browser.tabs,
  notifications: browser.notifications,
  alarms: browser.alarms
};
```

### 4.3 Replace All `chrome.*` Calls
Files to update:
- `src/extension/background/index.ts`
- `src/extension/background/BookmarkManager.ts`
- `src/extension/background/SyncManager.ts`
- `src/extension/background/StorageManager.ts`
- `src/extension/popup/index.ts`
- `src/extension/pages/master-collection.ts`

Pattern:
```typescript
// FROM
chrome.bookmarks.getTree()
// TO
import { ext } from './utils/extensionApi';
ext.bookmarks.getTree()
```

### 4.4 Firefox Manifest
**File:** `src/extension/manifest.firefox.json`

```json
{
  "manifest_version": 2,
  "name": "BookMarx",
  "version": "1.0.0",
  "description": "Cross-browser bookmark synchronization",
  "permissions": [
    "bookmarks",
    "storage",
    "identity",
    "alarms",
    "notifications"
  ],
  "background": {
    "scripts": ["background/index.js"],
    "persistent": false
  },
  "browser_action": {
    "default_popup": "popup/index.html"
  },
  "web_accessible_resources": [
    "pages/*"
  ]
}
```

### 4.5 Build Script Updates
**File:** `src/extension/package.json`

Add scripts:
```json
{
  "scripts": {
    "build:chrome": "webpack --config webpack.config.js --env browser=chrome",
    "build:firefox": "webpack --config webpack.config.js --env browser=firefox",
    "build:all": "npm run build:chrome && npm run build:firefox"
  }
}
```

### 4.6 Webpack Config Update
**File:** `src/extension/webpack.config.js`

- Accept `--env browser` parameter
- Copy correct manifest based on target
- Output to `dist-chrome/` or `dist-firefox/`

---

## Phase 5: Mobile App (React Native)

### 5.1 Project Setup
```bash
npx react-native init BookMarxMobile --template react-native-template-typescript
cd BookMarxMobile
```

### 5.2 Dependencies
```bash
npm install @react-navigation/native @react-navigation/stack
npm install react-native-screens react-native-safe-area-context
npm install @react-native-async-storage/async-storage
npm install react-native-gesture-handler
npm install react-native-reanimated
npm install axios
npm install react-native-url-polyfill
```

### 5.3 Project Structure
```
src/mobile/
├── App.tsx
├── api/
│   ├── client.ts          # Axios instance with auth
│   ├── auth.ts            # Login/register
│   ├── bookmarks.ts       # Fetch/create/update/delete
│   └── capture.ts         # Share capture endpoint
├── components/
│   ├── BookmarkItem.tsx
│   ├── FolderItem.tsx
│   ├── SearchBar.tsx
│   └── FolderPicker.tsx
├── screens/
│   ├── LoginScreen.tsx
│   ├── HomeScreen.tsx
│   ├── FolderScreen.tsx
│   ├── SearchScreen.tsx
│   ├── AddBookmarkScreen.tsx
│   ├── EditBookmarkScreen.tsx
│   └── SettingsScreen.tsx
├── store/
│   ├── authStore.ts       # Auth state
│   ├── bookmarkStore.ts   # Cached master collection
│   └── syncQueue.ts       # Offline change queue
├── utils/
│   ├── storage.ts         # AsyncStorage helpers
│   ├── linking.ts         # Open URLs in browser
│   └── deviceInfo.ts      # Device ID generation
└── types/
    └── index.ts           # TypeScript types
```

### 5.4 API Client
**File:** `src/mobile/api/client.ts`

```typescript
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE = 'https://api.bookmarx.app/api/v1'; // Production URL

export const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
});

apiClient.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const deviceId = await getOrCreateDeviceId();
  config.headers['X-Device-ID'] = deviceId;
  return config;
});
```

### 5.5 Auth Flow
**File:** `src/mobile/api/auth.ts`

- `login(email, password)` → store token
- `register(email, password)` → store token
- `loginWithGoogle()` → OAuth flow → store token
- `logout()` → clear token + cache

### 5.6 Bookmark Operations
**File:** `src/mobile/api/bookmarks.ts`

```typescript
export async function fetchMasterCollection() {
  const response = await apiClient.get('/sync/master-collection');
  return response.data.data; // { folders, bookmarks }
}

export async function createBookmark(data: CreateBookmarkInput) {
  const change = {
    type: 'CREATE',
    data: {
      type: 'bookmark',
      url: data.url,
      title: data.title,
      parentId: data.parentId,
      index: 0,
      dateAdded: Date.now()
    },
    timestamp: Date.now()
  };
  
  return apiClient.post('/sync', { changes: [change], deviceId });
}

export async function updateBookmark(masterId: string, data: UpdateInput) { ... }
export async function deleteBookmark(masterId: string) { ... }
export async function moveBookmark(masterId: string, newParentId: string) { ... }
```

### 5.7 Screens Implementation

#### 5.7.1 LoginScreen
- Email/password form
- Google sign-in button
- Register link
- Error handling

#### 5.7.2 HomeScreen
- Header with search icon + settings icon
- Master collection stats (X bookmarks, Y folders)
- Root folder list
- Pull-to-refresh

#### 5.7.3 FolderScreen
- Breadcrumb navigation
- List of subfolders + bookmarks
- Tap bookmark → open in default browser
- Long-press → action sheet (Edit, Move, Delete, Copy URL, Share)
- FAB for Add Bookmark / Add Folder

#### 5.7.4 SearchScreen
- Search input (auto-focus)
- Results list (bookmarks matching title/URL)
- Tap to open in browser

#### 5.7.5 AddBookmarkScreen
- URL input
- Title input (auto-fetch from URL if blank)
- Folder picker
- Save button

#### 5.7.6 EditBookmarkScreen
- Pre-filled URL + Title
- Folder picker for move
- Save / Delete buttons

#### 5.7.7 SettingsScreen
- Account info
- Logout button
- Export master collection
- About / Version

### 5.8 Offline Queue
**File:** `src/mobile/store/syncQueue.ts`

```typescript
interface QueuedChange {
  id: string;
  type: 'CREATE' | 'UPDATE' | 'DELETE' | 'MOVE';
  data: any;
  timestamp: number;
  retryCount: number;
}

export class SyncQueue {
  async add(change: Omit<QueuedChange, 'id' | 'retryCount'>);
  async process(); // Try to sync all queued changes
  async getAll(): QueuedChange[];
  async remove(id: string);
}
```

- Store in AsyncStorage
- Process on app foreground
- Process on network change (NetInfo)
- Max 3 retries per change

---

## Phase 6: iOS Share Extension

### 6.1 Create Share Extension Target
In Xcode:
- File → New → Target → Share Extension
- Name: `BookMarxShare`
- Language: Swift

### 6.2 App Group Setup
- Create App Group: `group.com.bookmarx.shared`
- Enable for main app + share extension
- Share auth token via App Group

### 6.3 Share Extension Implementation
**File:** `ios/BookMarxShare/ShareViewController.swift`

```swift
import UIKit
import Social
import MobileCoreServices

class ShareViewController: SLComposeServiceViewController {
    
    var sharedURL: URL?
    var sharedTitle: String?
    
    override func viewDidLoad() {
        super.viewDidLoad()
        extractSharedContent()
    }
    
    private func extractSharedContent() {
        guard let extensionItem = extensionContext?.inputItems.first as? NSExtensionItem,
              let attachments = extensionItem.attachments else { return }
        
        for attachment in attachments {
            if attachment.hasItemConformingToTypeIdentifier(kUTTypeURL as String) {
                attachment.loadItem(forTypeIdentifier: kUTTypeURL as String) { [weak self] url, error in
                    self?.sharedURL = url as? URL
                }
            }
        }
    }
    
    override func didSelectPost() {
        guard let url = sharedURL else {
            extensionContext?.completeRequest(returningItems: nil)
            return
        }
        
        // Get auth token from App Group
        let sharedDefaults = UserDefaults(suiteName: "group.com.bookmarx.shared")
        guard let token = sharedDefaults?.string(forKey: "authToken") else {
            // Show "Please sign in to BookMarx" alert
            return
        }
        
        // Send to API
        captureURL(url: url, token: token) { [weak self] success in
            self?.extensionContext?.completeRequest(returningItems: nil)
        }
    }
    
    private func captureURL(url: URL, token: String, completion: @escaping (Bool) -> Void) {
        // POST to /api/v1/capture
    }
}
```

### 6.4 React Native Bridge
**File:** `src/mobile/utils/shareExtension.ts`

- On app launch: copy auth token to App Group
- On logout: clear token from App Group

---

## Phase 7: Android Share Intent

### 7.1 Manifest Update
**File:** `android/app/src/main/AndroidManifest.xml`

```xml
<activity
    android:name=".ShareReceiverActivity"
    android:exported="true"
    android:theme="@style/Theme.Transparent">
    <intent-filter>
        <action android:name="android.intent.action.SEND" />
        <category android:name="android.intent.category.DEFAULT" />
        <data android:mimeType="text/plain" />
    </intent-filter>
</activity>
```

### 7.2 Share Receiver Activity
**File:** `android/app/src/main/java/.../ShareReceiverActivity.kt`

```kotlin
class ShareReceiverActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        if (intent?.action == Intent.ACTION_SEND) {
            intent.getStringExtra(Intent.EXTRA_TEXT)?.let { sharedText ->
                // Extract URL from shared text
                val url = extractURL(sharedText)
                
                // Launch React Native with deep link
                val deepLink = "bookmarx://capture?url=${URLEncoder.encode(url, "UTF-8")}"
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(deepLink)))
            }
        }
        finish()
    }
}
```

### 7.3 React Native Deep Link Handler
**File:** `src/mobile/App.tsx`

```typescript
import { Linking } from 'react-native';

useEffect(() => {
  const handleDeepLink = (event: { url: string }) => {
    const url = new URL(event.url);
    if (url.pathname === '/capture') {
      const sharedUrl = url.searchParams.get('url');
      navigation.navigate('AddBookmark', { url: sharedUrl });
    }
  };
  
  Linking.addEventListener('url', handleDeepLink);
  Linking.getInitialURL().then(url => url && handleDeepLink({ url }));
  
  return () => Linking.removeEventListener('url', handleDeepLink);
}, []);
```

---

## Phase 8: Production Infrastructure

### 8.1 Server Deployment
**Platform:** Hetzner VPS (as per docs)

#### 8.1.1 Server Setup
```bash
# On server
sudo apt update && sudo apt upgrade -y
sudo apt install -y nodejs npm nginx certbot python3-certbot-nginx

# Install PM2
sudo npm install -g pm2

# Clone repo
git clone https://github.com/youruser/bookmarx.git
cd bookmarx/src/server
npm install
npm run build
```

#### 8.1.2 PM2 Process
```bash
pm2 start dist/server.js --name bookmarx-api
pm2 save
pm2 startup
```

#### 8.1.3 Nginx Config
**File:** `/etc/nginx/sites-available/api.bookmarx.app`

```nginx
server {
    listen 80;
    server_name api.bookmarx.app;

    location / {
        proxy_pass http://127.0.0.1:3005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

#### 8.1.4 SSL Certificate
```bash
sudo certbot --nginx -d api.bookmarx.app
```

### 8.2 Environment Variables
**File:** `src/server/.env.production`

```env
NODE_ENV=production
PORT=3005
JWT_SECRET=<generate-256-bit-secret>
TOKEN_EXPIRY=30d
GOOGLE_CLIENT_ID=<your-google-client-id>
DATABASE_PATH=/var/lib/bookmarx/bookmarx.db
```

### 8.3 Extension Store Publishing

#### 8.3.1 Chrome Web Store
- Create developer account ($5 one-time)
- Zip `dist-chrome/` folder
- Upload + fill listing details
- Submit for review

#### 8.3.2 Edge Add-ons
- Create Microsoft Partner Center account
- Zip `dist-chrome/` folder (same build works)
- Upload + fill listing details
- Submit for review

#### 8.3.3 Firefox Add-ons
- Create Firefox Add-ons developer account
- Zip `dist-firefox/` folder
- Upload + fill listing details
- Submit for review

### 8.4 Mobile App Publishing

#### 8.4.1 iOS App Store
- Apple Developer Program ($99/year)
- Configure in App Store Connect
- Build with Xcode
- Submit for review

#### 8.4.2 Google Play Store
- Google Play Developer account ($25 one-time)
- Generate signed APK/AAB
- Upload to Play Console
- Submit for review

---

## Phase 9: Testing Checklist

### 9.1 Backend Tests
- [ ] Migration runs without errors
- [ ] createBookmark returns masterId
- [ ] updateBookmark works with masterId
- [ ] deleteBookmark works with masterId
- [ ] moveBookmark works with masterId
- [ ] /api/v1/capture creates bookmark
- [ ] Old extension still works (backward compat)

### 9.2 Extension Tests (per browser)
- [ ] Chrome: Install, login, sync, create, edit, delete, move
- [ ] Brave: Install, login, sync, create, edit, delete, move
- [ ] Edge: Install, login, sync, create, edit, delete, move
- [ ] Firefox: Install, login, sync, create, edit, delete, move
- [ ] Cross-browser: Create in Chrome, see in Firefox

### 9.3 Mobile Tests
- [ ] iOS: Login, view collection, open link, add bookmark, edit, delete, move
- [ ] iOS: Share sheet capture
- [ ] iOS: Offline queue + sync on reconnect
- [ ] Android: Same as iOS
- [ ] Android: Share intent capture
- [ ] Cross-platform: Create on mobile, see in extension

---

## Execution Order

**Day 1: Backend + Detection**
1. Phase 2 (Backend refactor)
2. Phase 3 (Browser detection)

**Day 2: Firefox Port**
3. Phase 4 (Firefox extension)

**Day 3-4: Mobile App**
4. Phase 5 (React Native app)
5. Phase 6 (iOS Share Extension)
6. Phase 7 (Android Share Intent)

**Day 5: Production**
7. Phase 8 (Deployment)
8. Phase 9 (Testing)

---

## Quick Reference: Key Files to Modify

### Backend
- `src/server/db/schema.sql` - Add masterId columns
- `src/server/db/database.ts` - Refactor all CRUD to use masterId
- `src/server/server.ts` - Update sync handlers, add /capture endpoint

### Extension
- `src/extension/background/utils/browserDetect.ts` - NEW
- `src/extension/background/utils/extensionApi.ts` - NEW
- `src/extension/background/StorageManager.ts` - Use detectBrowser()
- `src/extension/background/SyncManager.ts` - Use detectBrowser(), store masterId
- `src/extension/manifest.firefox.json` - NEW
- `src/extension/webpack.config.js` - Multi-browser builds
- `src/extension/package.json` - Add build scripts

### Mobile (NEW)
- `src/mobile/` - Entire new React Native app
