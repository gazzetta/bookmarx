export interface User {
  id: string;
  email: string;
  displayName: string | null;
  subscriptionTier?: 'free' | 'premium' | 'lifetime';
  subscriptionStatus?: 'active' | 'canceled' | 'past_due' | 'expired';
  subscriptionEndsAt?: string | null;
}

export interface AuthState {
  token: string | null;
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isPremium: boolean;
}

export interface Bookmark {
  id: number;
  masterId: string;
  browserId: string;
  userId: string;
  url: string;
  title: string;
  parentId: string;
  masterParentId: string | null;
  position: number;
  dateAdded: number;
  status: 'active' | 'deleted';
  syncVersion: number;
  createdAt: number;
  updatedAt: number;
}

export interface Folder {
  id: number;
  masterId: string;
  browserId: string;
  userId: string;
  title: string;
  parentId: string | null;
  masterParentId: string | null;
  position: number;
  dateAdded: number;
  status: 'active' | 'deleted';
  syncVersion: number;
  createdAt: number;
  updatedAt: number;
}

export interface MasterCollection {
  folders: Folder[];
  bookmarks: Bookmark[];
  timestamp: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    details?: string;
  };
}

export interface CaptureRequest {
  url: string;
  title?: string;
  parentId?: string;
  masterParentId?: string;
}

export interface CaptureResponse {
  masterId: string;
  url: string;
  title: string;
  parentId: string;
  masterParentId: string | null;
  createdAt: number;
}

export interface UserStats {
  bookmarkCount: number;
  folderCount: number;
  browserCount: number;
  collectionCount: number;
  limits: {
    maxBookmarks: number | null;
    maxBrowsers: number | null;
    maxCollections: number | null;
  };
  isPremium: boolean;
  subscriptionTier: string;
}

export interface Session {
  id: number;
  type: string;
  changesCount: number;
  status: string;
  bookmarksProcessed: number;
  foldersProcessed: number;
  timestamp: number;
  createdAt: string;
}

export interface Collection {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}
