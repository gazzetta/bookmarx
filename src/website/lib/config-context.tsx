'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { api, AppConfig } from './api'

// Default config values as fallback
const defaultConfig: AppConfig = {
    branding: {
        appName: 'BookMarx',
        premiumTitle: 'Premium'
    },
    pricing: {
        monthly: 249,
        yearly: 2499,
        lifetime: 4999,
        currency: 'USD'
    },
    limits: {
        free: {
            bookmarks: 250,
            browsers: 2,
            collections: 1
        },
        premium: {
            bookmarks: 10000,
            browsers: 100,
            collections: 50
        }
    },
    abusePrevention: {
        browserRegistrationRateLimit: 5,
        browserRegistrationRatePeriodDays: 30
    },
    features: {
        syncEnabled: true,
        registrationsEnabled: true
    }
}

interface ConfigContextType {
    config: AppConfig
    isLoading: boolean
    error: string | null
    refreshConfig: () => Promise<void>
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined)

export function ConfigProvider({ children }: { children: ReactNode }) {
    const [config, setConfig] = useState<AppConfig>(defaultConfig)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const fetchConfig = async () => {
        try {
            const serverConfig = await api.getConfig()
            setConfig(serverConfig)
            setError(null)
        } catch (err) {
            console.error('Failed to load app config:', err)
            setError('Failed to load configuration')
            // Keep using default config on error
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        fetchConfig()
    }, [])

    return (
        <ConfigContext.Provider value={{
            config,
            isLoading,
            error,
            refreshConfig: fetchConfig
        }}>
            {children}
        </ConfigContext.Provider>
    )
}

export function useConfig() {
    const context = useContext(ConfigContext)
    if (context === undefined) {
        throw new Error('useConfig must be used within a ConfigProvider')
    }
    return context
}
