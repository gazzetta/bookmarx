import { useBookmarkStore } from '../store/bookmarkStore';

/**
 * Backwards-compatible wrapper over the global bookmark store.
 * New code should use `useBookmarkStore` directly.
 */
export function useBookmarks() {
  const store = useBookmarkStore();
  return {
    bookmarks: store.bookmarks,
    folders: store.folders,
    isLoading: store.isLoading,
    error: store.error,
    fetchMasterCollection: store.fetchMasterCollection,
    getBookmarksInFolder: store.getBookmarksInFolder,
    getFoldersInFolder: store.getFoldersInFolder,
    captureBookmark: store.addBookmark,
    addBookmark: store.addBookmark,
    updateBookmark: store.updateBookmark,
    deleteBookmark: store.deleteBookmark,
    createFolder: store.createFolder,
    updateFolder: store.updateFolder,
    deleteFolder: store.deleteFolder,
  };
}
