-- SQLite schema for BookMarx

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
    lastSeen INTEGER DEFAULT (strftime('%s', 'now')),
    createdAt INTEGER DEFAULT (strftime('%s', 'now')),
    updatedAt INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Folders table
CREATE TABLE IF NOT EXISTS folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    browserId TEXT NOT NULL,             -- Browser's internal ID for this folder
    browserInstanceId TEXT,              -- References browsers.browserInstanceId, nullable for initial sync
    userId TEXT NOT NULL,
    title TEXT NOT NULL,
    parentId TEXT,
    position INTEGER NOT NULL,
    dateAdded INTEGER NOT NULL,
    status TEXT CHECK(status IN ('active', 'deleted')) DEFAULT 'active',
    syncVersion INTEGER DEFAULT 1,
    timestamp INTEGER,
    createdAt INTEGER DEFAULT (strftime('%s', 'now')),
    updatedAt INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (browserInstanceId) REFERENCES browsers(browserInstanceId)
);

-- Bookmarks table
CREATE TABLE IF NOT EXISTS bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    browserId TEXT NOT NULL,             -- Browser's internal ID for this bookmark
    browserInstanceId TEXT,              -- References browsers.browserInstanceId, nullable for initial sync
    userId TEXT NOT NULL,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    parentId TEXT NOT NULL,
    position INTEGER NOT NULL,
    dateAdded INTEGER NOT NULL,
    status TEXT CHECK(status IN ('active', 'deleted')) DEFAULT 'active',
    syncVersion INTEGER DEFAULT 1,
    timestamp INTEGER,
    createdAt INTEGER DEFAULT (strftime('%s', 'now')),
    updatedAt INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (browserInstanceId) REFERENCES browsers(browserInstanceId)
);

-- Sync History table
CREATE TABLE IF NOT EXISTS sync_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    browserInstanceId TEXT,              -- References browsers.browserInstanceId, nullable for initial sync
    type TEXT CHECK(type IN ('INITIAL_IMPORT', 'SYNC')) NOT NULL,
    changesCount INTEGER NOT NULL,
    status TEXT CHECK(status IN ('SUCCESS', 'FAILED', 'PARTIAL')) NOT NULL,
    bookmarksProcessed INTEGER DEFAULT 0,
    foldersProcessed INTEGER DEFAULT 0,
    timestamp INTEGER,
    createdAt INTEGER DEFAULT (strftime('%s', 'now')),
    updatedAt INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (browserInstanceId) REFERENCES browsers(browserInstanceId)
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
