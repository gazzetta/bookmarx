'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import DashboardLayout from '@/components/DashboardLayout'

interface Browser {
    browserInstanceId: string
    browser: string
    browserVersion: string
    os: string | null
    osVersion: string | null
    nickname: string | null
    lastSeen: number
    createdAt: number
}

export default function BrowsersPage() {
    const router = useRouter()
    const { user, token, isLoading } = useAuth()
    const [browsers, setBrowsers] = useState<Browser[]>([])
    const [loadingBrowsers, setLoadingBrowsers] = useState(true)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [editingNicknameId, setEditingNicknameId] = useState<string | null>(null)
    const [nicknameInput, setNicknameInput] = useState<string>('')
    const [savingNickname, setSavingNickname] = useState(false)

    useEffect(() => {
        if (!isLoading && !user) {
            router.push('/login')
        }
    }, [isLoading, user, router])

    useEffect(() => {
        if (token) {
            fetchBrowsers()
        }
    }, [token])

    const fetchBrowsers = async () => {
        if (!token) return

        setLoadingBrowsers(true)
        setError(null)

        try {
            const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005'
            const response = await fetch(`${API_URL}/api/v1/user/browsers`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            })

            const data = await response.json()

            if (data.success) {
                setBrowsers(data.data || [])
            } else {
                setError(data.error?.message || 'Failed to fetch browsers')
            }
        } catch (err) {
            setError('Failed to connect to server')
            console.error('Failed to fetch browsers:', err)
        } finally {
            setLoadingBrowsers(false)
        }
    }

    const handleUpdateNickname = async (browserInstanceId: string) => {
        if (!token) return

        setSavingNickname(true)
        setError(null)

        try {
            const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005'
            const response = await fetch(`${API_URL}/api/v1/user/browsers/${browserInstanceId}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ nickname: nicknameInput || null }),
            })

            const data = await response.json()

            if (data.success) {
                setBrowsers(browsers.map(b => 
                    b.browserInstanceId === browserInstanceId 
                        ? { ...b, nickname: nicknameInput || null }
                        : b
                ))
                setEditingNicknameId(null)
                setNicknameInput('')
            } else {
                setError(data.error?.message || 'Failed to update nickname')
            }
        } catch (err) {
            setError('Failed to connect to server')
            console.error('Failed to update nickname:', err)
        } finally {
            setSavingNickname(false)
        }
    }

    const startEditingNickname = (browser: Browser) => {
        setEditingNicknameId(browser.browserInstanceId)
        setNicknameInput(browser.nickname || '')
    }

    const cancelEditingNickname = () => {
        setEditingNicknameId(null)
        setNicknameInput('')
    }

    const handleRemoveBrowser = async (browserInstanceId: string) => {
        if (!token) return

        if (!confirm('Are you sure you want to remove this browser? It will need to run an initial sync again to reconnect.')) {
            return
        }

        setDeletingId(browserInstanceId)
        setError(null)

        try {
            const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005'
            const response = await fetch(`${API_URL}/api/v1/user/browsers/${browserInstanceId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            })

            const data = await response.json()

            if (data.success) {
                setBrowsers(browsers.filter(b => b.browserInstanceId !== browserInstanceId))
            } else {
                setError(data.error?.message || 'Failed to remove browser')
            }
        } catch (err) {
            setError('Failed to connect to server')
            console.error('Failed to remove browser:', err)
        } finally {
            setDeletingId(null)
        }
    }

    const formatDate = (timestamp: number | null) => {
        if (!timestamp) return 'Never'
        // Handle both seconds and milliseconds timestamps
        const ms = timestamp < 1e12 ? timestamp * 1000 : timestamp
        return new Date(ms).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
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

    const getOSIcon = (os: string | null) => {
        if (!os) return '💻'
        const lower = os.toLowerCase()
        if (lower.includes('windows')) return '🪟'
        if (lower.includes('mac')) return '🍎'
        if (lower.includes('linux')) return '🐧'
        if (lower.includes('android')) return '🤖'
        if (lower.includes('ios')) return '📱'
        return '💻'
    }

    const isRecent = (timestamp: number | null) => {
        if (!timestamp) return false
        const ms = timestamp < 1e12 ? timestamp * 1000 : timestamp
        const hourAgo = Date.now() - 60 * 60 * 1000
        return ms > hourAgo
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
                {/* Header */}
                <div className="mb-10">
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-cream-100">Manage Browsers</h1>
                    <p className="text-slate-600 dark:text-cream-500 mt-2 text-lg">
                        View and manage browser instances connected to your account
                    </p>
                </div>

                {/* Usage Info */}
                <div className="bg-white dark:bg-[#242424] rounded-3xl border border-slate-200 dark:border-white/[0.06] p-8 mb-8 shadow-sm">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                        <div>
                            <h2 className="text-xl font-bold text-slate-900 dark:text-cream-100">Browser Slots</h2>
                            <p className="text-slate-500 dark:text-white/50 mt-2 font-medium">
                                {user.subscriptionTier === 'premium'
                                    ? 'You have unlimited browser connections'
                                    : `Free plan usage: ${browsers.length} of ${user.browserLimit} slots used`
                                }
                            </p>
                        </div>
                        <div className="flex items-center gap-6">
                            <div className="text-right">
                                <div className="text-4xl font-black text-slate-900 dark:text-cream-100 tracking-tight">
                                    {browsers.length} / {user.browserLimit >= 100 ? '∞' : user.browserLimit}
                                </div>
                                <div className="text-xs text-slate-400 dark:text-white/40 font-bold uppercase tracking-widest mt-1">Active Slots</div>
                            </div>
                        </div>
                    </div>

                    {user.subscriptionTier !== 'premium' && browsers.length >= user.browserLimit && (
                        <div className="mt-8 relative overflow-hidden bg-primary-50 dark:bg-terra-500/10 rounded-2xl p-6 border border-primary-100 dark:border-terra-500/20">
                            <div className="relative z-10 flex items-start gap-4">
                                <div className="w-10 h-10 bg-white dark:bg-[#242424] rounded-xl flex items-center justify-center shadow-sm">
                                    <svg className="w-6 h-6 text-primary-600 dark:text-terra-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="font-bold text-primary-900 dark:text-terra-300">Browser limit reached</h3>
                                    <p className="text-primary-700/80 dark:text-terra-300/80 mt-1 text-sm leading-relaxed">
                                        You've utilized all available browser slots. To add a new browser, please remove an existing connection or
                                        <Link href="/settings/subscription" className="text-primary-600 dark:text-terra-400 hover:text-primary-700 dark:hover:text-terra-300 font-bold underline decoration-2 underline-offset-4 ml-1">
                                            upgrade to Premium
                                        </Link> for unlimited connections.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Error Message */}
                {error && (
                    <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-2xl p-5 mb-8 flex items-center gap-3 text-red-700 dark:text-red-400 animate-in slide-in-from-top-4">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="font-medium">{error}</span>
                    </div>
                )}

                {/* Browser List */}
                <div className="bg-white dark:bg-[#242424] rounded-3xl border border-slate-200 dark:border-white/[0.06] overflow-hidden shadow-sm">
                    <div className="px-8 py-6 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/5">
                        <h2 className="font-bold text-slate-900 dark:text-cream-100">Connected Devices</h2>
                    </div>

                    {loadingBrowsers ? (
                        <div className="p-16 text-center">
                            <div className="w-10 h-10 border-3 border-primary-100 border-t-primary-600 rounded-full animate-spin mx-auto"></div>
                            <p className="text-slate-500 dark:text-white/50 mt-6 font-medium">Scanning connections...</p>
                        </div>
                    ) : browsers.length === 0 ? (
                        <div className="p-20 text-center">
                            <div className="w-20 h-20 bg-slate-50 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
                                <svg className="w-10 h-10 text-slate-300 dark:text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-cream-100 mb-2">No browsers connected</h3>
                            <p className="text-slate-500 dark:text-white/50 max-w-xs mx-auto text-lg">
                                Install the extension and run an initial sync to connect your first browser.
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100 dark:divide-white/5">
                            {browsers.map((browser) => (
                                <div
                                    key={browser.browserInstanceId}
                                    className="px-8 py-6 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-white/5 transition-all group"
                                >
                                    <div className="flex items-center gap-6">
                                        <div className="w-16 h-16 bg-slate-50 dark:bg-white/5 rounded-2xl flex items-center justify-center group-hover:bg-white dark:group-hover:bg-[#242424] group-hover:shadow-md transition-all text-4xl">
                                            {getBrowserIcon(browser.browser)}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-lg font-bold text-slate-900 dark:text-cream-100">
                                                    {browser.nickname || browser.browser}
                                                </span>
                                                {browser.nickname && (
                                                    <span className="bg-primary-100 dark:bg-terra-500/20 text-primary-600 dark:text-terra-400 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg">
                                                        {browser.browser}
                                                    </span>
                                                )}
                                                <span className="bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-white/50 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg">
                                                    v{browser.browserVersion}
                                                </span>
                                                {isRecent(browser.lastSeen) && (
                                                    <div className="flex items-center gap-1.5 ml-1">
                                                        <span className="relative flex h-2 w-2">
                                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                                        </span>
                                                        <span className="text-green-600 dark:text-green-400 text-xs font-bold uppercase tracking-tight">Online</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-white/50 mt-1.5 font-medium">
                                                <span className="flex items-center gap-1.5 bg-slate-100 dark:bg-white/10 px-2 py-0.5 rounded-md text-xs font-bold uppercase tracking-tighter">
                                                    {getOSIcon(browser.os)} {browser.os || 'Unknown OS'}
                                                </span>
                                                {browser.osVersion && (
                                                    <span className="text-slate-400 dark:text-white/40 italic font-normal">({browser.osVersion})</span>
                                                )}
                                            </div>
                                            <div className="text-xs text-slate-400 dark:text-white/40 mt-2 font-medium">
                                                Last Active: {formatDate(browser.lastSeen)}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        {editingNicknameId === browser.browserInstanceId ? (
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="text"
                                                    value={nicknameInput}
                                                    onChange={(e) => setNicknameInput(e.target.value)}
                                                    placeholder="Enter nickname..."
                                                    maxLength={50}
                                                    className="h-10 px-3 rounded-xl text-sm bg-white dark:bg-[#242424] border border-slate-200 dark:border-white/10 focus:border-primary-500 dark:focus:border-terra-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:focus:ring-terra-500/20 transition-all w-40"
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            handleUpdateNickname(browser.browserInstanceId)
                                                        } else if (e.key === 'Escape') {
                                                            cancelEditingNickname()
                                                        }
                                                    }}
                                                    autoFocus
                                                />
                                                <button
                                                    onClick={() => handleUpdateNickname(browser.browserInstanceId)}
                                                    disabled={savingNickname}
                                                    className="h-10 px-3 rounded-xl text-sm font-bold text-white bg-primary-600 dark:bg-terra-500 hover:bg-primary-700 dark:hover:bg-terra-600 transition-all disabled:opacity-50"
                                                >
                                                    {savingNickname ? (
                                                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                        </svg>
                                                    ) : (
                                                        'Save'
                                                    )}
                                                </button>
                                                <button
                                                    onClick={cancelEditingNickname}
                                                    disabled={savingNickname}
                                                    className="h-10 px-3 rounded-xl text-sm font-bold text-slate-600 dark:text-white/60 hover:bg-slate-100 dark:hover:bg-white/10 transition-all disabled:opacity-50"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <Link
                                                    href={`/settings/browsers/${browser.browserInstanceId}/history`}
                                                    className="h-10 px-4 rounded-xl text-sm font-bold text-primary-600 dark:text-terra-400 hover:bg-primary-50 dark:hover:bg-terra-500/10 border border-transparent hover:border-primary-200 dark:hover:border-terra-500/20 transition-all flex items-center"
                                                >
                                                    <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                    History
                                                </Link>
                                                <button
                                                    onClick={() => startEditingNickname(browser)}
                                                    className="h-10 px-4 rounded-xl text-sm font-bold text-slate-600 dark:text-white/60 hover:bg-slate-100 dark:hover:bg-white/10 border border-transparent hover:border-slate-200 dark:hover:border-white/10 transition-all"
                                                >
                                                    {browser.nickname ? 'Edit Name' : 'Add Name'}
                                                </button>
                                                <button
                                                    onClick={() => handleRemoveBrowser(browser.browserInstanceId)}
                                                    disabled={deletingId === browser.browserInstanceId}
                                                    className="h-10 px-4 rounded-xl text-sm font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 border border-transparent hover:border-red-100 dark:hover:border-red-500/20 transition-all disabled:opacity-50"
                                                >
                                                    {deletingId === browser.browserInstanceId ? (
                                                        <span className="flex items-center gap-2">
                                                            <svg className="animate-spin h-4 w-4 text-red-600" fill="none" viewBox="0 0 24 24">
                                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                            </svg>
                                                            Removing...
                                                        </span>
                                                    ) : (
                                                        'Disconnect'
                                                    )}
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Help Text */}
                <div className="mt-10 relative overflow-hidden bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/[0.06] rounded-3xl p-8">
                    <div className="relative z-10 flex gap-6">
                        <div className="w-12 h-12 rounded-2xl bg-white dark:bg-[#242424] flex items-center justify-center shrink-0 shadow-sm">
                            <svg className="w-6 h-6 text-slate-400 dark:text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-900 dark:text-cream-100 mb-4">How browser connections work</h3>
                            <ul className="text-slate-600 dark:text-cream-500 space-y-3 font-medium">
                                <li className="flex items-start gap-2.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-primary-600 dark:bg-terra-500 mt-2 shrink-0"></span>
                                    Each browser instance counts as one unique connection to your Master Collection.
                                </li>
                                <li className="flex items-start gap-2.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-primary-600 dark:bg-terra-500 mt-2 shrink-0"></span>
                                    Different profiles in the same browser (e.g., Work vs Personal) are treated as separate connections.
                                </li>
                                <li className="flex items-start gap-2.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-primary-600 dark:bg-terra-500 mt-2 shrink-0"></span>
                                    Disconnecting a browser stops syncing. Your bookmarks in the Master Collection are preserved.
                                </li>
                                <li className="flex items-start gap-2.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-primary-600 dark:bg-terra-500 mt-2 shrink-0"></span>
                                    To reconnect a removed browser, you'll need to run a fresh initial sync from the extension.
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    )
}
