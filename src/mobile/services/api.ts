import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { API_BASE_URL, STORAGE_KEYS } from '../constants/config';
import { getDeviceId } from './device';
import type {
  ApiResponse, MasterCollection, CaptureRequest, CaptureResponse,
  User, UserStats, Session, Collection, AppConfig,
} from '../types';

const REQUEST_TIMEOUT_MS = 15000;

interface RequestOptions extends RequestInit {
  /** Scope sync endpoints to a non-default collection (X-Collection-ID). */
  collectionId?: string | null;
}

type UnauthorizedHandler = () => void;

class ApiClient {
  private baseUrl: string;
  private unauthorizedHandler: UnauthorizedHandler | null = null;

  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  /** Registered by the auth store so a 401 clears the session. */
  setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
    this.unauthorizedHandler = handler;
  }

  private async getAuthToken(): Promise<string | null> {
    return SecureStore.getItemAsync(STORAGE_KEYS.AUTH_TOKEN);
  }

  private async request<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const { collectionId, headers: extraHeaders, ...init } = options;
    const token = await this.getAuthToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(collectionId ? { 'X-Collection-ID': collectionId } : {}),
      ...(extraHeaders as Record<string, string> | undefined),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...init,
        headers,
        signal: controller.signal,
      });

      let data: any = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        if (response.status === 401 && !endpoint.startsWith('/auth/login') && !endpoint.startsWith('/auth/register')) {
          this.unauthorizedHandler?.();
        }
        return {
          success: false,
          error: data?.error || { message: `Request failed (${response.status})` },
        };
      }

      return data as ApiResponse<T>;
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === 'AbortError';
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: isTimeout
            ? 'Request timed out'
            : error instanceof Error
              ? error.message
              : 'Network error',
        },
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async syncRequest<T>(
    body: Record<string, unknown>,
    collectionId?: string | null
  ): Promise<ApiResponse<T>> {
    const deviceId = await getDeviceId();
    return this.request<T>('/sync', {
      method: 'POST',
      collectionId,
      headers: {
        'X-Device-ID': deviceId,
        'X-Browser-Instance-ID': deviceId,
      },
      body: JSON.stringify(body),
    });
  }

  /**
   * POST /sync with the metadata.contract the server requires:
   * metadata.deviceInfo.browserInstanceId on the body AND on every change
   * (a change's own metadata overrides the body for the identity check),
   * plus top-level deviceId used for sync history rows.
   */
  private async applyChanges(
    changes: Array<{ type: string; data: Record<string, unknown> }>,
    collectionId?: string | null
  ): Promise<ApiResponse<{ action: string; changesApplied: number; results: any[] }>> {
    const deviceId = await getDeviceId();
    const deviceInfo = {
      browserInstanceId: deviceId,
      browser: 'BookMarx Mobile',
      os: Platform.OS,
    };
    return this.syncRequest(
      {
        deviceId,
        changes: changes.map((change) => ({
          ...change,
          operationId: Crypto.randomUUID(),
          metadata: { timestamp: Date.now(), deviceInfo },
        })),
        metadata: { timestamp: Date.now(), deviceInfo },
      },
      collectionId
    );
  }

  // ---- Auth ----

  async login(email: string, password: string): Promise<ApiResponse<{ token: string; user: User }>> {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async register(email: string, password: string, displayName?: string): Promise<ApiResponse<{ token: string; user: User }>> {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName }),
    });
  }

  async getMe(): Promise<ApiResponse<{ user: User }>> {
    return this.request('/auth/me');
  }

  // ---- Public app config (pricing/limits/features for upgrade screen) ----

  async getAppConfig(): Promise<ApiResponse<AppConfig>> {
    return this.request('/config');
  }

  // ---- Stats / sessions ----

  async getUserStats(): Promise<ApiResponse<UserStats>> {
    return this.request('/user/stats');
  }

  async getSessions(limit = 20): Promise<ApiResponse<{ sessions: Session[] }>> {
    return this.request(`/sessions?limit=${limit}`);
  }

  async getSessionDetails(sessionId: number): Promise<ApiResponse<{ session: Session; items: any[] }>> {
    return this.request(`/sessions/${sessionId}`);
  }

  async rollbackSession(sessionId: number): Promise<ApiResponse<{ message: string; affectedItems: number }>> {
    return this.request(`/sessions/${sessionId}/rollback`, { method: 'POST' });
  }

  async restoreSession(sessionId: number): Promise<ApiResponse<{ message: string; affectedItems: number }>> {
    return this.request(`/sessions/${sessionId}/restore`, { method: 'POST' });
  }

  // ---- Collections ----

  async getCollections(): Promise<ApiResponse<{ collections: Collection[]; count: number; canCreate: boolean }>> {
    return this.request('/collections');
  }

  async getCollection(collectionId: string): Promise<ApiResponse<{ collection: Collection; folders: any[]; bookmarks: any[] }>> {
    return this.request(`/collections/${collectionId}`);
  }

  async createCollection(name: string, description?: string): Promise<ApiResponse<{ collection: Collection }>> {
    return this.request('/collections', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    });
  }

  async updateCollection(collectionId: string, data: { name?: string; description?: string }): Promise<ApiResponse<{ collection: Collection }>> {
    return this.request(`/collections/${collectionId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async archiveCollection(collectionId: string): Promise<ApiResponse<{ message: string }>> {
    return this.request(`/collections/${collectionId}/archive`, { method: 'POST' });
  }

  async deleteCollection(collectionId: string): Promise<ApiResponse<{ message: string }>> {
    return this.request(`/collections/${collectionId}`, { method: 'DELETE' });
  }

  /**
   * Batch collection edits (premium). Mirrors the web editor's change format.
   */
  async applyCollectionChanges(
    collectionId: string,
    changes: Array<Record<string, unknown>>
  ): Promise<ApiResponse<{ applied: number; failed: number; results: any[] }>> {
    return this.request(`/collections/${collectionId}/changes`, {
      method: 'POST',
      body: JSON.stringify({ changes }),
    });
  }

  // ---- Collection contents (via sync read endpoints) ----

  async getMasterCollection(collectionId?: string | null): Promise<ApiResponse<MasterCollection>> {
    const deviceId = await getDeviceId();
    return this.request('/sync/master-collection', {
      collectionId,
      headers: {
        'X-Device-ID': deviceId,
        'X-Browser-Instance-ID': deviceId,
      },
    });
  }

  async getMasterSummary(collectionId?: string | null): Promise<ApiResponse<{ bookmarkCount: number; folderCount: number; lastSyncTimestamp: number; deviceCount: number }>> {
    const deviceId = await getDeviceId();
    return this.request('/sync/master-summary', {
      collectionId,
      headers: { 'X-Device-ID': deviceId },
    });
  }

  // ---- Capture (always lands in the DEFAULT collection) ----

  async captureBookmark(data: CaptureRequest): Promise<ApiResponse<CaptureResponse>> {
    const deviceId = await getDeviceId();
    return this.request('/capture', {
      method: 'POST',
      headers: { 'X-Device-ID': deviceId },
      body: JSON.stringify(data),
    });
  }

  // ---- Bookmark/folder mutations (scoped by collectionId) ----

  async createBookmark(
    data: { url: string; title?: string; masterParentId?: string | null },
    collectionId?: string | null
  ): Promise<ApiResponse<any>> {
    return this.applyChanges(
      [{
        type: 'CREATE',
        data: {
          type: 'bookmark',
          browserId: `mobile-bm-${Crypto.randomUUID()}`,
          url: data.url,
          title: data.title || data.url,
          masterParentId: data.masterParentId ?? null,
          position: 0,
          dateAdded: Date.now(),
        },
      }],
      collectionId
    );
  }

  async updateBookmark(
    masterId: string,
    data: { title?: string; url?: string; masterParentId?: string | null },
    collectionId?: string | null
  ): Promise<ApiResponse<any>> {
    return this.applyChanges(
      [{
        type: 'UPDATE',
        data: { type: 'bookmark', masterId, ...data },
      }],
      collectionId
    );
  }

  async deleteBookmark(masterId: string, collectionId?: string | null): Promise<ApiResponse<any>> {
    return this.applyChanges(
      [{
        type: 'DELETE',
        data: { type: 'bookmark', masterId },
      }],
      collectionId
    );
  }

  async createFolder(
    title: string,
    masterParentId?: string | null,
    collectionId?: string | null
  ): Promise<ApiResponse<any>> {
    return this.applyChanges(
      [{
        type: 'CREATE',
        data: {
          type: 'folder',
          browserId: `mobile-f-${Crypto.randomUUID()}`,
          title,
          masterParentId: masterParentId ?? null,
          position: 0,
          dateAdded: Date.now(),
        },
      }],
      collectionId
    );
  }

  async updateFolder(
    masterId: string,
    data: { title?: string; masterParentId?: string | null },
    collectionId?: string | null
  ): Promise<ApiResponse<any>> {
    return this.applyChanges(
      [{
        type: 'UPDATE',
        data: { type: 'folder', masterId, ...data },
      }],
      collectionId
    );
  }

  async deleteFolder(masterId: string, collectionId?: string | null): Promise<ApiResponse<any>> {
    return this.applyChanges(
      [{
        type: 'DELETE',
        data: { type: 'folder', masterId },
      }],
      collectionId
    );
  }
}

export const api = new ApiClient();
