import { StorageManager } from './StorageManager';

interface ProcessedBookmark {
    id: string;
    title: string;
    url?: string;
    parentId?: string;
    position?: number;
    dateAdded?: number;
}

export class BookmarkManager {
    constructor(private storageManager: StorageManager) {
        this._pendingUpdates = new Map();
    }

    // Track pending updates with timeouts
    private _pendingUpdates: Map<string, number>;

    public async initialize(): Promise<void> {
        // Set up bookmark event listeners
        chrome.bookmarks.onCreated.addListener(this.handleBookmarkCreated.bind(this));
        chrome.bookmarks.onRemoved.addListener(this.handleBookmarkRemoved.bind(this));
        chrome.bookmarks.onChanged.addListener(this.handleBookmarkChanged.bind(this));
        chrome.bookmarks.onMoved.addListener(this.handleBookmarkMoved.bind(this));
    }

    private async handleBookmarkCreated(id: string, bookmark: chrome.bookmarks.BookmarkTreeNode): Promise<void> {
        try {
            if (await this.storageManager.isQueueingSuppressed()) {
                return;
            }
            // Process new bookmark
            const processedBookmark = await this.processBookmark(bookmark);
            const isFolder = !bookmark.url;
            const userId = await this.storageManager.getUserId();
            
            // Queue for sync
            await this.storageManager.queueChange({
                type: 'CREATE',
                data: {
                    type: isFolder ? 'folder' : 'bookmark',
                    browserId: id,
                    userId,
                    ...processedBookmark
                }
            });
            
            if (isFolder) {
                console.log('Folder created:', processedBookmark);
            } else {
                console.log('Bookmark created:', processedBookmark);
            }
        } catch (error) {
            console.error('Error handling bookmark creation:', error);
        }
    }
    
    private async handleBookmarkRemoved(id: string, removeInfo: chrome.bookmarks.BookmarkRemoveInfo): Promise<void> {
        try {
            if (await this.storageManager.isQueueingSuppressed()) {
                return;
            }
            const userId = await this.storageManager.getUserId();
            // We don't know if it was a folder or bookmark at this point
            // The server will handle both cases the same way
            await this.storageManager.queueChange({
                type: 'DELETE',
                data: {
                    type: 'unknown', // Server will determine based on database lookup
                    browserId: id,
                    userId
                }
            });
            console.log('Bookmark or Folder deleted:', id);
        } catch (error) {
            console.error('Error handling bookmark removal:', error);
        }
    }

    private async handleBookmarkChanged(id: string, changeInfo: chrome.bookmarks.BookmarkChangeInfo): Promise<void> {
        if (await this.storageManager.isQueueingSuppressed()) {
            return;
        }
        // Cancel any pending update for this bookmark
        if (this._pendingUpdates.has(id)) {
            clearTimeout(this._pendingUpdates.get(id));
            this._pendingUpdates.delete(id);
            console.log(`Cancelled pending update for bookmark ${id}`);
        }
        
        // Create a new timeout to process this update after a delay
        const timeout = setTimeout(async () => {
            try {
                // Get current bookmark to include all necessary data
                const [bookmark] = await chrome.bookmarks.get(id);
                const userId = await this.storageManager.getUserId();
                
                // Determine if it's a folder or bookmark based on URL presence
                const type = bookmark.url ? 'bookmark' : 'folder';
                
                // Queue for sync
                await this.storageManager.queueChange({
                    type: 'UPDATE',
                    data: {
                        type: type,
                        browserId: id,
                        userId,
                        title: bookmark.title, // Use current values from bookmark
                        url: bookmark.url,     // not changeInfo which might be outdated
                        parentId: bookmark.parentId,
                        index: bookmark.index,
                        dateAdded: bookmark.dateAdded
                    }
                });
                
                if (type === 'bookmark') {
                    console.log('Bookmark updated (after delay):', { id, type, finalTitle: bookmark.title });
                } else {
                    console.log('Folder updated (after delay):', { id, type, finalTitle: bookmark.title });
                }
                
                // Remove from pending updates
                this._pendingUpdates.delete(id);
            } catch (error) {
                console.error('Error handling bookmark change:', error);
                this._pendingUpdates.delete(id);
            }
        }, 500); // 500ms delay to allow for rapid sequential updates
        
        // Store the timeout
        this._pendingUpdates.set(id, timeout as unknown as number);
        
        console.log(`Scheduled update for bookmark ${id} with title "${changeInfo.title || '(unchanged)'}"`);
    }

    private async handleBookmarkMoved(id: string, moveInfo: chrome.bookmarks.BookmarkMoveInfo): Promise<void> {
        try {
            if (await this.storageManager.isQueueingSuppressed()) {
                return;
            }
            // Get the node to determine if it's a bookmark or folder
            const nodes = await chrome.bookmarks.get(id);
            const node = nodes[0];
            const type = node.url ? 'bookmark' : 'folder';
            const userId = await this.storageManager.getUserId();

            // Only queue if it's a real move (different parent folders)
            if (moveInfo.parentId !== moveInfo.oldParentId) {
                await this.storageManager.queueChange({
                    type: 'MOVE',
                    data: {
                        type: type,
                        browserId: id,
                        userId,
                        parentId: moveInfo.parentId,
                        index: moveInfo.index,
                        moveInfo
                    }
                });
                
                if (type === 'bookmark') {
                    console.log('Bookmark moved:', { id, moveInfo });
                } else {
                    console.log('Folder moved:', { id, moveInfo });
                }
            }
        } catch (error) {
            console.error('Error handling bookmark move:', error);
        }
    }

    private async processBookmark(
        bookmark: chrome.bookmarks.BookmarkTreeNode
    ): Promise<ProcessedBookmark> {
        return {
            id: bookmark.id,
            title: bookmark.title,
            url: bookmark.url,
            parentId: bookmark.parentId,
            position: bookmark.index || 0,
            dateAdded: bookmark.dateAdded
        };
    }
}
