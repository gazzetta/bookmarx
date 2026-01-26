'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api, UserStats } from '@/lib/api'
import DashboardLayout from '@/components/DashboardLayout'

export default function DashboardPage() {
  const router = useRouter()
  const { user, token, isLoading, isPremium } = useAuth()
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
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">Welcome back, {user.displayName || user.email}</p>
        </div>

        {/* Premium upsell for free users */}
        {!isPremium && (
          <div className="mb-8 bg-gradient-to-r from-amber-50 to-amber-100 border border-amber-200 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">Upgrade to Premium</h3>
                <p className="text-gray-600 mt-1">
                  Get unlimited bookmarks, web editor, session history, and mobile app access.
                </p>
              </div>
              <Link
                href="/settings/subscription"
                className="bg-amber-500 hover:bg-amber-600 text-white px-6 py-2 rounded-lg font-medium transition-colors whitespace-nowrap"
              >
                Upgrade Now
              </Link>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {/* Bookmarks */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-gray-600">Bookmarks</span>
              <span className="text-2xl">🔖</span>
            </div>
            {statsLoading ? (
              <div className="h-8 bg-gray-100 rounded animate-pulse"></div>
            ) : (
              <>
                <div className="text-3xl font-bold text-gray-900">
                  {stats?.bookmarkCount || 0}
                </div>
                <div className="mt-2 text-sm text-gray-500">
                  of {user.bookmarkLimit >= 10000 ? '∞' : user.bookmarkLimit} limit
                </div>
                <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all ${
                      usagePercent >= 90 ? 'bg-red-500' : usagePercent >= 70 ? 'bg-amber-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(usagePercent, 100)}%` }}
                  ></div>
                </div>
              </>
            )}
          </div>

          {/* Browsers */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-gray-600">Synced Browsers</span>
              <span className="text-2xl">🌐</span>
            </div>
            {statsLoading ? (
              <div className="h-8 bg-gray-100 rounded animate-pulse"></div>
            ) : (
              <>
                <div className="text-3xl font-bold text-gray-900">
                  {stats?.browserCount || 0}
                </div>
                <div className="mt-2 text-sm text-gray-500">
                  of {user.browserLimit >= 100 ? '∞' : user.browserLimit} limit
                </div>
              </>
            )}
          </div>

          {/* Collections */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-gray-600">Collections</span>
              <span className="text-2xl">📁</span>
            </div>
            {statsLoading ? (
              <div className="h-8 bg-gray-100 rounded animate-pulse"></div>
            ) : (
              <>
                <div className="text-3xl font-bold text-gray-900">
                  {stats?.collectionCount || 1}
                </div>
                <div className="mt-2 text-sm text-gray-500">
                  {isPremium ? 'Unlimited available' : 'Upgrade for more'}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            href="/collections"
            className="bg-white border border-gray-200 rounded-xl p-4 hover:border-amber-300 hover:shadow-sm transition-all"
          >
            <div className="text-2xl mb-2">📚</div>
            <h3 className="font-medium text-gray-900">View Collections</h3>
            <p className="text-sm text-gray-500 mt-1">Browse your bookmark collections</p>
          </Link>

          {isPremium ? (
            <Link
              href="/collections/default/edit"
              className="bg-white border border-gray-200 rounded-xl p-4 hover:border-amber-300 hover:shadow-sm transition-all"
            >
              <div className="text-2xl mb-2">✏️</div>
              <h3 className="font-medium text-gray-900">Edit Collection</h3>
              <p className="text-sm text-gray-500 mt-1">Organize with drag & drop</p>
            </Link>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 opacity-75">
              <div className="text-2xl mb-2">✏️</div>
              <h3 className="font-medium text-gray-900">Edit Collection</h3>
              <p className="text-sm text-gray-500 mt-1">
                <span className="text-amber-600">Premium feature</span>
              </p>
            </div>
          )}

          {isPremium ? (
            <Link
              href="/sessions"
              className="bg-white border border-gray-200 rounded-xl p-4 hover:border-amber-300 hover:shadow-sm transition-all"
            >
              <div className="text-2xl mb-2">📜</div>
              <h3 className="font-medium text-gray-900">Session History</h3>
              <p className="text-sm text-gray-500 mt-1">View and rollback syncs</p>
            </Link>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 opacity-75">
              <div className="text-2xl mb-2">📜</div>
              <h3 className="font-medium text-gray-900">Session History</h3>
              <p className="text-sm text-gray-500 mt-1">
                <span className="text-amber-600">Premium feature</span>
              </p>
            </div>
          )}

          <Link
            href="/settings/subscription"
            className="bg-white border border-gray-200 rounded-xl p-4 hover:border-amber-300 hover:shadow-sm transition-all"
          >
            <div className="text-2xl mb-2">⚙️</div>
            <h3 className="font-medium text-gray-900">Settings</h3>
            <p className="text-sm text-gray-500 mt-1">Manage your account</p>
          </Link>
        </div>
      </div>
    </DashboardLayout>
  )
}
