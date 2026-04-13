const API_URL = process.env.NEXT_PUBLIC_API_URL || ''

export interface User {
  id: string
  email: string
  displayName: string | null
  subscriptionTier: 'free' | 'premium'
  subscriptionExpiresAt: number | null
  bookmarkLimit: number
  browserLimit: number
  collectionLimit: number
  isPremium: boolean
}

export interface AuthResponse {
  token: string
  user: User
}

export interface Collection {
  id: string
  name: string
  description: string | null
  isDefault: number
  sortOrder: number
  status?: string
  archivedAt?: number | null
  createdAt: number
  updatedAt: number
}

export interface GetCollectionsResponse {
  collections: Collection[]
  count: number
  canCreate: boolean
}

export interface Folder {
  id: string
  masterId: string
  title: string
  masterParentId: string | null
  position: number
  collectionId: string | null
}

export interface Bookmark {
  id: string
  masterId: string
  title: string
  url: string
  masterParentId: string | null
  position: number
  collectionId: string | null
  favicon: string | null
}

export interface SessionSummary {
  sessionId: string
  sourceBrowser: string
  timestamp: number
  type: string
  itemCount: number
  bookmarksAdded: number
  foldersAdded: number
}

export interface CopyItem {
  masterId: string
  type: 'folder' | 'bookmark'
  targetParentId: string | null
}

export interface CollectionBrowser {
  browserInstanceId: string
  browser: string
  os: string | null
  nickname: string | null
  lastSeen: number
}

export interface CollectionEvent {
  eventId: string
  collectionId: string
  type: string
  sourceBrowser: string | null
  sessionId: string | null
  changesCount: number
  rolledBackAt: number | null
  timestamp: number
  createdAt: number
  details: Record<string, unknown> | null
}

export interface BrowserHistoryEntry {
  id: number
  browserInstanceId: string
  type: 'INITIAL_IMPORT' | 'SYNC' | 'MERGE_IMPORT'
  changesCount: number
  status: 'SUCCESS' | 'FAILED' | 'PARTIAL'
  bookmarksProcessed: number
  foldersProcessed: number
  collectionName: string
  sessionId: string | null
  timestamp: number
  createdAt: number
}

export interface BrowserHistoryBrowserInfo {
  browserInstanceId: string
  browser: string
  browserVersion: string
  nickname: string | null
  os: string | null
}

export interface UserStats {
  bookmarkCount: number
  browserCount: number
  collectionCount: number
}

export interface AppConfig {
  branding: {
    appName: string
    premiumTitle: string
  }
  pricing: {
    monthly: number
    yearly: number
    lifetime: number
    currency: string
  }
  limits: {
    free: {
      bookmarks: number
      browsers: number
      collections: number
    }
    premium: {
      bookmarks: number
      browsers: number
      collections: number
    }
  }
  abusePrevention: {
    browserRegistrationRateLimit: number
    browserRegistrationRatePeriodDays: number
  }
  features: {
    syncEnabled: boolean
    registrationsEnabled: boolean
  }
}

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const method = options.method ?? 'GET'
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  // Merge existing headers if any
  if (options.headers) {
    const existingHeaders = options.headers as Record<string, string>
    Object.assign(headers, existingHeaders)
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    cache: options.cache ?? (method === 'GET' ? 'no-store' : undefined),
    headers,
  })

  const data = await response.json()

  if (!response.ok || !data.success) {
    throw new Error(data.error?.message || 'API request failed')
  }

  return data.data
}

export const api = {
  // Public config (no auth required)
  getConfig: () =>
    fetchApi<AppConfig>('/api/v1/config'),

  // Auth
  login: (email: string, password: string) =>
    fetchApi<AuthResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  loginWithGoogle: (credential: string) =>
    fetchApi<AuthResponse>('/api/v1/auth/google', {
      method: 'POST',
      body: JSON.stringify({ accessToken: credential }),
    }),

  register: (email: string, password: string) =>
    fetchApi<AuthResponse>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  forgotPassword: (email: string) =>
    fetchApi<{ message: string }>('/api/v1/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, password: string) =>
    fetchApi<{ message: string }>('/api/v1/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),

  getMe: (token: string) =>
    fetchApi<User>('/api/v1/auth/me', {}, token),

  getUserStats: (token: string) =>
    fetchApi<UserStats>('/api/v1/user/stats', {}, token),

  // Collections
  getCollections: (token: string) =>
    fetchApi<GetCollectionsResponse>('/api/v1/collections', {}, token),

  getCollection: (token: string, id: string) =>
    fetchApi<{ collection: Collection; folders: Folder[]; bookmarks: Bookmark[] }>(
      `/api/v1/collections/${id}`,
      {},
      token
    ),

  createCollection: (token: string, name: string, description?: string) =>
    fetchApi<Collection>('/api/v1/collections', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    }, token),

  updateCollection: (token: string, id: string, data: { name?: string; description?: string }) =>
    fetchApi<Collection>(`/api/v1/collections/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }, token),

  deleteCollection: (token: string, id: string) =>
    fetchApi<void>(`/api/v1/collections/${id}`, {
      method: 'DELETE',
    }, token),

  getCollectionEvents: (token: string, id: string) =>
    fetchApi<{ collection: Collection; events: CollectionEvent[]; count: number }>(
      `/api/v1/collections/${id}/events`,
      {},
      token
    ),

  rollbackCollectionEvent: (token: string, collectionId: string, eventId: string) =>
    fetchApi<{ eventId: string; collectionId: string; restoredFolders: number; restoredBookmarks: number; removedFolders: number; removedBookmarks: number }>(
      `/api/v1/collections/${collectionId}/events/${eventId}/rollback`,
      {
        method: 'POST',
      },
      token
    ),

  getCollectionBrowsers: (token: string, collectionId: string) =>
    fetchApi<{ browsers: CollectionBrowser[]; count: number }>(
      `/api/v1/collections/${collectionId}/browsers`,
      {},
      token
    ),

  archiveCollection: (token: string, collectionId: string) =>
    fetchApi<{ message: string; collectionId: string; archivedAt: number; expiresAt: number }>(
      `/api/v1/collections/${collectionId}/archive`,
      { method: 'POST' },
      token
    ),

  copyItemsToCollection: (token: string, destCollectionId: string, sourceCollectionId: string, items: CopyItem[]) =>
    fetchApi<{ copiedFolders: number; copiedBookmarks: number; totalCopied: number }>(
      `/api/v1/collections/${destCollectionId}/copy-from`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceCollectionId, items }),
      },
      token
    ),

  // Sessions
  getSessions: (token: string) =>
    fetchApi<{ sessions: SessionSummary[]; count: number }>('/api/v1/sessions', {}, token),

  getSession: (token: string, sessionId: string) =>
    fetchApi<{ session: SessionSummary; folders: Folder[]; bookmarks: Bookmark[] }>(
      `/api/v1/sessions/${sessionId}`,
      {},
      token
    ),

  getBrowserHistoryDetail: (token: string, browserInstanceId: string, historyId: string) =>
    fetchApi<{ browser: BrowserHistoryBrowserInfo; history: BrowserHistoryEntry; folders: Folder[]; bookmarks: Bookmark[] }>(
      `/api/v1/user/browsers/${browserInstanceId}/history/${historyId}`,
      {},
      token
    ),

  rollbackSession: (token: string, sessionId: string) =>
    fetchApi<{ rolledBackCount: number }>(`/api/v1/sessions/${sessionId}/rollback`, {
      method: 'POST',
    }, token),

  restoreSession: (token: string, sessionId: string) =>
    fetchApi<{ restoredCount: number }>(`/api/v1/sessions/${sessionId}/restore`, {
      method: 'POST',
    }, token),

  // Bookmarks Tree (for collection view/edit)
  getBookmarkTree: (token: string, userId: string) =>
    fetchApi<{ folders: Folder[]; bookmarks: Bookmark[] }>(
      `/api/v1/bookmarks/tree/${userId}`,
      {},
      token
    ),

  // Checkout
  createCheckout: (token: string, plan: 'monthly' | 'yearly' | 'lifetime') =>
    fetchApi<{ checkoutUrl: string }>('/api/v1/checkout/create', {
      method: 'POST',
      body: JSON.stringify({ plan }),
    }, token),

  // Editor changes
  applyChanges: (token: string, collectionId: string, changes: EditorChange[]) => {
    const typeMap: Record<string, string> = {
      'MOVE': 'move',
      'RENAME': 'rename',
      'UPDATE_URL': 'update-url',
      'DELETE': 'delete',
      'CREATE_FOLDER': 'add-folder',
      'CREATE_BOOKMARK': 'add-bookmark',
      'COPY_FROM': 'copy-from',
    }

    const transformed = changes.map(c => {
      const mapped: Record<string, unknown> = { ...c, type: typeMap[c.type] || c.type }
      if (c.type === 'RENAME') { mapped.newTitle = c.title }
      if (c.type === 'MOVE') { mapped.newParentId = c.parentId }
      if (c.type === 'UPDATE_URL') { mapped.newUrl = c.url }
      return mapped
    })

    return fetchApi<{ applied: number; errors: string[] }>(
      `/api/v1/collections/${collectionId}/changes`,
      {
        method: 'POST',
        body: JSON.stringify({ changes: transformed }),
      },
      token
    )
  },
}

export interface EditorChange {
  type: 'MOVE' | 'RENAME' | 'UPDATE_URL' | 'DELETE' | 'CREATE_FOLDER' | 'CREATE_BOOKMARK' | 'COPY_FROM'
  itemType: 'folder' | 'bookmark'
  itemId?: string
  parentId?: string
  position?: number
  title?: string
  url?: string
  sourceCollectionId?: string
  copyItems?: CopyItem[]
}
