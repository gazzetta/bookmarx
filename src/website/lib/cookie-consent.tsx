'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export const CONSENT_KEY = 'bookmarx-consent'
export const CONSENT_VERSION = 1
export const CONSENT_MAX_AGE = 180 * 24 * 60 * 60 * 1000
export interface Consent { version: number; savedAt: number; analytics: boolean; preferences: boolean }

export function parseConsent(value: string | null): Consent | null {
  try {
    const data = JSON.parse(value || 'null')
    return data?.version === CONSENT_VERSION && typeof data.savedAt === 'number' && data.savedAt <= Date.now()
      && Date.now() - data.savedAt < CONSENT_MAX_AGE && typeof data.analytics === 'boolean'
      && typeof data.preferences === 'boolean' ? data : null
  } catch { return null }
}

export function clearAnalyticsCookies() {
  for (const key of Object.keys(window)) {
    if (key.startsWith('ga-disable-G-')) (window as unknown as Record<string, unknown>)[key] = true
  }
  const domains = [undefined, location.hostname, `.${location.hostname}`]
  const parts = location.hostname.split('.')
  for (let i = 1; i < parts.length - 1; i++) domains.push(`.${parts.slice(i).join('.')}`)
  for (const name of document.cookie.split(';').map(cookie => cookie.trim().split('=')[0])) {
    if (!/^_ga(?:_|$)|^_gid$|^_gat(?:_|$)/.test(name)) continue
    for (const domain of domains) document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${domain ? `; Domain=${domain}` : ''}`
  }
}

const Context = createContext<{
  consent: Consent | null; ready: boolean; settingsOpen: boolean;
  openSettings: () => void; closeSettings: () => void;
  save: (choices: Pick<Consent, 'analytics' | 'preferences'>) => void
} | null>(null)

export function CookieConsentProvider({ children }: { children: ReactNode }) {
  const [consent, setConsent] = useState<Consent | null>(null)
  const [ready, setReady] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  useEffect(() => {
    let stored = null
    try { stored = parseConsent(localStorage.getItem(CONSENT_KEY)) } catch { /* Storage can be disabled. */ }
    if (!stored?.analytics) clearAnalyticsCookies()
    if (!stored?.preferences) { try { localStorage.removeItem('bookmarx-theme') } catch { /* Optional storage. */ } }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydrate the saved consent once on mount.
    setConsent(stored)
    setReady(true)
    const otherTab = (event: StorageEvent) => {
      if (event.key === CONSENT_KEY || event.key === null) location.reload()
    }
    window.addEventListener('storage', otherTab)
    return () => window.removeEventListener('storage', otherTab)
  }, [])
  const save = (choices: Pick<Consent, 'analytics' | 'preferences'>) => {
    const next = { ...choices, version: CONSENT_VERSION, savedAt: Date.now() }
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify(next))
      if (!next.preferences) localStorage.removeItem('bookmarx-theme')
    } catch { /* A blocked storage provider keeps choices for this page only. */ }
    if (!next.analytics) clearAnalyticsCookies()
    setConsent(next); setSettingsOpen(false)
    // Reload removes already-running vendor code when consent is withdrawn.
    if (consent?.analytics && !next.analytics) location.reload()
  }
  useEffect(() => {
    if (!consent) return
    let timer: ReturnType<typeof setTimeout>
    const checkExpiry = () => {
      const remaining = consent.savedAt + CONSENT_MAX_AGE - Date.now()
      if (remaining > 0) { timer = setTimeout(checkExpiry, Math.min(remaining, 2147483647)); return }
      clearAnalyticsCookies()
      try { localStorage.removeItem(CONSENT_KEY); localStorage.removeItem('bookmarx-theme') } catch { /* Optional storage. */ }
      setConsent(null)
      if (consent.analytics) location.reload()
    }
    checkExpiry()
    return () => clearTimeout(timer)
  }, [consent])
  return <Context.Provider value={{ consent, ready, settingsOpen, openSettings: () => setSettingsOpen(true),
    closeSettings: () => setSettingsOpen(false), save }}>{children}</Context.Provider>
}

export function useCookieConsent() {
  const context = useContext(Context)
  if (!context) throw new Error('CookieConsentProvider is required')
  return context
}
