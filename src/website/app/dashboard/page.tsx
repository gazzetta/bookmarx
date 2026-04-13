'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { useConfig } from '@/lib/config-context'
import { api, UserStats } from '@/lib/api'
import DashboardLayout from '@/components/DashboardLayout'

export default function DashboardPage() {
  const router = useRouter()
  const { user, token, isLoading, isPremium } = useAuth()
  const { config } = useConfig()
  const [stats, setStats] = useState<UserStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login')
    }
  }, [isLoading, user, router])

  useEffect(() => {
    if (token) {
      api.getUserStats(token)
        .then(setStats)
        .catch(console.error)
        .finally(() => setStatsLoading(false))
    }
  }, [token])

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
      </div>
    )
  }

  const usagePercent = stats ? Math.round((stats.bookmarkCount / user.bookmarkLimit) * 100) : 0

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-cream-100">Dashboard</h1>
          <p className="text-slate-600 dark:text-cream-500 mt-2">Welcome back, <span className="font-semibold text-primary-600 dark:text-terra-400">{user.displayName || user.email}</span></p>
        </div>

        {/* Premium upsell for free users */}
        {!isPremium && (
          <div className="mb-10 relative overflow-hidden bg-gradient-to-br from-primary-600 to-primary-700 dark:from-terra-600 dark:to-terra-700 rounded-3xl p-8 text-white shadow-xl shadow-primary-500/20 dark:shadow-terra-500/20">
            <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="text-center md:text-left">
                <h3 className="text-xl font-bold text-white mb-2">Upgrade to {config.branding.premiumTitle}</h3>
                <p className="text-white/80 max-w-xl">
                  Get unlimited bookmarks, web editor, session history, and mobile app access.
                  Unlock the full power of {config.branding.appName}.
                </p>
              </div>
              <Link
                href="/settings/subscription"
                className="bg-white text-primary-600 hover:bg-slate-50 px-8 py-3 rounded-xl font-bold transition-all shadow-lg whitespace-nowrap"
              >
                Upgrade Now
              </Link>
            </div>
            {/* Decorative blobs */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-12 translate-x-12"></div>
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary-400/20 rounded-full blur-2xl translate-y-12 -translate-x-12"></div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {/* Bookmarks */}
          <div className="bg-white dark:bg-[#242424] rounded-3xl border border-slate-200 dark:border-white/[0.06] p-8 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-6">
              <div className="w-12 h-12 bg-blue-50 dark:bg-blue-500/10 rounded-2xl flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              </div>
              <span className="text-xs font-bold text-slate-400 dark:text-white/40 uppercase tracking-widest">Bookmarks</span>
            </div>
            {statsLoading ? (
              <div className="space-y-3">
                <div className="h-10 bg-slate-100 dark:bg-white/10 rounded-xl animate-pulse"></div>
                <div className="h-4 bg-slate-50 dark:bg-white/5 rounded w-1/2 animate-pulse"></div>
              </div>
            ) : (
              <>
                <div className="text-4xl font-black text-slate-900 dark:text-cream-100 antialiased tracking-tight">
                  {stats?.bookmarkCount.toLocaleString() || 0}
                </div>
                <div className="mt-2 text-sm font-medium text-slate-500 dark:text-white/50">
                  of {user.bookmarkLimit >= config.limits.premium.bookmarks ? '∞' : user.bookmarkLimit.toLocaleString()} limit
                </div>
                <div className="mt-5 h-2 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${usagePercent >= 90 ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : usagePercent >= 70 ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 'bg-primary-600 shadow-[0_0_8px_rgba(37,99,235,0.5)]'
                      }`}
                    style={{ width: `${Math.min(usagePercent, 100)}%` }}
                  ></div>
                </div>
              </>
            )}
          </div>

          {/* Browsers */}
          <div className="bg-white dark:bg-[#242424] rounded-3xl border border-slate-200 dark:border-white/[0.06] p-8 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-6">
              <div className="w-12 h-12 bg-teal-50 dark:bg-teal-500/10 rounded-2xl flex items-center justify-center">
                <svg className="w-6 h-6 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <span className="text-xs font-bold text-slate-400 dark:text-white/40 uppercase tracking-widest">Browsers</span>
            </div>
            {statsLoading ? (
              <div className="space-y-3">
                <div className="h-10 bg-slate-100 dark:bg-white/10 rounded-xl animate-pulse"></div>
                <div className="h-4 bg-slate-50 dark:bg-white/5 rounded w-1/2 animate-pulse"></div>
              </div>
            ) : (
              <>
                <div className="text-4xl font-black text-slate-900 dark:text-cream-100 antialiased tracking-tight">
                  {stats?.browserCount || 0}
                </div>
                <div className="mt-2 text-sm font-medium text-slate-500 dark:text-white/50">
                  of {user.browserLimit >= config.limits.premium.browsers ? '∞' : user.browserLimit} limit
                </div>
                <p className="mt-4 text-xs text-slate-400 dark:text-white/30">Active browser extensions connected</p>
              </>
            )}
          </div>

          {/* Collections */}
          <div className="bg-white dark:bg-[#242424] rounded-3xl border border-slate-200 dark:border-white/[0.06] p-8 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-6">
              <div className="w-12 h-12 bg-purple-50 dark:bg-purple-500/10 rounded-2xl flex items-center justify-center">
                <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <span className="text-xs font-bold text-slate-400 dark:text-white/40 uppercase tracking-widest">Collections</span>
            </div>
            {statsLoading ? (
              <div className="space-y-3">
                <div className="h-10 bg-slate-100 dark:bg-white/10 rounded-xl animate-pulse"></div>
                <div className="h-4 bg-slate-50 dark:bg-white/5 rounded w-1/2 animate-pulse"></div>
              </div>
            ) : (
              <>
                <div className="text-4xl font-black text-slate-900 dark:text-cream-100 antialiased tracking-tight">
                  {stats?.collectionCount ?? 0}
                </div>
                <div className="mt-2 text-sm font-medium text-slate-500 dark:text-white/50">
                  of {user.collectionLimit >= 50 ? '∞' : user.collectionLimit} limit
                </div>
                <p className="mt-4 text-xs text-slate-400 dark:text-white/30">Custom bookmark organizations</p>
              </>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 dark:text-cream-100">Quick Actions</h2>
          <div className="h-px flex-1 mx-6 bg-slate-200 dark:bg-white/[0.06] hidden sm:block"></div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            href="/install"
            className="group bg-white dark:bg-[#242424] border-2 border-primary-200 dark:border-terra-500/20 rounded-2xl p-6 hover:border-primary-500 dark:hover:border-terra-500/40 hover:shadow-lg hover:shadow-primary-500/10 transition-all"
          >
            <div className="w-10 h-10 bg-primary-50 dark:bg-terra-500/10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-primary-100 dark:group-hover:bg-terra-500/20 transition-colors">
              <svg className="w-5 h-5 text-primary-600 dark:text-terra-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>
            <h3 className="font-bold text-slate-900 dark:text-cream-100">Get Extension</h3>
            <p className="text-sm text-slate-500 dark:text-white/50 mt-1">Install for Chrome, Firefox, Edge & Brave</p>
          </Link>

          <Link
            href="/collections"
            className="group bg-white dark:bg-[#242424] border border-slate-200 dark:border-white/[0.06] rounded-2xl p-6 hover:border-primary-300 dark:hover:border-terra-500/30 hover:shadow-lg hover:shadow-primary-500/5 dark:hover:shadow-none transition-all"
          >
            <div className="w-10 h-10 bg-slate-50 dark:bg-white/5 rounded-xl flex items-center justify-center mb-4 group-hover:bg-primary-50 dark:group-hover:bg-terra-500/10 transition-colors">
              <svg className="w-5 h-5 text-slate-500 dark:text-white/50 group-hover:text-primary-600 dark:group-hover:text-terra-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h3 className="font-bold text-slate-900 dark:text-cream-100">View Collections</h3>
            <p className="text-sm text-slate-500 dark:text-white/50 mt-1">Browse your bookmark library</p>
          </Link>

          {isPremium ? (
            <Link
              href="/collections/default/edit"
              className="group bg-white dark:bg-[#242424] border border-slate-200 dark:border-white/[0.06] rounded-2xl p-6 hover:border-primary-300 dark:hover:border-terra-500/30 hover:shadow-lg hover:shadow-primary-500/5 dark:hover:shadow-none transition-all"
            >
              <div className="w-10 h-10 bg-slate-50 dark:bg-white/5 rounded-xl flex items-center justify-center mb-4 group-hover:bg-primary-50 dark:group-hover:bg-terra-500/10 transition-colors">
                <svg className="w-5 h-5 text-slate-500 dark:text-white/50 group-hover:text-primary-600 dark:group-hover:text-terra-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                </svg>
              </div>
              <h3 className="font-bold text-slate-900 dark:text-cream-100">Edit Collection</h3>
              <p className="text-sm text-slate-500 dark:text-white/50 mt-1">Organize with drag & drop</p>
            </Link>
          ) : (
            <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/[0.06] rounded-2xl p-6 opacity-75 relative overflow-hidden">
              <div className="w-10 h-10 bg-slate-100 dark:bg-white/10 rounded-xl flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-slate-400 dark:text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="font-bold text-slate-900 dark:text-cream-100">Edit Collection</h3>
              <p className="text-sm text-primary-600 dark:text-terra-400 font-semibold mt-1">
                {config.branding.premiumTitle} feature
              </p>
              <div className="absolute top-2 right-2">
                <svg className="w-5 h-5 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </div>
            </div>
          )}

          <Link
            href="/settings"
            className="group bg-white dark:bg-[#242424] border border-slate-200 dark:border-white/[0.06] rounded-2xl p-6 hover:border-primary-300 dark:hover:border-terra-500/30 hover:shadow-lg hover:shadow-primary-500/5 dark:hover:shadow-none transition-all"
          >
            <div className="w-10 h-10 bg-slate-50 dark:bg-white/5 rounded-xl flex items-center justify-center mb-4 group-hover:bg-primary-50 dark:group-hover:bg-terra-500/10 transition-colors">
              <svg className="w-5 h-5 text-slate-500 dark:text-white/50 group-hover:text-primary-600 dark:group-hover:text-terra-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h3 className="font-bold text-slate-900 dark:text-cream-100">Settings</h3>
            <p className="text-sm text-slate-500 dark:text-white/50 mt-1">Manage your account</p>
          </Link>

          <Link
            href="/settings/browsers"
            className="group bg-white dark:bg-[#242424] border border-slate-200 dark:border-white/[0.06] rounded-2xl p-6 hover:border-primary-300 dark:hover:border-terra-500/30 hover:shadow-lg hover:shadow-primary-500/5 dark:hover:shadow-none transition-all"
          >
            <div className="w-10 h-10 bg-slate-50 dark:bg-white/5 rounded-xl flex items-center justify-center mb-4 group-hover:bg-primary-50 dark:group-hover:bg-terra-500/10 transition-colors">
              <svg className="w-5 h-5 text-slate-500 dark:text-white/50 group-hover:text-primary-600 dark:group-hover:text-terra-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="font-bold text-slate-900 dark:text-cream-100">Manage Browsers</h3>
            <p className="text-sm text-slate-500 dark:text-white/50 mt-1">View connected devices & sync history</p>
          </Link>

          {isPremium ? (
            <Link
              href="/collections/default"
              className="group bg-white dark:bg-[#242424] border border-slate-200 dark:border-white/[0.06] rounded-2xl p-6 hover:border-primary-300 dark:hover:border-terra-500/30 hover:shadow-lg hover:shadow-primary-500/5 dark:hover:shadow-none transition-all"
            >
              <div className="w-10 h-10 bg-slate-50 dark:bg-white/5 rounded-xl flex items-center justify-center mb-4 group-hover:bg-primary-50 dark:group-hover:bg-terra-500/10 transition-colors">
                <svg className="w-5 h-5 text-slate-500 dark:text-white/50 group-hover:text-primary-600 dark:group-hover:text-terra-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="font-bold text-slate-900 dark:text-cream-100">Restore Points</h3>
              <p className="text-sm text-slate-500 dark:text-white/50 mt-1">Roll back to a previous collection state</p>
            </Link>
          ) : (
            <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/[0.06] rounded-2xl p-6 opacity-75 relative overflow-hidden">
              <div className="w-10 h-10 bg-slate-100 dark:bg-white/10 rounded-xl flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-slate-400 dark:text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="font-bold text-slate-900 dark:text-cream-100">Restore Points</h3>
              <p className="text-sm text-primary-600 dark:text-terra-400 font-semibold mt-1">
                {config.branding.premiumTitle} feature
              </p>
              <div className="absolute top-2 right-2">
                <svg className="w-5 h-5 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </div>
            </div>
          )}

          {isPremium ? (
            <Link
              href="/settings/subscription"
              className="group bg-white dark:bg-[#242424] border border-slate-200 dark:border-white/[0.06] rounded-2xl p-6 hover:border-primary-300 dark:hover:border-terra-500/30 hover:shadow-lg hover:shadow-primary-500/5 dark:hover:shadow-none transition-all"
            >
              <div className="w-10 h-10 bg-slate-50 dark:bg-white/5 rounded-xl flex items-center justify-center mb-4 group-hover:bg-amber-50 dark:group-hover:bg-amber-500/10 transition-colors">
                <svg className="w-5 h-5 text-slate-500 dark:text-white/50 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
              </div>
              <h3 className="font-bold text-slate-900 dark:text-cream-100">Subscription</h3>
              <p className="text-sm text-slate-500 dark:text-white/50 mt-1">Manage your {config.branding.premiumTitle} plan</p>
            </Link>
          ) : (
            <Link
              href="/settings/subscription"
              className="group bg-gradient-to-br from-amber-500 to-orange-500 border-2 border-amber-400/50 rounded-2xl p-6 hover:from-amber-400 hover:to-orange-400 hover:shadow-lg hover:shadow-amber-500/25 transition-all"
            >
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-white/30 transition-colors">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
              </div>
              <h3 className="font-bold text-white">Upgrade to {config.branding.premiumTitle}</h3>
              <p className="text-sm text-white/80 mt-1">Unlock editor, rollback & more</p>
            </Link>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
