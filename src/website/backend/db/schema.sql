-- SQLite schema for BookMarx

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    passwordHash TEXT,
    displayName TEXT,
    subscriptionTier TEXT DEFAULT 'free',           -- free, premium
    subscriptionExpiresAt INTEGER,                  -- Unix timestamp (null for lifetime or free)
    polarCustomerId TEXT,                           -- Polar customer ID for subscription management
    createdAt INTEGER DEFAULT (strftime('%s', 'now')),
    updatedAt INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Application settings table (centralized source of truth for limits, pricing, etc.)
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updatedAt INTEGER DEFAULT (strftime('%s', 'now'))
);

-- OAuth identities table
CREATE TABLE IF NOT EXISTS user_identities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    provider TEXT NOT NULL,
    providerUserId TEXT NOT NULL,
    email TEXT,
    createdAt INTEGER DEFAULT (strftime('%s', 'now')),
    updatedAt INTEGER DEFAULT (strftime('%s', 'now')),
    UNIQUE(provider, providerUserId),
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

-- Subscriptions table (tracks subscription history)
CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    planType TEXT NOT NULL,                          -- monthly, yearly, lifetime
    status TEXT NOT NULL,                            -- active, cancelled, expired, trialing
    amount INTEGER NOT NULL,                         -- Amount in cents
    currency TEXT DEFAULT 'USD',
    startsAt INTEGER NOT NULL,                       -- Unix timestamp
    endsAt INTEGER,                                  -- Unix timestamp (null for lifetime)
    cancelledAt INTEGER,
    paymentProvider TEXT DEFAULT 'polar',            -- polar, appstore, playstore
    externalSubscriptionId TEXT,                     -- Provider's subscription ID
    externalCustomerId TEXT,                         -- Provider's customer ID
    createdAt INTEGER DEFAULT (strftime('%s', 'now')),
    updatedAt INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

-- Collections table (for multiple bookmark collections)
CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY,                             -- UUID
    userId TEXT NOT NULL,
    name TEXT NOT NULL,                              -- "Master Collection", "Work", "Personal"
    description TEXT,
    isDefault INTEGER DEFAULT 0,                     -- 1 for Master Collection
    sortOrder INTEGER DEFAULT 0,
    createdAt INTEGER DEFAULT (strftime('%s', 'now')),
    updatedAt INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

-- Browsers table to track browser installations
CREATE TABLE IF NOT EXISTS browsers (
    browserInstanceId TEXT PRIMARY KEY,  -- UUID for this browser installation
    userId TEXT NOT NULL,
    deviceId TEXT NOT NULL,
    browser TEXT NOT NULL,               -- 'Chrome', 'Firefox', etc.
    browserVersion TEXT NOT NULL,
    os TEXT,
    osVersion TEXT,
    userAgent TEXT,
    nickname TEXT,                       -- User-defined name for this browser (e.g., "Work Chrome", "Helium")
    lastSeen INTEGER DEFAULT (strftime('%s', 'now')),
    createdAt INTEGER DEFAULT (strftime('%s', 'now')),
    updatedAt INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Folders table
CREATE TABLE IF NOT EXISTS folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    masterId TEXT UNIQUE,                -- Server-generated UUID for cross-device editing
    browserId TEXT NOT NULL,             -- Browser's internal ID for this folder
    browserInstanceId TEXT,              -- References browsers.browserInstanceId, nullable for initial sync
    userId TEXT NOT NULL,
    collectionId TEXT,                   -- References collections.id (null = default/master collection)
    title TEXT NOT NULL,
    parentId TEXT,
    masterParentId TEXT,                 -- Parent folder's masterId for cross-device references
    position INTEGER NOT NULL,
    dateAdded INTEGER NOT NULL,
    sourceBrowser TEXT,                  -- Browser type that created this folder (chrome, firefox, edge, opera, brave, etc.)
    sessionId TEXT,                      -- Session UUID grouping items from same sync/merge operation (for rollback)
    status TEXT CHECK(status IN ('active', 'deleted', 'rolled_back')) DEFAULT 'active',
    syncVersion INTEGER DEFAULT 1,
    timestamp INTEGER,
    createdAt INTEGER DEFAULT (strftime('%s', 'now')),
    updatedAt INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (browserInstanceId) REFERENCES browsers(browserInstanceId),
    FOREIGN KEY (collectionId) REFERENCES collections(id)
);

-- Bookmarks table
CREATE TABLE IF NOT EXISTS bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    masterId TEXT UNIQUE,                -- Server-generated UUID for cross-device editing
    browserId TEXT NOT NULL,             -- Browser's internal ID for this bookmark
    browserInstanceId TEXT,              -- References browsers.browserInstanceId, nullable for initial sync
    userId TEXT NOT NULL,
    collectionId TEXT,                   -- References collections.id (null = default/master collection)
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    parentId TEXT NOT NULL,
    masterParentId TEXT,                 -- Parent folder's masterId for cross-device references
    position INTEGER NOT NULL,
    dateAdded INTEGER NOT NULL,
    sourceBrowser TEXT,                  -- Browser type that created this bookmark (chrome, firefox, edge, opera, brave, etc.)
    sessionId TEXT,                      -- Session UUID grouping items from same sync/merge operation (for rollback)
    status TEXT CHECK(status IN ('active', 'deleted', 'rolled_back')) DEFAULT 'active',
    syncVersion INTEGER DEFAULT 1,
    timestamp INTEGER,
    createdAt INTEGER DEFAULT (strftime('%s', 'now')),
    updatedAt INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (browserInstanceId) REFERENCES browsers(browserInstanceId),
    FOREIGN KEY (collectionId) REFERENCES collections(id)
);

-- Sync History table
CREATE TABLE IF NOT EXISTS sync_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    browserInstanceId TEXT,              -- References browsers.browserInstanceId, nullable for initial sync
    type TEXT CHECK(type IN ('INITIAL_IMPORT', 'SYNC', 'MERGE_IMPORT')) NOT NULL,
    changesCount INTEGER NOT NULL,
    status TEXT CHECK(status IN ('SUCCESS', 'FAILED', 'PARTIAL')) NOT NULL,
    bookmarksProcessed INTEGER DEFAULT 0,
    foldersProcessed INTEGER DEFAULT 0,
    collectionId TEXT,
    sessionId TEXT,
    detailsJson TEXT,
    timestamp INTEGER,
    createdAt INTEGER DEFAULT (strftime('%s', 'now')),
    updatedAt INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (browserInstanceId) REFERENCES browsers(browserInstanceId),
    FOREIGN KEY (collectionId) REFERENCES collections(id)
);

-- Sync History Errors table (one-to-many relationship with sync_history)
CREATE TABLE IF NOT EXISTS sync_history_errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    syncHistoryId INTEGER NOT NULL,
    type TEXT NOT NULL,
    itemId TEXT,
    message TEXT,
    FOREIGN KEY (syncHistoryId) REFERENCES sync_history(id) ON DELETE CASCADE
);

-- Collection Events table
CREATE TABLE IF NOT EXISTS collection_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    eventId TEXT NOT NULL UNIQUE,
    userId TEXT NOT NULL,
    collectionId TEXT NOT NULL,
    type TEXT NOT NULL,
    sourceBrowser TEXT,
    sessionId TEXT,
    changesCount INTEGER DEFAULT 0,
    snapshotJson TEXT NOT NULL,
    detailsJson TEXT,
    rolledBackAt INTEGER,
    timestamp INTEGER,
    createdAt INTEGER DEFAULT (strftime('%s', 'now')),
    updatedAt INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (collectionId) REFERENCES collections(id)
);

-- Indexes (for base schema - premium-related indexes created by migrations)
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_user_identities_userid ON user_identities(userId);
CREATE INDEX IF NOT EXISTS idx_user_identities_provider ON user_identities(provider, providerUserId);
CREATE INDEX IF NOT EXISTS idx_browsers_userid ON browsers(userId);
CREATE INDEX IF NOT EXISTS idx_browsers_deviceid ON browsers(deviceId);
CREATE INDEX IF NOT EXISTS idx_folders_userid ON folders(userId);
CREATE INDEX IF NOT EXISTS idx_folders_browserid ON folders(browserId);
CREATE INDEX IF NOT EXISTS idx_folders_browserinstanceid ON folders(browserInstanceId);
CREATE INDEX IF NOT EXISTS idx_bookmarks_userid ON bookmarks(userId);
CREATE INDEX IF NOT EXISTS idx_bookmarks_browserid ON bookmarks(browserId);
CREATE INDEX IF NOT EXISTS idx_bookmarks_browserinstanceid ON bookmarks(browserInstanceId);
CREATE INDEX IF NOT EXISTS idx_sync_history_userid ON sync_history(userId);
CREATE INDEX IF NOT EXISTS idx_sync_history_browserinstanceid ON sync_history(browserInstanceId);
CREATE INDEX IF NOT EXISTS idx_bookmarks_masterid ON bookmarks(masterId);
CREATE INDEX IF NOT EXISTS idx_folders_masterid ON folders(masterId);
CREATE INDEX IF NOT EXISTS idx_bookmarks_masterparentid ON bookmarks(masterParentId);
CREATE INDEX IF NOT EXISTS idx_folders_masterparentid ON folders(masterParentId);
CREATE INDEX IF NOT EXISTS idx_collection_events_collectionid ON collection_events(collectionId);
CREATE INDEX IF NOT EXISTS idx_collection_events_userid ON collection_events(userId);
CREATE INDEX IF NOT EXISTS idx_collection_events_eventid ON collection_events(eventId);
-- Note: Indexes for premium fields (polarCustomerId, subscriptions, collections, collectionId, sessionId, sourceBrowser)
-- are created by migrations for existing databases
