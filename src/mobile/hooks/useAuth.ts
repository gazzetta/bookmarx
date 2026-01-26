import { useState, useEffect, useCallback } from 'react';
import { authService } from '../services/auth';
import { api } from '../services/api';
import type { AuthState, User, UserStats } from '../types';

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    token: null,
    user: null,
    isLoading: true,
    isAuthenticated: false,
    isPremium: false,
  });
  const [stats, setStats] = useState<UserStats | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = useCallback(async () => {
    setAuthState(prev => ({ ...prev, isLoading: true }));
    const storedAuth = await authService.getStoredAuth();
    
    if (storedAuth.isAuthenticated) {
      const isValid = await authService.validateToken();
      if (!isValid) {
        await authService.logout();
        setAuthState({
          token: null,
          user: null,
          isLoading: false,
          isAuthenticated: false,
          isPremium: false,
        });
        return;
      }
      
      // Fetch user stats to get premium status
      const statsResponse = await api.getUserStats();
      if (statsResponse.success && statsResponse.data) {
        setStats(statsResponse.data);
        setAuthState({
          ...storedAuth,
          isPremium: statsResponse.data.isPremium,
        });
        return;
      }
    }
    
    setAuthState({ ...storedAuth, isPremium: false });
  }, []);

  const refreshStats = useCallback(async () => {
    const statsResponse = await api.getUserStats();
    if (statsResponse.success && statsResponse.data) {
      setStats(statsResponse.data);
      setAuthState(prev => ({
        ...prev,
        isPremium: statsResponse.data!.isPremium,
      }));
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setAuthState(prev => ({ ...prev, isLoading: true }));
    const result = await authService.login(email, password);
    
    if (result.success && result.user) {
      // Fetch stats after login
      const statsResponse = await api.getUserStats();
      const isPremium = statsResponse.success ? statsResponse.data?.isPremium || false : false;
      if (statsResponse.success && statsResponse.data) {
        setStats(statsResponse.data);
      }
      
      setAuthState({
        token: 'token',
        user: result.user,
        isLoading: false,
        isAuthenticated: true,
        isPremium,
      });
      return { success: true };
    }
    
    setAuthState(prev => ({ ...prev, isLoading: false }));
    return { success: false, error: result.error };
  }, []);

  const register = useCallback(async (email: string, password: string, displayName?: string) => {
    setAuthState(prev => ({ ...prev, isLoading: true }));
    const result = await authService.register(email, password, displayName);
    
    if (result.success && result.user) {
      setAuthState({
        token: 'token',
        user: result.user,
        isLoading: false,
        isAuthenticated: true,
        isPremium: false, // New users are free tier
      });
      return { success: true };
    }
    
    setAuthState(prev => ({ ...prev, isLoading: false }));
    return { success: false, error: result.error };
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setStats(null);
    setAuthState({
      token: null,
      user: null,
      isLoading: false,
      isAuthenticated: false,
      isPremium: false,
    });
  }, []);

  return {
    ...authState,
    stats,
    login,
    register,
    logout,
    checkAuth,
    refreshStats,
  };
}
