import * as SecureStore from 'expo-secure-store';
import { STORAGE_KEYS } from '../constants/config';
import { api } from './api';
import type { User, AuthState } from '../types';

class AuthService {
  async login(email: string, password: string): Promise<{ success: boolean; user?: User; error?: string }> {
    const response = await api.login(email, password);
    
    if (response.success && response.data) {
      await SecureStore.setItemAsync(STORAGE_KEYS.AUTH_TOKEN, response.data.token);
      await SecureStore.setItemAsync(STORAGE_KEYS.USER_DATA, JSON.stringify(response.data.user));
      return { success: true, user: response.data.user };
    }
    
    return { success: false, error: response.error?.message || 'Login failed' };
  }

  async register(email: string, password: string, displayName?: string): Promise<{ success: boolean; user?: User; error?: string }> {
    const response = await api.register(email, password, displayName);
    
    if (response.success && response.data) {
      await SecureStore.setItemAsync(STORAGE_KEYS.AUTH_TOKEN, response.data.token);
      await SecureStore.setItemAsync(STORAGE_KEYS.USER_DATA, JSON.stringify(response.data.user));
      return { success: true, user: response.data.user };
    }
    
    return { success: false, error: response.error?.message || 'Registration failed' };
  }

  async logout(): Promise<void> {
    await SecureStore.deleteItemAsync(STORAGE_KEYS.AUTH_TOKEN);
    await SecureStore.deleteItemAsync(STORAGE_KEYS.USER_DATA);
  }

  async getStoredAuth(): Promise<AuthState> {
    try {
      const token = await SecureStore.getItemAsync(STORAGE_KEYS.AUTH_TOKEN);
      const userData = await SecureStore.getItemAsync(STORAGE_KEYS.USER_DATA);
      
      if (token && userData) {
        const user = JSON.parse(userData) as User;
        const isPremium = user.subscriptionTier === 'premium' || user.subscriptionTier === 'lifetime';
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

  async validateToken(): Promise<boolean> {
    const response = await api.getMe();
    return response.success;
  }
}

export const authService = new AuthService();
