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
    constructor(private storageManager: StorageManager) {}

    public async initialize(): Promise<void> {
        // Set up bookmark event listeners
        chrome.bookmarks.onCreated.addListener(this.handleBookmarkCreated.bind(this));
        chrome.bookmarks.onRemoved.addListener(this.handleBookmarkRemoved.bind(this));
        chrome.bookmarks.onChanged.addListener(this.handleBookmarkChanged.bind(this));
        chrome.bookmarks.onMoved.addListener(this.handleBookmarkMoved.bind(this));
    }

    private async handleBookmarkCreated(id: string, bookmark: chrome.bookmarks.BookmarkTreeNode): Promise<void> {
        try {
            // Process new bookmark
            const processedBookmark = await this.processBookmark(bookmark);
            const isFolder = !bookmark.url;
            
            // Queue for sync
            await this.storageManager.queueChange({
                type: 'CREATE',
                data: {
                    type: isFolder ? 'folder' : 'bookmark',
                    browserId: id,
                    userId: '1',  // Fixed userId instead of 'default'
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
            // We don't know if it was a folder or bookmark at this point
            // The server will handle both cases the same way
            await this.storageManager.queueChange({
                type: 'DELETE',
                data: {
                    type: 'unknown', // Server will determine based on database lookup
                    browserId: id,
                    userId: '1'
                }
            });
            console.log('Bookmark or Folder deleted:', id);
        } catch (error) {
            console.error('Error handling bookmark removal:', error);
        }
    }

    private async handleBookmarkChanged(id: string, changeInfo: chrome.bookmarks.BookmarkChangeInfo): Promise<void> {
        try {
            // Get current bookmark to include all necessary data
            const [bookmark] = await chrome.bookmarks.get(id);
            
            // Determine if it's a folder or bookmark based on URL presence
            const type = bookmark.url ? 'bookmark' : 'folder';
            
            await this.storageManager.queueChange({
                type: 'UPDATE',
                data: {
                    type: type,
                    browserId: id,
                    title: changeInfo.title || bookmark.title,
                    url: changeInfo.url || bookmark.url,
                    parentId: bookmark.parentId,
                    index: bookmark.index,
                    dateAdded: bookmark.dateAdded
                }
            });
            
            if (type === 'bookmark') {
                console.log('Bookmark updated:', { id, type, changes: changeInfo });
            } else {
                console.log('Folder updated:', { id, type, changes: changeInfo });
            }
        } catch (error) {
            console.error('Error handling bookmark change:', error);
        }
    }

    private async handleBookmarkMoved(id: string, moveInfo: chrome.bookmarks.BookmarkMoveInfo): Promise<void> {
        try {
            // Get the node to determine if it's a bookmark or folder
            const nodes = await chrome.bookmarks.get(id);
            const node = nodes[0];
            const type = node.url ? 'bookmark' : 'folder';

            // Only queue if it's a real move (different parent folders)
            if (moveInfo.parentId !== moveInfo.oldParentId) {
                await this.storageManager.queueChange({
                    type: 'MOVE',
                    data: {
                        type: type,
                        browserId: id,
                        userId: '1',
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
