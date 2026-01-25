import { useState, useCallback } from 'react';
import { api } from '../services/api';
import type { Bookmark, Folder, MasterCollection } from '../types';

export function useBookmarks() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMasterCollection = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    const response = await api.getMasterCollection();
    
    if (response.success && response.data) {
      setBookmarks(response.data.bookmarks);
      setFolders(response.data.folders);
    } else {
      setError(response.error?.message || 'Failed to fetch bookmarks');
    }
    
    setIsLoading(false);
  }, []);

  const getBookmarksInFolder = useCallback((masterParentId: string | null) => {
    return bookmarks.filter(b => b.masterParentId === masterParentId);
  }, [bookmarks]);

  const getFoldersInFolder = useCallback((masterParentId: string | null) => {
    return folders.filter(f => f.masterParentId === masterParentId);
  }, [folders]);

  const captureBookmark = useCallback(async (url: string, title?: string, masterParentId?: string) => {
    const response = await api.captureBookmark({ url, title, masterParentId });
    
    if (response.success) {
      await fetchMasterCollection();
      return { success: true, data: response.data };
    }
    
    return { success: false, error: response.error?.message };
  }, [fetchMasterCollection]);

  const deleteBookmark = useCallback(async (masterId: string) => {
    const response = await api.deleteBookmark(masterId);
    
    if (response.success) {
      setBookmarks(prev => prev.filter(b => b.masterId !== masterId));
      return { success: true };
    }
    
    return { success: false, error: response.error?.message };
  }, []);

  const createFolder = useCallback(async (title: string, masterParentId?: string) => {
    const response = await api.createFolder(title, masterParentId);
    
    if (response.success) {
      await fetchMasterCollection();
      return { success: true };
    }
    
    return { success: false, error: response.error?.message };
  }, [fetchMasterCollection]);

  const deleteFolder = useCallback(async (masterId: string) => {
    const response = await api.deleteFolder(masterId);
    
    if (response.success) {
      setFolders(prev => prev.filter(f => f.masterId !== masterId));
      return { success: true };
    }
    
    return { success: false, error: response.error?.message };
  }, []);

  return {
    bookmarks,
    folders,
    isLoading,
    error,
    fetchMasterCollection,
    getBookmarksInFolder,
    getFoldersInFolder,
    captureBookmark,
    deleteBookmark,
    createFolder,
    deleteFolder,
  };
}
