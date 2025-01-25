import { StorageManager } from './StorageManager';

interface ProcessedBookmark {
    id: string;
    title: string;
    url?: string;
    parentId?: string;
    index?: number;
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
            // Queue for sync
            await this.storageManager.queueChange({
                type: 'CREATE',
                data: processedBookmark
            });
            console.log('Bookmark created:', processedBookmark);
        } catch (error) {
            console.error('Error handling bookmark creation:', error);
        }
    }
    
    private async handleBookmarkRemoved(id: string, removeInfo: chrome.bookmarks.BookmarkRemoveInfo): Promise<void> {
        try {
            await this.storageManager.queueChange({
                type: 'DELETE',
                data: { id }
            });
            console.log('Bookmark deleted:', id);
        } catch (error) {
            console.error('Error handling bookmark removal:', error);
        }
    }

    private async handleBookmarkChanged(id: string, changeInfo: chrome.bookmarks.BookmarkChangeInfo): Promise<void> {
        try {
            // Queue the update
            await this.storageManager.queueChange({
                type: 'UPDATE',
                data: { id, changes: changeInfo }
            });
            console.log('Bookmark updated:', { id, changes: changeInfo });
        } catch (error) {
            console.error('Error handling bookmark change:', error);
        }
    }

    private async handleBookmarkMoved(id: string, moveInfo: chrome.bookmarks.BookmarkMoveInfo): Promise<void> {
        try {
            // Only queue if it's a real move (different parent folders)
            if (moveInfo.parentId !== moveInfo.oldParentId) {
                await this.storageManager.queueChange({
                    type: 'MOVE',
                    data: { id, moveInfo }
                });
                console.log('Bookmark moved:', { id, moveInfo });
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
            index: bookmark.index,
            dateAdded: bookmark.dateAdded
        };
    }
}