-- SQLite schema for BookMarx

-- Folders table
CREATE TABLE IF NOT EXISTS folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    browserId TEXT NOT NULL,
    userId TEXT NOT NULL,
    title TEXT NOT NULL,
    parentId TEXT,
    position INTEGER NOT NULL,
    dateAdded INTEGER NOT NULL,
    status TEXT CHECK(status IN ('active', 'deleted')) DEFAULT 'active',
    syncVersion INTEGER DEFAULT 1,
    -- Device metadata
    browser TEXT,
    browserVersion TEXT,
    deviceId TEXT,
    os TEXT,
    osVersion TEXT,
    userAgent TEXT,
    timestamp INTEGER,
    -- Timestamps
    createdAt INTEGER DEFAULT (strftime('%s', 'now')),
    updatedAt INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Bookmarks table
CREATE TABLE IF NOT EXISTS bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    browserId TEXT NOT NULL,
    userId TEXT NOT NULL,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    parentId TEXT NOT NULL,
    position INTEGER NOT NULL,
    dateAdded INTEGER NOT NULL,
    status TEXT CHECK(status IN ('active', 'deleted')) DEFAULT 'active',
    syncVersion INTEGER DEFAULT 1,
    -- Device metadata
    browser TEXT,
    browserVersion TEXT,
    deviceId TEXT,
    os TEXT,
    osVersion TEXT,
    userAgent TEXT,
    timestamp INTEGER,
    -- Timestamps
    createdAt INTEGER DEFAULT (strftime('%s', 'now')),
    updatedAt INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Sync History table
CREATE TABLE IF NOT EXISTS sync_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    deviceId TEXT NOT NULL,
    type TEXT CHECK(type IN ('INITIAL_IMPORT', 'SYNC')) NOT NULL,
    changesCount INTEGER NOT NULL,
    status TEXT CHECK(status IN ('SUCCESS', 'FAILED', 'PARTIAL')) NOT NULL,
    -- Sync details
    bookmarksProcessed INTEGER DEFAULT 0,
    foldersProcessed INTEGER DEFAULT 0,
    -- Device metadata
    browser TEXT,
    browserVersion TEXT,
    os TEXT,
    osVersion TEXT,
    userAgent TEXT,
    timestamp INTEGER,
    -- Timestamps
    createdAt INTEGER DEFAULT (strftime('%s', 'now')),
    updatedAt INTEGER DEFAULT (strftime('%s', 'now'))
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_folders_userid ON folders(userId);
CREATE INDEX IF NOT EXISTS idx_folders_browserid ON folders(browserId);
CREATE INDEX IF NOT EXISTS idx_bookmarks_userid ON bookmarks(userId);
CREATE INDEX IF NOT EXISTS idx_bookmarks_browserid ON bookmarks(browserId);
CREATE INDEX IF NOT EXISTS idx_sync_history_userid ON sync_history(userId);
CREATE INDEX IF NOT EXISTS idx_sync_history_deviceid ON sync_history(deviceId);
