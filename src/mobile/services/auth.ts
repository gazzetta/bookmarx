import * as SecureStore from 'expo-secure-store';
import { STORAGE_KEYS } from '../constants/config';
import { api } from './api';
import type { User, AuthState } from '../types';
import { hasPremium } from './entitlements';
import { getSession, isCurrentSession } from './session';

let credentialRevision = 0;
let credentialWrites: Promise<void> = Promise.resolve();
function writeCredentials(write: () => Promise<void>) {
  const task = credentialWrites.then(write);
  credentialWrites = task.catch(() => {});
  return task;
}

class AuthService {
  async login(email: string, password: string): Promise<{ success: boolean; user?: User; token?: string; error?: string }> {
    const revision = ++credentialRevision;
    const response = await api.login(email, password);
    
    if (revision !== credentialRevision) return { success: false, error: 'Sign-in was canceled' };
    if (response.success && response.data) {
      const data = response.data;
      await writeCredentials(async () => {
        if (revision !== credentialRevision) return;
        try {
          await SecureStore.setItemAsync(STORAGE_KEYS.AUTH_TOKEN, data.token);
          await SecureStore.setItemAsync(STORAGE_KEYS.USER_DATA, JSON.stringify(data.user));
        } catch (error) {
          await SecureStore.deleteItemAsync(STORAGE_KEYS.AUTH_TOKEN);
          await SecureStore.deleteItemAsync(STORAGE_KEYS.USER_DATA);
          throw error;
        }
      });
      if (revision !== credentialRevision) return { success: false, error: 'Sign-in was canceled' };
      return { success: true, user: response.data.user, token: response.data.token };
    }
    
    return { success: false, error: response.error?.message || 'Login failed' };
  }

  async register(email: string, password: string, displayName?: string): Promise<{ success: boolean; user?: User; token?: string; error?: string }> {
    const revision = ++credentialRevision;
    const response = await api.register(email, password, displayName);
    
    if (revision !== credentialRevision) return { success: false, error: 'Sign-in was canceled' };
    if (response.success && response.data) {
      const data = response.data;
      await writeCredentials(async () => {
        if (revision !== credentialRevision) return;
        try {
          await SecureStore.setItemAsync(STORAGE_KEYS.AUTH_TOKEN, data.token);
          await SecureStore.setItemAsync(STORAGE_KEYS.USER_DATA, JSON.stringify(data.user));
        } catch (error) {
          await SecureStore.deleteItemAsync(STORAGE_KEYS.AUTH_TOKEN);
          await SecureStore.deleteItemAsync(STORAGE_KEYS.USER_DATA);
          throw error;
        }
      });
      if (revision !== credentialRevision) return { success: false, error: 'Sign-in was canceled' };
      return { success: true, user: response.data.user, token: response.data.token };
    }
    
    return { success: false, error: response.error?.message || 'Registration failed' };
  }

  async logout(): Promise<void> {
    ++credentialRevision;
    await writeCredentials(async () => {
      await SecureStore.deleteItemAsync(STORAGE_KEYS.AUTH_TOKEN);
      await SecureStore.deleteItemAsync(STORAGE_KEYS.USER_DATA);
    });
  }

  async getStoredAuth(): Promise<AuthState> {
    try {
      await credentialWrites;
      const token = await SecureStore.getItemAsync(STORAGE_KEYS.AUTH_TOKEN);
      const userData = await SecureStore.getItemAsync(STORAGE_KEYS.USER_DATA);
      
      if (token && userData) {
        const user = JSON.parse(userData) as User;
        const isPremium = hasPremium(user);
        return {
          token,
          user,
          isLoading: false,
          isAuthenticated: true,
          isPremium,
        };
      }
    } catch (error) {
      console.error('Error getting stored auth:', error);
    }
    
    return {
      token: null,
      user: null,
      isLoading: false,
      isAuthenticated: false,
      isPremium: false,
    };
  }

  async saveUser(user: User): Promise<void> {
    const session = getSession();
    await writeCredentials(async () => {
      if (isCurrentSession(session)) await SecureStore.setItemAsync(STORAGE_KEYS.USER_DATA, JSON.stringify(user));
    });
  }
}

export const authService = new AuthService();
