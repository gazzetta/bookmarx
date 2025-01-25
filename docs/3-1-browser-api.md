```markdown
# BookMarx Browser API Integration

## Browser API Manager
```typescript
class BrowserBookmarkManager {
    private localStateCache: Map<string, BookmarkNode>;
    private processingQueue: Set<string>;  // Prevents infinite event loops
    private bookmarkMap: Map<string, string>;  // Maps browser IDs to our IDs

    constructor() {
        this.localStateCache = new Map();
        this.processingQueue = new Set();
        this.bookmarkMap = new Map();
        this.initializeBookmarkMap();
    }

    // Core CRUD Operations
    public async createBookmark(bookmark: BookmarkCreate): Promise<string> {
        try {
            if (this.processingQueue.has(bookmark.url)) {
                return '';
            }

            this.processingQueue.add(bookmark.url);

            const browserBookmark = await chrome.bookmarks.create({
                parentId: this.getBrowserFolderId(bookmark.folderId),
                title: bookmark.title,
                url: bookmark.url
            });

            const ourId = generateUUID();
            await this.mapAndCacheBookmark(browserBookmark, ourId);

            return ourId;
        } finally {
            this.processingQueue.delete(bookmark.url);
        }
    }
}
```

## Event Handlers
```typescript
interface BookmarkEventHandlers {
    onCreated: {
        handler: async (id: string, bookmark: chrome.bookmarks.BookmarkTreeNode) => {
            if (this.isProcessing(id)) return;

            try {
                await this.handleNewBookmark(bookmark);
                await this.queueSyncOperation({
                    type: 'CREATE',
                    data: bookmark
                });
            } catch (error) {
                await this.handleBookmarkError(error, 'CREATE');
            }
        }
    };

    onUpdated: {
        handler: async (id: string, changes: chrome.bookmarks.BookmarkChangeInfo) => {
            if (this.isProcessing(id)) return;

            try {
                await this.handleBookmarkUpdate(id, changes);
                await this.queueSyncOperation({
                    type: 'UPDATE',
                    id: id,
                    changes: changes
                });
            } catch (error) {
                await this.handleBookmarkError(error, 'UPDATE');
            }
        }
    };

    onMoved: {
        handler: async (id: string, moveInfo: chrome.bookmarks.BookmarkMoveInfo) => {
            if (this.isProcessing(id)) return;

            try {
                await this.handleBookmarkMove(id, moveInfo);
                await this.queueSyncOperation({
                    type: 'MOVE',
                    id: id,
                    moveInfo: moveInfo
                });
            } catch (error) {
                await this.handleBookmarkError(error, 'MOVE');
            }
        }
    };

    onRemoved: {
        handler: async (id: string, removeInfo: chrome.bookmarks.BookmarkRemoveInfo) => {
            if (this.isProcessing(id)) return;

            try {
                await this.handleBookmarkRemoval(id, removeInfo);
                await this.queueSyncOperation({
                    type: 'DELETE',
                    id: id
                });
            } catch (error) {
                await this.handleBookmarkError(error, 'DELETE');
            }
        }
    };
}
```

## Storage Integration
```typescript
interface StorageManager {
    local: {
        saveBookmark: async (bookmark: Bookmark) => {
            const key = `bookmark_${bookmark.id}`;
            await chrome.storage.local.set({ [key]: bookmark });
            this.localStateCache.set(bookmark.id, bookmark);
        };

        getBookmark: async (id: string) => {
            const key = `bookmark_${id}`;
            const result = await chrome.storage.local.get(key);
            return result[key] as Bookmark;
        };

        removeBookmark: async (id: string) => {
            const key = `bookmark_${id}`;
            await chrome.storage.local.remove(key);
            this.localStateCache.delete(id);
        };
    };

    sync: {
        savePreference: async (key: string, value: any) => {
            await chrome.storage.sync.set({ [key]: value });
        };

        getPreference: async (key: string) => {
            const result = await chrome.storage.sync.get(key);
            return result[key];
        };
    };

    cache: {
        maxItems: 1000;
        pruneThreshold: 800;
        expiryTime: 30 * 60 * 1000;  // 30 minutes
    };
}
```

## Folder Management
```typescript
interface FolderManager {
    createFolder: async (folder: FolderCreate) => {
        try {
            this.processingQueue.add(`folder-${folder.name}`);

            const browserFolder = await chrome.bookmarks.create({
                parentId: this.getBrowserFolderId(folder.parentId),
                title: folder.name
            });

            const ourId = generateUUID();
            await this.mapAndCacheFolder(browserFolder, ourId);

            return ourId;
        } finally {
            this.processingQueue.delete(`folder-${folder.name}`);
        }
    };

    moveFolder: async (id: string, destination: FolderMove) => {
        const browserId = this.getBrowserFolderId(id);
        if (!browserId) return;

        try {
            this.processingQueue.add(id);

            await chrome.bookmarks.move(browserId, {
                parentId: this.getBrowserFolderId(destination.parentId),
                index: destination.position
            });
        } finally {
            this.processingQueue.delete(id);
        }
    };

    deleteFolder: async (id: string) => {
        const browserId = this.getBrowserFolderId(id);
        if (!browserId) return;

        try {
            this.processingQueue.add(id);

            // Get all children first
            const children = await chrome.bookmarks.getChildren(browserId);
            
            // Delete folder
            await chrome.bookmarks.removeTree(browserId);
            
            // Clean up mappings
            await this.cleanupFolderMappings(id, children);
        } finally {
            this.processingQueue.delete(id);
        }
    };
}
```

## Tree Management
```typescript
interface TreeManager {
    getFolderTree: async () => {
        const tree = await chrome.bookmarks.getTree();
        return this.transformBrowserTree(tree[0]);
    };

    transformBrowserTree: (node: chrome.bookmarks.BookmarkTreeNode) => {
        return {
            id: this.getOurId(node.id) || node.id,
            title: node.title,
            children: node.children?.map(child => this.transformBrowserTree(child)),
            type: node.url ? 'bookmark' : 'folder',
            url: node.url,
            dateAdded: node.dateAdded
        };
    };

    findInTree: (id: string, tree: BookmarkNode): BookmarkNode | null => {
        if (tree.id === id) return tree;
        if (!tree.children) return null;

        for (const child of tree.children) {
            const found = this.findInTree(id, child);
            if (found) return found;
        }

        return null;
    };
}
```

## Import/Export
```typescript
interface ImportExport {
    importBookmarks: async (html: string) => {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const bookmarks = this.extractBookmarksFromDOM(doc);
            
            return await this.bulkCreateBookmarks(bookmarks);
        } catch (error) {
            throw new Error(`Import failed: ${error.message}`);
        }
    };

    exportBookmarks: async () => {
        const tree = await chrome.bookmarks.getTree();
        return this.generateBookmarkHTML(tree[0]);
    };

    generateBookmarkHTML: (node: chrome.bookmarks.BookmarkTreeNode) => {
        if (node.url) {
            return `<DT><A HREF="${node.url}" ADD_DATE="${node.dateAdded}">${node.title}</A>`;
        }

        if (node.children) {
            const childrenHTML = node.children.map(child => 
                this.generateBookmarkHTML(child)).join('\n');
            return `<DT><H3>${node.title}</H3>\n<DL>\n${childrenHTML}\n</DL>`;
        }

        return '';
    };
}
```

## Error Recovery
```typescript
interface ErrorRecovery {
    verifyBookmarkConsistency: async () => {
        const browserBookmarks = await chrome.bookmarks.getTree();
        const ourBookmarks = await this.getAllStoredBookmarks();

        const inconsistencies = this.findInconsistencies(
            browserBookmarks[0], 
            ourBookmarks
        );

        if (inconsistencies.length > 0) {
            await this.resolveInconsistencies(inconsistencies);
        }
    };

    findInconsistencies: (browserNode: any, ourBookmarks: Map<string, Bookmark>) => {
        const issues = [];
        
        // Check if browser bookmark exists in our system
        const ourId = this.bookmarkMap.get(browserNode.id);
        if (ourId && !ourBookmarks.has(ourId)) {
            issues.push({
                type: 'MISSING_IN_OURS',
                browserId: browserNode.id,
                ourId: ourId
            });
        }

        // Recurse through children
        if (browserNode.children) {
            for (const child of browserNode.children) {
                issues.push(...this.findInconsistencies(child, ourBookmarks));
            }
        }

        return issues;
    };

    resolveInconsistencies: async (issues: Array<any>) => {
        for (const issue of issues) {
            try {
                await this.resolveInconsistency(issue);
            } catch (error) {
                console.error(`Failed to resolve inconsistency:`, issue, error);
                // Queue for manual resolution if needed
                await this.queueForManualResolution(issue);
            }
        }
    };
}
```

This browser API integration provides:
1. Bookmark CRUD operations
2. Event handling
3. Storage management
4. Folder operations
5. Tree management
6. Import/Export functionality
7. Error recovery
```