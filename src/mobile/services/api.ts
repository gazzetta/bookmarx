import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL, STORAGE_KEYS } from '../constants/config';
import type { ApiResponse, MasterCollection, CaptureRequest, CaptureResponse, User } from '../types';

class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  private async getAuthToken(): Promise<string | null> {
    return await SecureStore.getItemAsync(STORAGE_KEYS.AUTH_TOKEN);
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const token = await this.getAuthToken();
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    };

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers,
      });

      const data = await response.json();
      
      if (!response.ok) {
        return {
          success: false,
          error: data.error || { message: 'Request failed' },
        };
      }

      return data;
    } catch (error) {
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Network error',
        },
      };
    }
  }

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

  async getMasterCollection(): Promise<ApiResponse<MasterCollection>> {
    const deviceId = await SecureStore.getItemAsync(STORAGE_KEYS.DEVICE_ID);
    return this.request('/sync/master-collection', {
      headers: {
        'X-Device-ID': deviceId || 'mobile-app',
      },
    });
  }

  async getMasterSummary(): Promise<ApiResponse<{ bookmarkCount: number; folderCount: number; lastSyncTimestamp: number; deviceCount: number }>> {
    const deviceId = await SecureStore.getItemAsync(STORAGE_KEYS.DEVICE_ID);
    return this.request('/sync/master-summary', {
      headers: {
        'X-Device-ID': deviceId || 'mobile-app',
      },
    });
  }

  async captureBookmark(data: CaptureRequest): Promise<ApiResponse<CaptureResponse>> {
    const deviceId = await SecureStore.getItemAsync(STORAGE_KEYS.DEVICE_ID);
    return this.request('/capture', {
      method: 'POST',
      headers: {
        'X-Device-ID': deviceId || 'mobile-app',
      },
      body: JSON.stringify(data),
    });
  }

  async updateBookmark(masterId: string, data: { title?: string; url?: string; masterParentId?: string }): Promise<ApiResponse<any>> {
    return this.request('/sync', {
      method: 'POST',
      body: JSON.stringify({
        changes: [{
          type: 'UPDATE',
          data: {
            type: 'bookmark',
            masterId,
            ...data,
          },
          metadata: {
            timestamp: Date.now(),
          },
        }],
      }),
    });
  }

  async deleteBookmark(masterId: string): Promise<ApiResponse<any>> {
    return this.request('/sync', {
      method: 'POST',
      body: JSON.stringify({
        changes: [{
          type: 'DELETE',
          data: {
            type: 'bookmark',
            masterId,
          },
          metadata: {
            timestamp: Date.now(),
          },
        }],
      }),
    });
  }

  async createFolder(title: string, masterParentId?: string): Promise<ApiResponse<any>> {
    return this.request('/sync', {
      method: 'POST',
      body: JSON.stringify({
        changes: [{
          type: 'CREATE',
          data: {
            type: 'folder',
            browserId: `mobile-folder-${Date.now()}`,
            title,
            masterParentId,
            position: 0,
            dateAdded: Date.now(),
          },
          metadata: {
            timestamp: Date.now(),
          },
        }],
      }),
    });
  }

  async updateFolder(masterId: string, data: { title?: string; masterParentId?: string }): Promise<ApiResponse<any>> {
    return this.request('/sync', {
      method: 'POST',
      body: JSON.stringify({
        changes: [{
          type: 'UPDATE',
          data: {
            type: 'folder',
            masterId,
            ...data,
          },
          metadata: {
            timestamp: Date.now(),
          },
        }],
      }),
    });
  }

  async deleteFolder(masterId: string): Promise<ApiResponse<any>> {
    return this.request('/sync', {
      method: 'POST',
      body: JSON.stringify({
        changes: [{
          type: 'DELETE',
          data: {
            type: 'folder',
            masterId,
          },
          metadata: {
            timestamp: Date.now(),
          },
        }],
      }),
    });
  }
}

export const api = new ApiClient();
