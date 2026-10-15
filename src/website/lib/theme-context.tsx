'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useCookieConsent } from './cookie-consent'

type Theme = 'light' | 'dark'

interface ThemeContextType {
  theme: Theme
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  toggleTheme: () => {},
  setTheme: () => {},
})

export function useTheme() {
  return useContext(ThemeContext)
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { consent, ready } = useCookieConsent()
  const [theme, setThemeState] = useState<Theme>('dark')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
// eslint-disable-next-line react-hooks/set-state-in-effect -- Hydrate browser storage or initiate the asynchronous server refresh once on mount.
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!ready || !consent?.preferences) return
    try {
      const stored = localStorage.getItem('bookmarx-theme')
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Restore an explicitly permitted theme preference.
      if (stored === 'dark' || stored === 'light') setThemeState(stored)
    } catch { /* Theme still works for this visit when storage is blocked. */ }
  }, [ready, consent?.preferences])

  useEffect(() => {
    if (!mounted) return
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    if (ready && consent?.preferences) {
      try { localStorage.setItem('bookmarx-theme', theme) } catch { /* Optional persistence. */ }
    }
  }, [theme, mounted, ready, consent?.preferences])

  const toggleTheme = useCallback(() => {
    setThemeState(prev => prev === 'light' ? 'dark' : 'light')
  }, [])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
