import { useState, useEffect, useCallback } from 'react';
import { authService } from '../services/auth';
import type { AuthState, User } from '../types';

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    token: null,
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

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
        });
        return;
      }
    }
    
    setAuthState(storedAuth);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setAuthState(prev => ({ ...prev, isLoading: true }));
    const result = await authService.login(email, password);
    
    if (result.success && result.user) {
      setAuthState({
        token: 'token',
        user: result.user,
        isLoading: false,
        isAuthenticated: true,
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
      });
      return { success: true };
    }
    
    setAuthState(prev => ({ ...prev, isLoading: false }));
    return { success: false, error: result.error };
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setAuthState({
      token: null,
      user: null,
      isLoading: false,
      isAuthenticated: false,
    });
  }, []);

  return {
    ...authState,
    login,
    register,
    logout,
    checkAuth,
  };
}
