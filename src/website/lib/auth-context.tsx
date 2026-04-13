'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { api, User, AuthResponse } from './api'

interface AuthContextType {
  user: User | null
  token: string | null
  isLoading: boolean
  isPremium: boolean
  login: (email: string, password: string) => Promise<void>
  loginWithGoogle: (credential: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Check for stored token on mount
    const storedToken = localStorage.getItem('bookmarx_token')
    const storedUser = localStorage.getItem('bookmarx_user')

    if (storedToken && storedUser) {
      setToken(storedToken)
      setUser(JSON.parse(storedUser))
      // Refresh user data from server
      refreshUserData(storedToken)
    }
    setIsLoading(false)
  }, [])

  const refreshUserData = async (authToken: string) => {
    try {
      const userData = await api.getMe(authToken)
      setUser(userData)
      localStorage.setItem('bookmarx_user', JSON.stringify(userData))
    } catch (error) {
      // Token might be invalid, clear auth
      console.error('Failed to refresh user data:', error)
      logout()
    }
  }

  const login = async (email: string, password: string) => {
    const response = await api.login(email, password)
    setToken(response.token)
    setUser(response.user)
    localStorage.setItem('bookmarx_token', response.token)
    localStorage.setItem('bookmarx_user', JSON.stringify(response.user))
  }

  const loginWithGoogle = async (credential: string) => {
    const response = await api.loginWithGoogle(credential)
    setToken(response.token)
    setUser(response.user)
    localStorage.setItem('bookmarx_token', response.token)
    localStorage.setItem('bookmarx_user', JSON.stringify(response.user))
  }

  const register = async (email: string, password: string) => {
    const response = await api.register(email, password)
    setToken(response.token)
    setUser(response.user)
    localStorage.setItem('bookmarx_token', response.token)
    localStorage.setItem('bookmarx_user', JSON.stringify(response.user))
  }

  const logout = () => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('bookmarx_token')
    localStorage.removeItem('bookmarx_user')
  }

  const refreshUser = async () => {
    if (token) {
      await refreshUserData(token)
    }
  }

  const isPremium = user?.isPremium ?? false

  return (
    <AuthContext.Provider value={{
      user,
      token,
      isLoading,
      isPremium,
      login,
      loginWithGoogle,
      register,
      logout,
      refreshUser
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
