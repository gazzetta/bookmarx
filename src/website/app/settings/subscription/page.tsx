'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'
import DashboardLayout from '@/components/DashboardLayout'

export default function SubscriptionPage() {
  const router = useRouter()
  const { user, token, isLoading, isPremium, refreshUser } = useAuth()

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login')
    }
  }, [isLoading, user, router])

  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)

  const handleUpgrade = async (plan: 'monthly' | 'yearly' | 'lifetime') => {
    if (!token) return
    setCheckoutLoading(plan)
    try {
      const result = await api.createCheckout(token, plan)
      window.open(result.checkoutUrl, '_blank')
    } catch (err) {
      console.error('Failed to create checkout:', err)
      alert('Failed to start checkout. Please try again.')
    } finally {
      setCheckoutLoading(null)
    }
  }

  const handleManageSubscription = () => {
    // Redirect to Polar customer portal
    window.open('https://polar.sh/gasdigital-ltd/portal', '_blank')
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
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-10 text-center md:text-left">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-cream-100">Subscription</h1>
          <p className="text-slate-600 dark:text-cream-500 mt-2 text-lg">Manage your account tier and billing</p>
        </div>

        {/* Current Plan Card */}
        <div className={`relative overflow-hidden rounded-[2.5rem] border p-10 mb-12 shadow-xl ${isPremium
          ? 'bg-gradient-to-br from-primary-600 to-primary-700 border-primary-500 text-white shadow-primary-500/20'
          : 'bg-white dark:bg-[#242424] border-slate-200 dark:border-white/[0.06] shadow-slate-200/50 dark:shadow-none'
          }`}>
          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex items-center gap-6">
              <div className={`w-20 h-20 rounded-3xl flex items-center justify-center text-4xl shadow-inner ${isPremium ? 'bg-white/10' : 'bg-slate-50 dark:bg-white/5'
                }`}>
                {isPremium ? '💎' : '🌱'}
              </div>
              <div className="text-center md:text-left">
                <div className={`text-sm font-black uppercase tracking-[0.2em] mb-1 ${isPremium ? 'text-white/60' : 'text-slate-400 dark:text-white/40'}`}>
                  Current Status
                </div>
                <h2 className={`text-3xl font-black antialiased ${isPremium ? 'text-white' : 'text-slate-900 dark:text-cream-100'}`}>
                  {isPremium ? 'Premium' : 'Free'}
                </h2>
                {isPremium && (
                  <div className="mt-2 inline-flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full text-xs font-bold text-white/90">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                    {user.subscriptionExpiresAt
                      ? `Active until ${formatDate(user.subscriptionExpiresAt)}`
                      : 'Lifetime Access Activated'}
                  </div>
                )}
              </div>
            </div>
            {isPremium && (
              <button
                onClick={handleManageSubscription}
                className="bg-white dark:bg-cream-100 text-primary-600 dark:text-terra-400 hover:bg-slate-50 dark:hover:bg-white px-8 py-3.5 rounded-2xl font-bold transition-all shadow-lg active:scale-95"
              >
                Billing Portal
              </button>
            )}
          </div>

          {!isPremium && (
            <div className="mt-10 grid grid-cols-3 gap-6 pt-10 border-t border-slate-100 dark:border-white/5">
              <div className="text-center">
                <div className="text-2xl font-black text-slate-900 dark:text-cream-100">{user.bookmarkLimit.toLocaleString()}</div>
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-white/40 mt-1">Bookmarks</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-black text-slate-900 dark:text-cream-100">{user.browserLimit}</div>
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-white/40 mt-1">Browsers</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-black text-slate-900 dark:text-cream-100">{user.collectionLimit}</div>
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-white/40 mt-1">Collections</div>
              </div>
            </div>
          )}

          {/* Decorative blobs for premium card */}
          {isPremium && (
            <>
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-12 translate-x-12"></div>
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary-400/20 rounded-full blur-2xl translate-y-12 -translate-x-12"></div>
            </>
          )}
        </div>

        {/* Upgrade Options (for free users) */}
        {!isPremium && (
          <>
            <div className="mb-10">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-cream-100">Unlock Full Potential</h2>
              <p className="text-slate-600 dark:text-cream-500 mt-2">All plans include the same Premium features. Choose your billing cycle:</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 mb-16">
              {/* Monthly */}
              <div className="group bg-white dark:bg-[#242424] rounded-3xl border border-slate-200 dark:border-white/[0.06] p-8 hover:border-primary-200 hover:shadow-xl hover:shadow-primary-500/5 dark:hover:shadow-terra-500/5 transition-all">
                <h3 className="font-bold text-slate-600 dark:text-cream-500 uppercase tracking-widest text-xs">Premium · Monthly</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-black text-slate-900 dark:text-cream-100">$2.49</span>
                  <span className="text-slate-400 dark:text-white/40 font-bold">/mo</span>
                </div>
                <p className="text-sm text-green-600 mt-4 font-bold">7-day free trial included</p>
                <button
                  onClick={() => handleUpgrade('monthly')}
                  className="w-full mt-8 bg-slate-900 dark:bg-cream-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-ink py-4 rounded-2xl font-bold transition-all shadow-lg shadow-slate-900/10 dark:shadow-none active:scale-[0.98]"
                >
                  Join Monthly
                </button>
              </div>

              {/* Yearly */}
              <div className="group relative bg-white dark:bg-[#242424] rounded-[2rem] border-2 border-primary-500 dark:border-terra-500 p-8 shadow-2xl shadow-primary-500/10 dark:shadow-terra-500/15 scale-105 z-10">
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary-600 dark:bg-terra-500 text-white text-[10px] font-black uppercase tracking-[0.2em] px-5 py-1.5 rounded-full shadow-lg">
                  Most Popular
                </div>
                <h3 className="font-bold text-primary-600 dark:text-terra-400 uppercase tracking-widest text-xs">Premium · Yearly</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-5xl font-black text-slate-900 dark:text-cream-100">$24.99</span>
                  <span className="text-slate-400 dark:text-white/40 font-bold">/yr</span>
                </div>
                <p className="text-sm text-green-600 mt-4 font-bold flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Save $4.89 vs monthly
                </p>
                <button
                  onClick={() => handleUpgrade('yearly')}
                  className="w-full mt-8 bg-primary-600 dark:bg-terra-500 hover:bg-primary-700 dark:hover:bg-terra-600 text-white py-4 rounded-2xl font-bold transition-all shadow-xl shadow-primary-500/25 dark:shadow-terra-500/15 active:scale-[0.98]"
                >
                  Join Yearly
                </button>
              </div>

              {/* Lifetime */}
              <div className="group bg-white dark:bg-[#242424] rounded-3xl border border-slate-200 dark:border-white/[0.06] p-8 hover:border-primary-200 hover:shadow-xl hover:shadow-primary-500/5 dark:hover:shadow-terra-500/5 transition-all">
                <h3 className="font-bold text-slate-600 dark:text-cream-500 uppercase tracking-widest text-xs">Premium · Lifetime</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-black text-slate-900 dark:text-cream-100">$49.99</span>
                </div>
                <p className="text-sm text-slate-500 dark:text-white/50 mt-4 font-medium italic">Own BookMarx forever.</p>
                <button
                  onClick={() => handleUpgrade('lifetime')}
                  className="w-full mt-8 border-2 border-slate-200 dark:border-white/10 hover:border-primary-600 dark:hover:border-terra-400 hover:text-primary-600 dark:hover:text-terra-400 text-slate-900 dark:text-cream-100 py-4 rounded-2xl font-bold transition-all active:scale-[0.98]"
                >
                  Get Lifetime
                </button>
              </div>
            </div>
          </>
        )}

        {/* Feature Comparison Table */}
        <div className="mb-10 text-center">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-cream-100">Compare Experience</h2>
          <p className="text-slate-500 dark:text-white/50 mt-2">See why thousands trust BookMarx Premium</p>
        </div>

        <div className="bg-white dark:bg-[#242424] rounded-3xl border border-slate-200 dark:border-white/[0.06] overflow-hidden shadow-sm dark:shadow-none mb-16">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-white/[0.03]">
                <th className="px-8 py-5 text-xs font-black uppercase tracking-widest text-slate-400 dark:text-white/40">Features</th>
                <th className="px-8 py-5 text-center text-xs font-black uppercase tracking-widest text-slate-400 dark:text-white/40">Free Tier</th>
                <th className="px-8 py-5 text-center text-xs font-black uppercase tracking-widest text-primary-600 dark:text-terra-400">Premium Tier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {[
                { f: 'Bookmark Capacity', free: '250 Items', prem: '10,000+ Items' },
                { f: 'Syncable Browsers', free: '2 Instances', prem: 'Unlimited' },
                { f: 'Custom Collections', free: '1 Active', prem: 'Unlimited' },
                { f: 'Visual Collection Editor', free: '✗', prem: '✓' },
                { f: 'Session History & Undo', free: '✗', prem: '✓' },
                { f: 'Mobile App Access', free: '✗', prem: '✓' },
                { f: 'Auto-sync Frequency', free: 'Hourly', prem: 'Real-time' },
                { f: 'Personal Support', free: 'Best Effort', prem: 'Priority VIP' },
              ].map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/30 dark:hover:bg-white/5 transition-colors">
                  <td className="px-8 py-4 font-bold text-slate-700 dark:text-white/70">{row.f}</td>
                  <td className="px-8 py-4 text-center text-slate-500 dark:text-white/50 font-medium">{row.free}</td>
                  <td className="px-8 py-4 text-center text-primary-600 dark:text-terra-400 font-black">{row.prem}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* FAQ Section */}
        <div className="mt-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-cream-100">Common Questions</h2>
            <p className="text-slate-500 dark:text-white/50 mt-3 text-lg">Everything you need to know about the transition</p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="group bg-white dark:bg-[#242424] rounded-3xl border border-slate-200 dark:border-white/[0.06] p-8 hover:border-primary-100 dark:hover:border-terra-500/20 transition-all">
              <h3 className="text-lg font-bold text-slate-900 dark:text-cream-100 group-hover:text-primary-600 dark:group-hover:text-terra-400 transition-colors">What payment methods do you accept?</h3>
              <p className="text-slate-600 dark:text-cream-500 mt-4 leading-relaxed font-medium">
                We utilize <span className="font-bold text-slate-800 dark:text-cream-200">Polar</span> for secure processing, accepting all major global credit cards, Apple Pay, and Google Pay.
              </p>
            </div>
            <div className="group bg-white dark:bg-[#242424] rounded-3xl border border-slate-200 dark:border-white/[0.06] p-8 hover:border-primary-100 dark:hover:border-terra-500/20 transition-all">
              <h3 className="text-lg font-bold text-slate-900 dark:text-cream-100 group-hover:text-primary-600 dark:group-hover:text-terra-400 transition-colors">Can I cancel anytime?</h3>
              <p className="text-slate-600 dark:text-cream-500 mt-4 leading-relaxed font-medium">
                Absolutely. Cancel with one click in your billing portal. You will retain all premium benefits until the exact end of your current cycle.
              </p>
            </div>
            <div className="group bg-white dark:bg-[#242424] rounded-3xl border border-slate-200 dark:border-white/[0.06] p-8 hover:border-primary-100 dark:hover:border-terra-500/20 transition-all">
              <h3 className="text-lg font-bold text-slate-900 dark:text-cream-100 group-hover:text-primary-600 dark:group-hover:text-terra-400 transition-colors">What if I exceed limits after downgrading?</h3>
              <p className="text-slate-600 dark:text-cream-500 mt-4 leading-relaxed font-medium">
                Your data is <span className="text-primary-600 dark:text-terra-400 font-bold">never deleted</span>. You just won't be able to sync new bookmarks until you either free up space or reactivate Premium.
              </p>
            </div>
            <div className="group bg-white dark:bg-[#242424] rounded-3xl border border-slate-200 dark:border-white/[0.06] p-8 hover:border-primary-100 dark:hover:border-terra-500/20 transition-all">
              <h3 className="text-lg font-bold text-slate-900 dark:text-cream-100 group-hover:text-primary-600 dark:group-hover:text-terra-400 transition-colors">Is the Lifetime plan really lifetime?</h3>
              <p className="text-slate-600 dark:text-cream-500 mt-4 leading-relaxed font-medium">
                Yes! Pay once and enjoy every future update, new feature, and extension version without ever being charged again.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Refresh */}
        <div className="mt-16 pb-12 text-center">
          <button
            onClick={refreshUser}
            className="group inline-flex items-center gap-2 text-sm font-bold text-slate-400 dark:text-white/40 hover:text-primary-600 dark:hover:text-terra-400 transition-all"
          >
            <svg className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Recently upgraded? Refresh your account status
          </button>
        </div>
      </div>
    </DashboardLayout>
  )
}
