const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005'

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
  createdAt: number
  updatedAt: number
}

export interface Folder {
  id: string
  masterId: string
  title: string
  masterParentId: string | null
  sortOrder: number
  collectionId: string | null
}

export interface Bookmark {
  id: string
  masterId: string
  title: string
  url: string
  masterParentId: string | null
  sortOrder: number
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

export interface UserStats {
  bookmarkCount: number
  browserCount: number
  collectionCount: number
}

async function fetchApi<T>(
  endpoint: string, 
  options: RequestInit = {},
  token?: string
): Promise<T> {
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
    headers,
  })

  const data = await response.json()

  if (!response.ok || !data.success) {
    throw new Error(data.error?.message || 'API request failed')
  }

  return data.data
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    fetchApi<AuthResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (email: string, password: string) =>
    fetchApi<AuthResponse>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  getMe: (token: string) =>
    fetchApi<User>('/api/v1/auth/me', {}, token),

  getUserStats: (token: string) =>
    fetchApi<UserStats>('/api/v1/user/stats', {}, token),

  // Collections
  getCollections: (token: string) =>
    fetchApi<Collection[]>('/api/v1/collections', {}, token),

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

  // Sessions
  getSessions: (token: string) =>
    fetchApi<SessionSummary[]>('/api/v1/sessions', {}, token),

  getSession: (token: string, sessionId: string) =>
    fetchApi<{ session: SessionSummary; folders: Folder[]; bookmarks: Bookmark[] }>(
      `/api/v1/sessions/${sessionId}`,
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

  // Editor changes
  applyChanges: (token: string, collectionId: string, changes: EditorChange[]) =>
    fetchApi<{ applied: number; errors: string[] }>(
      `/api/v1/collections/${collectionId}/changes`,
      {
        method: 'POST',
        body: JSON.stringify({ changes }),
      },
      token
    ),
}

export interface EditorChange {
  type: 'MOVE' | 'RENAME' | 'UPDATE_URL' | 'DELETE' | 'CREATE_FOLDER' | 'CREATE_BOOKMARK'
  itemType: 'folder' | 'bookmark'
  itemId?: string
  parentId?: string
  position?: number
  title?: string
  url?: string
}
