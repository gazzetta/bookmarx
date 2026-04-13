'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import DashboardLayout from '@/components/DashboardLayout'

interface SyncDetails {
    changesProcessed?: number
    bookmarksCreated?: number
    foldersCreated?: number
    bookmarksUpdated?: number
    foldersUpdated?: number
    bookmarksDeleted?: number
    foldersDeleted?: number
    bookmarksSkipped?: number
    foldersSkipped?: number
}

interface SyncHistory {
    id: number
    browserInstanceId: string
    type: 'INITIAL_IMPORT' | 'SYNC' | 'MERGE_IMPORT'
    changesCount: number
    status: 'SUCCESS' | 'FAILED' | 'PARTIAL'
    bookmarksProcessed: number
    foldersProcessed: number
    collectionName: string
    sessionId: string | null
    timestamp: number
    createdAt: number
    details: SyncDetails | null
}

interface BrowserInfo {
    browserInstanceId: string
    browser: string
    browserVersion: string
    nickname: string | null
    os: string | null
}

export default function BrowserHistoryPage() {
    const router = useRouter()
    const params = useParams()
    const browserInstanceId = params.browserInstanceId as string
    const { user, token, isLoading } = useAuth()
    const [history, setHistory] = useState<SyncHistory[]>([])
    const [browserInfo, setBrowserInfo] = useState<BrowserInfo | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!isLoading && !user) {
            router.push('/login')
        }
    }, [isLoading, user, router])

    useEffect(() => {
        if (token && browserInstanceId) {
            fetchHistory()
        }
    }, [token, browserInstanceId])

    const fetchHistory = async () => {
        if (!token) return

        setLoading(true)
        setError(null)

        try {
            const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005'
            const response = await fetch(`${API_URL}/api/v1/user/browsers/${browserInstanceId}/history`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            })

            const data = await response.json()

            if (data.success) {
                setHistory(data.data.history || [])
                setBrowserInfo(data.data.browser || null)
            } else {
                setError(data.error?.message || 'Failed to fetch history')
            }
        } catch (err) {
            setError('Failed to connect to server')
            console.error('Failed to fetch history:', err)
        } finally {
            setLoading(false)
        }
    }

    const formatDate = (timestamp: number | null) => {
        if (!timestamp) return 'N/A'
        const ms = timestamp < 1e12 ? timestamp * 1000 : timestamp
        return new Date(ms).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        })
    }

    const getTypeLabel = (type: string) => {
        switch (type) {
            case 'INITIAL_IMPORT': return 'Initial Import'
            case 'SYNC': return 'Sync'
            case 'MERGE_IMPORT': return 'Merge Import'
            default: return type
        }
    }

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'INITIAL_IMPORT': return 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400'
            case 'SYNC': return 'bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-white/60'
            case 'MERGE_IMPORT': return 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400'
            default: return 'bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-white/60'
        }
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'SUCCESS': return 'text-green-600 dark:text-green-400'
            case 'FAILED': return 'text-red-600 dark:text-red-400'
            case 'PARTIAL': return 'text-amber-600 dark:text-amber-400'
            default: return 'text-slate-600 dark:text-white/60'
        }
    }

    const getBrowserIcon = (browser: string) => {
        const lower = browser.toLowerCase()
        if (lower.includes('chrome')) return '🌐'
        if (lower.includes('firefox')) return '🦊'
        if (lower.includes('edge')) return '📘'
        if (lower.includes('brave')) return '🦁'
        if (lower.includes('safari')) return '🧭'
        if (lower.includes('opera')) return '🎭'
        return '🔍'
    }

    if (isLoading || !user) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
            </div>
        )
    }

    return (
        <DashboardLayout>
            <div className="max-w-6xl mx-auto">
                {/* Back Link */}
                <Link
                    href="/settings/browsers"
                    className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-cream-500 hover:text-primary-600 dark:hover:text-terra-400 transition-colors mb-6"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back to Browsers
                </Link>

                {/* Header */}
                <div className="mb-10">
                    <div className="flex items-center gap-4">
                        {browserInfo && (
                            <div className="w-14 h-14 bg-slate-50 dark:bg-white/5 rounded-2xl flex items-center justify-center text-3xl">
                                {getBrowserIcon(browserInfo.browser)}
                            </div>
                        )}
                        <div>
                            <h1 className="text-3xl font-bold text-slate-900 dark:text-cream-100">
                                {browserInfo?.nickname || browserInfo?.browser || 'Browser'} History
                            </h1>
                            {browserInfo?.nickname && (
                                <p className="text-slate-500 dark:text-white/50 mt-1">
                                    {browserInfo.browser} v{browserInfo.browserVersion} • {browserInfo.os || 'Unknown OS'}
                                </p>
                            )}
                        </div>
                    </div>
                    <p className="text-slate-600 dark:text-cream-500 mt-2 text-lg">
                        Sync activity and import history for this browser
                    </p>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-2xl p-5 mb-8 flex items-center gap-3 text-red-700 dark:text-red-400">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="font-medium">{error}</span>
                    </div>
                )}

                {/* History List */}
                <div className="bg-white dark:bg-[#242424] rounded-3xl border border-slate-200 dark:border-white/[0.06] overflow-hidden shadow-sm">
                    <div className="px-8 py-6 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/5">
                        <h2 className="font-bold text-slate-900 dark:text-cream-100">Sync History</h2>
                    </div>

                    {loading ? (
                        <div className="p-16 text-center">
                            <div className="w-10 h-10 border-3 border-primary-100 border-t-primary-600 rounded-full animate-spin mx-auto"></div>
                            <p className="text-slate-500 dark:text-white/50 mt-6 font-medium">Loading history...</p>
                        </div>
                    ) : history.length === 0 ? (
                        <div className="p-20 text-center">
                            <div className="w-20 h-20 bg-slate-50 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
                                <svg className="w-10 h-10 text-slate-300 dark:text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-cream-100 mb-2">No history yet</h3>
                            <p className="text-slate-500 dark:text-white/50 max-w-xs mx-auto text-lg">
                                This browser hasn't performed any sync operations yet.
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100 dark:divide-white/5">
                            {history.map((item) => (
                                <div
                                    key={item.id}
                                    className="px-8 py-5 hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <span className={`px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider ${getTypeColor(item.type)}`}>
                                                {getTypeLabel(item.type)}
                                            </span>
                                            <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-white/50">
                                                <span className="flex items-center gap-1.5">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                                                    </svg>
                                                    {item.bookmarksProcessed} bookmarks
                                                </span>
                                                <span className="flex items-center gap-1.5">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                                    </svg>
                                                    {item.foldersProcessed} folders
                                                </span>
                                                <span className="flex items-center gap-1.5">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h10" />
                                                    </svg>
                                                    {item.collectionName}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-6">
                                            <span className={`font-bold text-sm ${getStatusColor(item.status)}`}>
                                                {item.status}
                                            </span>
                                            <span className="text-xs text-slate-400 dark:text-white/40">
                                                {formatDate(item.timestamp || item.createdAt)}
                                            </span>
                                        </div>
                                    </div>
                                    {item.changesCount > 0 && (
                                        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-400 dark:text-white/40">
                                            {item.sessionId ? (
                                                <Link
                                                    href={`/settings/browsers/${browserInstanceId}/history/${item.id}`}
                                                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-white/10 px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-white/60 hover:bg-slate-100 dark:hover:bg-white/10 transition-all"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                    </svg>
                                                    {item.details?.changesProcessed ?? item.changesCount} changes processed
                                                </Link>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-white/10 px-2.5 py-1.5 text-xs font-semibold text-slate-400 dark:text-white/40">
                                                    {item.details?.changesProcessed ?? item.changesCount} changes processed
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Summary Stats */}
                {history.length > 0 && (
                    <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="bg-white dark:bg-[#242424] rounded-2xl border border-slate-200 dark:border-white/[0.06] p-6">
                            <div className="text-2xl font-bold text-slate-900 dark:text-cream-100">
                                {history.length}
                            </div>
                            <div className="text-sm text-slate-500 dark:text-white/50 mt-1">Total Syncs</div>
                        </div>
                        <div className="bg-white dark:bg-[#242424] rounded-2xl border border-slate-200 dark:border-white/[0.06] p-6">
                            <div className="text-2xl font-bold text-slate-900 dark:text-cream-100">
                                {history.reduce((sum, h) => sum + h.bookmarksProcessed, 0).toLocaleString()}
                            </div>
                            <div className="text-sm text-slate-500 dark:text-white/50 mt-1">Bookmarks Processed</div>
                        </div>
                        <div className="bg-white dark:bg-[#242424] rounded-2xl border border-slate-200 dark:border-white/[0.06] p-6">
                            <div className="text-2xl font-bold text-slate-900 dark:text-cream-100">
                                {history.reduce((sum, h) => sum + h.foldersProcessed, 0).toLocaleString()}
                            </div>
                            <div className="text-sm text-slate-500 dark:text-white/50 mt-1">Folders Processed</div>
                        </div>
                    </div>
                )}
            </div>
        </DashboardLayout>
    )
}
