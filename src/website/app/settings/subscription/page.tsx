'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import DashboardLayout from '@/components/DashboardLayout'

export default function SubscriptionPage() {
  const router = useRouter()
  const { user, isLoading, isPremium, refreshUser } = useAuth()

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login')
    }
  }, [isLoading, user, router])

  const handleUpgrade = (plan: 'monthly' | 'yearly' | 'lifetime') => {
    // In production, this would redirect to Polar checkout
    // For now, show the Polar product links
    const polarUrls = {
      monthly: 'https://polar.sh/bookmarx/checkout/monthly',
      yearly: 'https://polar.sh/bookmarx/checkout/yearly',
      lifetime: 'https://polar.sh/bookmarx/checkout/lifetime'
    }
    window.open(polarUrls[plan], '_blank')
  }

  const handleManageSubscription = () => {
    // Redirect to Polar customer portal
    window.open('https://polar.sh/bookmarx/portal', '_blank')
  }

  const formatDate = (timestamp: number | null) => {
    if (!timestamp) return 'Never'
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
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
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Subscription</h1>
          <p className="text-gray-600 mt-1">Manage your BookMarx subscription</p>
        </div>

        {/* Current Plan */}
        <div className={`rounded-xl border p-6 mb-8 ${
          isPremium 
            ? 'bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200' 
            : 'bg-white border-gray-200'
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <span className="text-3xl">{isPremium ? '⭐' : '📦'}</span>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {isPremium ? 'Premium' : 'Free'} Plan
                  </h2>
                  {isPremium && user.subscriptionExpiresAt && (
                    <p className="text-sm text-gray-600">
                      Renews on {formatDate(user.subscriptionExpiresAt)}
                    </p>
                  )}
                  {isPremium && !user.subscriptionExpiresAt && (
                    <p className="text-sm text-amber-700 font-medium">
                      Lifetime access - Never expires! 🎉
                    </p>
                  )}
                </div>
              </div>
            </div>
            {isPremium && (
              <button
                onClick={handleManageSubscription}
                className="border border-gray-300 hover:bg-white text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Manage Subscription
              </button>
            )}
          </div>

          {/* Current Limits */}
          <div className="mt-6 grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">
                {user.bookmarkLimit >= 10000 ? '∞' : user.bookmarkLimit}
              </div>
              <div className="text-sm text-gray-500">Bookmark Limit</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">
                {user.browserLimit >= 100 ? '∞' : user.browserLimit}
              </div>
              <div className="text-sm text-gray-500">Browser Limit</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">
                {user.collectionLimit >= 100 ? '∞' : user.collectionLimit}
              </div>
              <div className="text-sm text-gray-500">Collection Limit</div>
            </div>
          </div>
        </div>

        {/* Upgrade Options (for free users) */}
        {!isPremium && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Upgrade to Premium</h2>
            <div className="grid md:grid-cols-3 gap-6 mb-8">
              {/* Monthly */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-900">Monthly</h3>
                <div className="mt-2">
                  <span className="text-3xl font-bold text-gray-900">$5</span>
                  <span className="text-gray-500">/month</span>
                </div>
                <p className="text-sm text-gray-500 mt-2">Cancel anytime</p>
                <button
                  onClick={() => handleUpgrade('monthly')}
                  className="w-full mt-4 bg-amber-500 hover:bg-amber-600 text-white py-2 rounded-lg font-medium transition-colors"
                >
                  Subscribe Monthly
                </button>
              </div>

              {/* Yearly */}
              <div className="bg-white rounded-xl border-2 border-amber-300 p-6 relative">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
                  BEST VALUE
                </div>
                <h3 className="font-semibold text-gray-900">Yearly</h3>
                <div className="mt-2">
                  <span className="text-3xl font-bold text-gray-900">$50</span>
                  <span className="text-gray-500">/year</span>
                </div>
                <p className="text-sm text-green-600 mt-2">Save $10 (17%)</p>
                <button
                  onClick={() => handleUpgrade('yearly')}
                  className="w-full mt-4 bg-amber-500 hover:bg-amber-600 text-white py-2 rounded-lg font-medium transition-colors"
                >
                  Subscribe Yearly
                </button>
              </div>

              {/* Lifetime */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-900">Lifetime</h3>
                <div className="mt-2">
                  <span className="text-3xl font-bold text-gray-900">$100</span>
                  <span className="text-gray-500"> once</span>
                </div>
                <p className="text-sm text-gray-500 mt-2">One-time payment</p>
                <button
                  onClick={() => handleUpgrade('lifetime')}
                  className="w-full mt-4 border border-amber-500 text-amber-600 hover:bg-amber-50 py-2 rounded-lg font-medium transition-colors"
                >
                  Buy Lifetime
                </button>
              </div>
            </div>
          </>
        )}

        {/* Feature Comparison */}
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Feature Comparison</h2>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Feature</th>
                <th className="text-center px-6 py-3 text-sm font-medium text-gray-500">Free</th>
                <th className="text-center px-6 py-3 text-sm font-medium text-amber-600">Premium</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="px-6 py-4 text-gray-900">Bookmark Limit</td>
                <td className="px-6 py-4 text-center text-gray-600">250</td>
                <td className="px-6 py-4 text-center text-amber-600 font-medium">10,000</td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-gray-900">Browser Sync</td>
                <td className="px-6 py-4 text-center text-gray-600">2 browsers</td>
                <td className="px-6 py-4 text-center text-amber-600 font-medium">Unlimited</td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-gray-900">Collections</td>
                <td className="px-6 py-4 text-center text-gray-600">1</td>
                <td className="px-6 py-4 text-center text-amber-600 font-medium">Unlimited</td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-gray-900">Collection Viewer</td>
                <td className="px-6 py-4 text-center text-green-600">✓</td>
                <td className="px-6 py-4 text-center text-green-600">✓</td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-gray-900">Drag & Drop Editor</td>
                <td className="px-6 py-4 text-center text-gray-400">✗</td>
                <td className="px-6 py-4 text-center text-green-600">✓</td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-gray-900">Session History</td>
                <td className="px-6 py-4 text-center text-gray-400">✗</td>
                <td className="px-6 py-4 text-center text-green-600">✓</td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-gray-900">Session Rollback</td>
                <td className="px-6 py-4 text-center text-gray-400">✗</td>
                <td className="px-6 py-4 text-center text-green-600">✓</td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-gray-900">Mobile App</td>
                <td className="px-6 py-4 text-center text-gray-400">✗</td>
                <td className="px-6 py-4 text-center text-green-600">✓</td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-gray-900">Priority Support</td>
                <td className="px-6 py-4 text-center text-gray-400">✗</td>
                <td className="px-6 py-4 text-center text-green-600">✓</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Refresh button */}
        <div className="mt-6 text-center">
          <button
            onClick={refreshUser}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Recently upgraded? Click here to refresh your account status.
          </button>
        </div>

        {/* FAQ */}
        <div className="mt-12">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Frequently Asked Questions</h2>
          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="font-medium text-gray-900">What payment methods do you accept?</h3>
              <p className="text-sm text-gray-600 mt-2">
                We accept all major credit cards, debit cards, and PayPal through our payment provider Polar.
              </p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="font-medium text-gray-900">Can I cancel my subscription?</h3>
              <p className="text-sm text-gray-600 mt-2">
                Yes, you can cancel anytime. You'll continue to have premium access until the end of your billing period.
              </p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="font-medium text-gray-900">What happens to my bookmarks if I downgrade?</h3>
              <p className="text-sm text-gray-600 mt-2">
                Your bookmarks are safe! If you exceed the free tier limits, you won't be able to add new bookmarks until you're under the limit or upgrade again.
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
