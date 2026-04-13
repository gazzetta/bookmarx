# BookMarx Stage 3 — Premium Features & Web-Based Collection Editor

## Overview
**Goal:** Add premium membership tiers, web-based Master Collection editor with drag/drop functionality, multiple collections support, and session rollback capabilities.

**End State:**
- Free vs Premium tier system with enforced limits
- Web-based Collection Editor (hosted on website, not extension)
- Multiple collections for premium users
- Session history with rollback functionality
- Improved mobile app access for premium members

---

## Current Sync Operations (Reference)

| Operation | Direction | Description |
|-----------|-----------|-------------|
| **Initial Sync** | Browser → Server | First-time upload to create Master Collection |
| **Merge Up** | Browser → Server | Add browser's new bookmarks to MC (deduplicated) |
| **Overwrite** | Server → Browser | Replace browser bookmarks with MC |

> Note: There is no "sync down" - the server is the source of truth. Browsers either contribute to it (merge) or get replaced by it (overwrite).

---

## Phase 1: Premium Tier Database Schema

### 1.1 Add Subscription Fields to Users
**File:** `src/server/db/schema.sql`

```sql
-- Add to users table
ALTER TABLE users ADD COLUMN subscriptionTier TEXT DEFAULT 'free';  -- free, premium
ALTER TABLE users ADD COLUMN subscriptionExpiresAt INTEGER;          -- Unix timestamp
ALTER TABLE users ADD COLUMN bookmarkLimit INTEGER DEFAULT 250;      -- Enforced limit
ALTER TABLE users ADD COLUMN browserLimit INTEGER DEFAULT 2;         -- Max synced browsers
ALTER TABLE users ADD COLUMN collectionLimit INTEGER DEFAULT 1;      -- Max collections
```

### 1.2 Create Subscriptions Table
**File:** `src/server/db/schema.sql`

```sql
CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    planType TEXT NOT NULL,           -- monthly, yearly, lifetime
    status TEXT NOT NULL,             -- active, cancelled, expired, trialing
    amount INTEGER NOT NULL,          -- Amount in cents
    currency TEXT DEFAULT 'USD',
    startsAt INTEGER NOT NULL,        -- Unix timestamp
    endsAt INTEGER,                   -- Unix timestamp (null for lifetime)
    cancelledAt INTEGER,
    paymentProvider TEXT,             -- stripe, paypal, appstore, playstore
    externalSubscriptionId TEXT,      -- Provider's subscription ID
    createdAt INTEGER DEFAULT (strftime('%s', 'now')),
    updatedAt INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE INDEX idx_subscriptions_userid ON subscriptions(userId);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
```

### 1.3 Create Collections Table
**File:** `src/server/db/schema.sql`

```sql
CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY,              -- UUID
    userId TEXT NOT NULL,
    name TEXT NOT NULL,               -- "Master Collection", "Work", "Personal"
    description TEXT,
    isDefault INTEGER DEFAULT 0,      -- 1 for Master Collection
    sortOrder INTEGER DEFAULT 0,
    createdAt INTEGER DEFAULT (strftime('%s', 'now')),
    updatedAt INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE INDEX idx_collections_userid ON collections(userId);
```

### 1.4 Add Collection Reference to Bookmarks/Folders
**File:** `src/server/db/migrations/`

```sql
-- Add collectionId to existing tables
ALTER TABLE bookmarks ADD COLUMN collectionId TEXT;
ALTER TABLE folders ADD COLUMN collectionId TEXT;

-- Index for collection queries
CREATE INDEX idx_bookmarks_collectionid ON bookmarks(collectionId);
CREATE INDEX idx_folders_collectionid ON folders(collectionId);

-- Migration: Set all existing items to user's default collection
-- (Run after creating default collections for all users)
```

---

## Phase 2: Premium Tier Definitions

### 2.1 Tier Comparison

| Feature | Free | Premium |
|---------|------|---------|
| **Bookmark Limit** | 250 | 10,000 |
| **Browser Sync** | 2 browsers | Unlimited |
| **Collections** | 1 (Master only, read-only view) | Unlimited |
| **Collection Editor** | ❌ No access | ✅ Full drag/drop editor |
| **Session History** | ❌ No access | ✅ View & rollback |
| **Mobile App** | ❌ No access | ✅ Full access |
| **Export/Backup** | ❌ No access | ✅ JSON/HTML export |
| **Sync Operations** | Merge Up, Overwrite | Merge Up, Overwrite |
| **Support** | Community | Priority |

### 2.2 Premium Pricing (via Polar)

| Plan | Price | Notes |
|------|-------|-------|
| Monthly | $5/month | Cancel anytime |
| Yearly | $50/year | ~17% savings |
| Lifetime | $100 once | Never expires |

**Payment Provider:** [Polar](https://polar.sh) - handles subscriptions, webhooks, and customer portal.

---

## Phase 3: Backend Premium Enforcement

### 3.1 Premium Middleware
**File:** `src/server/middleware/premium.ts`

```typescript
export interface PremiumUser {
  id: string;
  subscriptionTier: 'free' | 'premium';
  subscriptionExpiresAt: number | null;
  bookmarkLimit: number;
  browserLimit: number;
  collectionLimit: number;
}

export function requirePremium(req, res, next) {
  const user = req.user as PremiumUser;
  
  if (user.subscriptionTier !== 'premium') {
    return res.status(403).json({
      success: false,
      error: {
        code: 'PREMIUM_REQUIRED',
        message: 'This feature requires a premium subscription'
      }
    });
  }
  
  // Check expiration
  if (user.subscriptionExpiresAt && user.subscriptionExpiresAt < Date.now()) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'SUBSCRIPTION_EXPIRED',
        message: 'Your premium subscription has expired'
      }
    });
  }
  
  next();
}

export function checkBookmarkLimit(req, res, next) {
  const user = req.user as PremiumUser;
  const currentCount = db.getBookmarkCount(user.id);
  
  if (currentCount >= user.bookmarkLimit) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'BOOKMARK_LIMIT_REACHED',
        message: `You've reached your limit of ${user.bookmarkLimit} bookmarks. Upgrade to premium for more.`,
        currentCount,
        limit: user.bookmarkLimit
      }
    });
  }
  
  next();
}

export function checkBrowserLimit(req, res, next) {
  const user = req.user as PremiumUser;
  const browserCount = db.getBrowserCount(user.id);
  
  if (browserCount >= user.browserLimit) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'BROWSER_LIMIT_REACHED',
        message: `You can only sync ${user.browserLimit} browser(s). Upgrade to premium for unlimited.`,
        currentCount: browserCount,
        limit: user.browserLimit
      }
    });
  }
  
  next();
}
```

### 3.2 Update Sync Endpoints with Limits
**File:** `src/server/server.ts`

```typescript
// Initial sync - check browser limit
app.post('/api/v1/sync/initial', 
  authenticate, 
  checkBrowserLimit,
  checkBookmarkLimit,
  handleInitialSync
);

// Merge - check bookmark limit
app.post('/api/v1/sync/merge',
  authenticate,
  checkBookmarkLimit,
  handleMerge
);

// Collection endpoints - premium only
app.get('/api/v1/collections', authenticate, getCollections);
app.post('/api/v1/collections', authenticate, requirePremium, createCollection);
app.put('/api/v1/collections/:id', authenticate, requirePremium, updateCollection);
app.delete('/api/v1/collections/:id', authenticate, requirePremium, deleteCollection);
```

### 3.3 Collection API Endpoints
**File:** `src/server/api/collections.ts`

```typescript
// GET /api/v1/collections
// Returns all collections for user (free users get 1)

// POST /api/v1/collections (premium only)
// Create new collection { name, description }

// PUT /api/v1/collections/:id (premium only)
// Update collection { name, description }

// DELETE /api/v1/collections/:id (premium only)
// Delete collection (cannot delete default)

// GET /api/v1/collections/:id/items
// Get all folders/bookmarks in a collection

// POST /api/v1/collections/:id/items
// Add/move items to collection (premium only)
```

---

## Phase 4: Session History & Rollback

### 4.1 Current Session Tracking
Already implemented:
- `sessionId` column on bookmarks/folders (UUID per sync/merge operation)
- `sourceBrowser` column tracking origin browser

### 4.2 Session History API
**File:** `src/server/api/sessions.ts`

```typescript
// GET /api/v1/sessions (premium only)
// Returns list of sync sessions with summary
interface SessionSummary {
  sessionId: string;
  timestamp: number;
  sourceBrowser: string;
  type: 'INITIAL_IMPORT' | 'MERGE_IMPORT' | 'MANUAL_EDIT';
  itemCount: number;
  foldersAdded: number;
  bookmarksAdded: number;
}

// GET /api/v1/sessions/:sessionId (premium only)
// Returns all items from that session

// POST /api/v1/sessions/:sessionId/rollback (premium only)
// Soft-delete all items from that session
// Sets status = 'rolled_back' instead of 'deleted'

// POST /api/v1/sessions/:sessionId/restore (premium only)
// Restore previously rolled-back session
// Sets status = 'active' for items with that sessionId
```

### 4.3 Database Queries for Sessions
**File:** `src/server/db/database.ts`

```typescript
public getSessionHistory(userId: string, limit = 50): SessionSummary[] {
  const stmt = this.db.prepare(`
    SELECT 
      sessionId,
      sourceBrowser,
      MIN(createdAt) as timestamp,
      COUNT(*) as itemCount,
      SUM(CASE WHEN url IS NOT NULL THEN 1 ELSE 0 END) as bookmarksAdded,
      SUM(CASE WHEN url IS NULL THEN 1 ELSE 0 END) as foldersAdded
    FROM (
      SELECT sessionId, sourceBrowser, createdAt, url FROM bookmarks 
      WHERE userId = ? AND sessionId IS NOT NULL
      UNION ALL
      SELECT sessionId, sourceBrowser, createdAt, NULL as url FROM folders 
      WHERE userId = ? AND sessionId IS NOT NULL
    )
    GROUP BY sessionId
    ORDER BY timestamp DESC
    LIMIT ?
  `);
  return stmt.all(userId, userId, limit);
}

public rollbackSession(sessionId: string, userId: string): number {
  const stmt1 = this.db.prepare(`
    UPDATE bookmarks SET status = 'rolled_back', updatedAt = ?
    WHERE sessionId = ? AND userId = ?
  `);
  const stmt2 = this.db.prepare(`
    UPDATE folders SET status = 'rolled_back', updatedAt = ?
    WHERE sessionId = ? AND userId = ?
  `);
  const now = Date.now();
  const r1 = stmt1.run(now, sessionId, userId);
  const r2 = stmt2.run(now, sessionId, userId);
  return r1.changes + r2.changes;
}
```

---

## Phase 5: Web-Based Collection Editor

### 5.1 Why Website Instead of Extension Page

| Aspect | Extension Page (chrome://) | Website Page |
|--------|---------------------------|--------------|
| CORS | No issues | Standard (server controls it) |
| Chrome APIs | Full access | Not needed for MC editing |
| Auth | Uses stored token | Standard JWT auth |
| Access | Extension required | Any browser, any device |
| Updates | Requires extension update | Instant deployment |
| Premium gating | Hard to enforce | Easy server-side checks |
| Rich UI | Limited | Full React/Next.js power |

**Decision:** Host the Collection Editor on the website (`bookmarx.gasdigital.co.uk/editor`)

### 5.2 Website Pages Structure
**Directory:** `src/website/app/`

```
app/
├── page.tsx                    # Landing page
├── login/page.tsx              # Login
├── register/page.tsx           # Register
├── dashboard/
│   └── page.tsx                # User dashboard (stats, quick actions)
├── collections/
│   ├── page.tsx                # Collections list
│   └── [id]/
│       ├── page.tsx            # Collection viewer (read-only for free)
│       └── edit/page.tsx       # Collection editor (premium only)
├── sessions/
│   ├── page.tsx                # Session history list (premium)
│   └── [id]/page.tsx           # Session details + rollback (premium)
├── settings/
│   ├── page.tsx                # Account settings
│   └── subscription/page.tsx   # Manage subscription
└── api/
    └── ... (API routes if needed)
```

### 5.3 Collection Editor Features
**File:** `src/website/app/collections/[id]/edit/page.tsx`

**Core Features:**
- Drag & drop folder/bookmark reordering (use `@dnd-kit/core`)
- Drag items between folders
- Inline title editing (double-click)
- URL editing for bookmarks
- Add new folder button
- Add new bookmark button (URL + title)
- Delete items (with confirmation)
- Bulk selection + bulk delete
- Search/filter within collection

**UI Components:**
```
CollectionEditor/
├── EditorHeader.tsx        # Collection name, Save/Revert buttons
├── FolderTree.tsx          # Recursive folder structure
├── FolderNode.tsx          # Single folder (expandable)
├── BookmarkNode.tsx        # Single bookmark item
├── DragOverlay.tsx         # Ghost element while dragging
├── AddItemModal.tsx        # Add folder/bookmark form
├── EditItemModal.tsx       # Edit title/URL form
├── DeleteConfirmModal.tsx  # Confirm deletion
├── BulkActionBar.tsx       # Actions for selected items
└── SearchFilter.tsx        # Filter items in view
```

### 5.4 Editor State Management
**File:** `src/website/lib/editor-store.ts`

```typescript
interface EditorState {
  // Data
  originalCollection: Collection;
  workingCollection: Collection;
  
  // UI State
  expandedFolders: Set<string>;
  selectedItems: Set<string>;
  searchQuery: string;
  
  // Change tracking
  pendingChanges: Change[];
  hasUnsavedChanges: boolean;
  
  // Actions
  moveItem(itemId: string, newParentId: string, newIndex: number): void;
  renameItem(itemId: string, newTitle: string): void;
  updateBookmarkUrl(itemId: string, newUrl: string): void;
  deleteItem(itemId: string): void;
  addFolder(parentId: string, title: string): void;
  addBookmark(parentId: string, title: string, url: string): void;
  
  // Persistence
  saveChanges(): Promise<void>;      // POST to server
  revertChanges(): void;             // Reset to originalCollection
}
```

### 5.5 Editor API Endpoints
**File:** `src/server/api/editor.ts`

```typescript
// POST /api/v1/collections/:id/changes (premium only)
// Apply batch of changes to collection
interface EditorChangeRequest {
  sessionId: string;  // For rollback grouping
  changes: EditorChange[];
}

interface EditorChange {
  type: 'MOVE' | 'RENAME' | 'UPDATE_URL' | 'DELETE' | 'CREATE_FOLDER' | 'CREATE_BOOKMARK';
  itemType: 'folder' | 'bookmark';
  itemId?: string;        // For existing items
  parentId?: string;      // For moves and creates
  position?: number;      // For moves
  title?: string;         // For renames and creates
  url?: string;           // For bookmark URL updates and creates
}

// Response includes new masterIds for created items
```

---

## Phase 6: Extension Updates

### 6.1 Link to Web Editor (Premium)
**File:** `src/extension/popup/index.ts`

```typescript
// Add button to popup
const editMasterBtn = document.getElementById('editMasterCollection');
editMasterBtn?.addEventListener('click', async () => {
  const user = await storageManager.getUser();
  if (user?.subscriptionTier === 'premium') {
    // Open web editor
    chrome.tabs.create({ url: 'https://bookmarx.gasdigital.co.uk/collections/master/edit' });
  } else {
    // Show upgrade prompt
    showUpgradePrompt();
  }
});
```

### 6.2 Show Premium Status in Popup
**File:** `src/extension/popup/index.html`

```html
<!-- Add premium badge next to user info -->
<div class="user-tier">
  <span class="tier-badge tier-free">Free</span>
  <!-- or -->
  <span class="tier-badge tier-premium">⭐ Premium</span>
</div>

<!-- Upgrade CTA for free users -->
<div class="upgrade-cta" id="upgradeCta">
  <p>Unlock all features</p>
  <button id="upgradeBtn">Upgrade to Premium</button>
</div>
```

### 6.3 Update Master Collection View
**File:** `src/extension/pages/master-collection.ts`

- Keep read-only view for all users
- Add "Edit in Web" button for premium users
- Add "Upgrade to Edit" prompt for free users

---

## Phase 7: Mobile App Premium Gating

### 7.1 App Launch Check
**File:** `src/mobile/app/index.tsx`

```typescript
// On app launch, check subscription
const user = await fetchUserProfile();

if (user.subscriptionTier !== 'premium') {
  // Show premium-required screen
  navigation.navigate('PremiumRequired');
} else {
  // Normal app flow
  navigation.navigate('Home');
}
```

### 7.2 Premium Required Screen
**File:** `src/mobile/app/premium-required.tsx`

- Explain premium benefits
- Link to upgrade on website
- "Already subscribed? Refresh" button

---

## Phase 8: Subscription Management

### 8.1 Payment Integration: Polar

**Provider:** [Polar](https://polar.sh)

Polar handles:
- Subscription management (monthly, yearly, lifetime)
- Payment processing (Stripe under the hood)
- Customer portal for self-service
- Webhook events for subscription changes
- Tax handling

| Plan | Polar Product ID | Price |
|------|------------------|-------|
| Monthly | `bookmarx_monthly` | $5/month |
| Yearly | `bookmarx_yearly` | $50/year |
| Lifetime | `bookmarx_lifetime` | $100 once |

**For mobile apps:**
| Provider | Platform | Notes |
|----------|----------|-------|
| App Store | iOS | Required for iOS in-app purchases |
| Play Store | Android | Required for Android in-app purchases |

### 8.2 Webhook Handlers
**File:** `src/server/api/webhooks/`

```typescript
// POST /api/webhooks/polar
// Handle Polar webhook events:
// - checkout.created - User started checkout
// - subscription.created - New subscription
// - subscription.updated - Plan change, renewal
// - subscription.canceled - User canceled
// - subscription.revoked - Payment failed after retries
// - order.created - One-time purchase (lifetime)

interface PolarWebhookPayload {
  type: string;
  data: {
    id: string;
    customer_id: string;
    customer_email: string;
    product_id: string;
    status: 'active' | 'canceled' | 'past_due' | 'trialing';
    current_period_end?: string;
    // ... other fields
  };
}

// POST /api/webhooks/appstore
// Handle: iOS subscription events (for mobile app purchases)

// POST /api/webhooks/playstore
// Handle: Android subscription events (for mobile app purchases)
```

### 8.3 Subscription Sync
- User upgrades on web → immediate access
- User upgrades on iOS → webhook updates DB → immediate access
- User cancels → keep access until period ends → then downgrade

---

## Phase 9: Testing Checklist

### 9.1 Premium Tier Tests
- [ ] Free user cannot access editor
- [ ] Free user cannot create collections
- [ ] Free user cannot view sessions
- [ ] Free user hits bookmark limit (250)
- [ ] Free user hits browser limit (2)
- [ ] Premium user can access all features
- [ ] Premium user has higher limits
- [ ] Expired premium reverts to free limits

### 9.2 Collection Editor Tests
- [ ] Drag folder to new parent
- [ ] Drag bookmark to new folder
- [ ] Reorder items within folder
- [ ] Inline rename folder
- [ ] Inline rename bookmark
- [ ] Edit bookmark URL
- [ ] Add new folder
- [ ] Add new bookmark
- [ ] Delete folder (with contents)
- [ ] Delete bookmark
- [ ] Bulk select and delete
- [ ] Save changes to server
- [ ] Revert to cloud version
- [ ] Changes grouped by sessionId

### 9.3 Session Rollback Tests
- [ ] View session history
- [ ] See items in specific session
- [ ] Rollback session removes items
- [ ] Restore session brings items back
- [ ] Rolled back items don't appear in MC

### 9.4 Mobile Premium Tests
- [ ] Free user sees premium-required screen
- [ ] Premium user can use app
- [ ] Subscription upgrade unlocks app
- [ ] Subscription expiry locks app

---

## Execution Order

### Week 1: Database & Backend
1. Phase 1 (Premium schema)
2. Phase 2 (Tier definitions)
3. Phase 3 (Premium middleware)
4. Phase 4 (Session rollback API)

### Week 2: Web Editor
5. Phase 5 (Collection Editor UI)
6. Phase 6 (Extension updates)

### Week 3: Mobile & Payments
7. Phase 7 (Mobile premium gating)
8. Phase 8 (Subscription management)

### Week 4: Testing & Polish
9. Phase 9 (Full testing)
10. Bug fixes and UX polish

---

## Quick Reference: New Files

### Backend
- `src/server/db/migrations/xxx-add-premium-fields.ts`
- `src/server/db/migrations/xxx-add-collections-table.ts`
- `src/server/middleware/premium.ts`
- `src/server/api/collections.ts`
- `src/server/api/sessions.ts`
- `src/server/api/editor.ts`
- `src/server/api/webhooks/polar.ts`
- `src/server/api/webhooks/appstore.ts` (for mobile)
- `src/server/api/webhooks/playstore.ts` (for mobile)

### Website
- `src/website/app/dashboard/page.tsx`
- `src/website/app/collections/page.tsx`
- `src/website/app/collections/[id]/page.tsx`
- `src/website/app/collections/[id]/edit/page.tsx`
- `src/website/app/sessions/page.tsx`
- `src/website/app/sessions/[id]/page.tsx`
- `src/website/app/settings/subscription/page.tsx`
- `src/website/components/editor/*`
- `src/website/lib/editor-store.ts`

### Extension
- Update `src/extension/popup/index.ts`
- Update `src/extension/popup/index.html`
- Update `src/extension/pages/master-collection.ts`

### Mobile
- `src/mobile/app/premium-required.tsx`
- Update `src/mobile/app/index.tsx`

---

## Notes

### Why No "Sync Down"?
The Master Collection is the source of truth. The two sync operations are:
1. **Merge Up** - Browser contributes new bookmarks to MC
2. **Overwrite** - Browser gets replaced with MC

There's no "download changes" because we don't track per-item changes for selective sync. It's all-or-nothing (overwrite).

### Collection Isolation
Each collection is independent:
- Own set of folders/bookmarks
- Own session history
- Can overwrite browser with specific collection
- Can merge browser into specific collection

### Future Considerations
- Collection sharing between users
- Team/family plans
- API access for power users
- Browser extension for collection switching
