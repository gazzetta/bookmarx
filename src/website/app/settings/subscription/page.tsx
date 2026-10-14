'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { useConfig } from '@/lib/config-context'
import { api } from '@/lib/api'
import DashboardLayout from '@/components/DashboardLayout'
import AlertDialog from '@/components/AlertDialog'

export default function SubscriptionPage() {
  const { config } = useConfig()
  const router = useRouter()
  const { user, token, isLoading, isPremium, refreshUser } = useAuth()

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login')
    }
  }, [isLoading, user, router])

  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)
  const [paymentPending, setPaymentPending] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const returnHandled = useRef(false)
  const [alertDialog, setAlertDialog] = useState<{ isOpen: boolean; title: string; message: string; variant: 'success' | 'error' }>({ isOpen: false, title: '', message: '', variant: 'error' })

  const confirmReturn = async () => {
    if (!token) return
    const params = new URLSearchParams(window.location.search)
    const orderID = params.get('token')
    const subscriptionID = params.get('subscription_id')
    setPaymentPending(true)
    setPaymentError(null)
    try {
      if (params.get('plan') === 'lifetime' && orderID) await api.capturePayment(token, orderID)
      else if (subscriptionID) await api.confirmSubscription(token, subscriptionID)
      else throw new Error('Payment confirmation details are missing. Contact support before making another payment.')
      await refreshUser()
      router.replace('/settings/subscription')
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : 'Payment confirmation is pending. Please retry.')
    } finally { setPaymentPending(false) }
  }

  useEffect(() => {
    if (token && new URLSearchParams(window.location.search).get('success') === 'true' && !returnHandled.current) {
      returnHandled.current = true
      void confirmReturn()
    }
  }, [token])

  const handleUpgrade = async (plan: 'monthly' | 'yearly' | 'lifetime') => {
    if (!token) return
    setCheckoutLoading(plan)
    try {
      const result = await api.createCheckout(token, plan)
      window.location.assign(result.checkoutUrl)
    } catch (err) {
      console.error('Failed to create checkout:', err)
      setAlertDialog({
        isOpen: true,
        title: 'Checkout Failed',
        message: 'Failed to start checkout. Please try again.',
        variant: 'error'
      })
    } finally {
      setCheckoutLoading(null)
    }
  }

  const handleManageSubscription = () => {
    // PayPal doesn't offer a customer portal — users manage subscriptions from their PayPal account
    window.open('https://www.paypal.com/myaccount/autopay/', '_blank')
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
        {paymentPending && <p role="status" className="mb-6">Confirming your payment…</p>}
        {paymentError && <div role="alert" className="mb-6 rounded-xl border border-red-300 p-4">
          <p>{paymentError}</p>
          <button type="button" disabled={paymentPending} onClick={() => void confirmReturn()} className="mt-3 underline">Retry confirmation</button>
        </div>}
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

        {/* Upgrade Options (for free users) — matches homepage pricing panels */}
        {!isPremium && (
          <>
            <div className="mb-10">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-cream-100">Unlock Full Potential</h2>
              <p className="text-slate-600 dark:text-cream-500 mt-2">Start free and upgrade when you need more. No hidden fees.</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto mb-8">
              {/* Free Plan */}
              <div className="bg-white dark:bg-[#242424] rounded-3xl p-8 border border-cream-300 dark:border-white/[0.06] h-full flex flex-col">
                <div className="mb-8">
                  <h3 className="font-display text-lg font-semibold text-ink dark:text-cream-100 mb-2">Free</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="font-display text-4xl font-bold text-ink dark:text-cream-100">$0</span>
                    <span className="text-ink-400 dark:text-white/40">/forever</span>
                  </div>
                </div>

                <ul className="space-y-4 mb-8 flex-1">
                  {[
                    `Up to ${config.limits.free.bookmarks} bookmarks`,
                    `${config.limits.free.browsers} browser connections`,
                    'View-only Master Collection',
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-sage-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-ink-600 dark:text-white/80">{item}</span>
                    </li>
                  ))}
                  {['Web editor', 'Session history & rollback', 'Mobile app access'].map((item, i) => (
                    <li key={`no-${i}`} className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-ink-200 dark:text-white/15 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      <span className="text-ink-300 dark:text-white/25">{item}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  disabled
                  className="block w-full text-center border-2 border-cream-400 dark:border-white/15 text-ink dark:text-cream-100 px-6 py-3.5 rounded-xl font-semibold opacity-60 cursor-default"
                >
                  Current Plan
                </button>
              </div>

              {/* Premium Plan */}
              <div className="pricing-popular rounded-3xl p-8 text-white relative h-full flex flex-col lg:scale-[1.03]">
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-terra-500 text-white text-xs font-bold px-4 py-1.5 rounded-full tracking-wide">
                  MOST POPULAR
                </div>

                <div className="mb-8">
                  <h3 className="text-lg font-semibold text-white/80 mb-2 font-display">{config.branding.premiumTitle}</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="font-display text-4xl font-bold text-white">${config.pricing.monthly / 100}</span>
                    <span className="text-white/50">/month</span>
                  </div>
                  <p className="text-sm text-white/40 mt-1.5">or ${config.pricing.yearly / 100}/yr &middot; ${config.pricing.lifetime / 100} lifetime</p>
                  <p className="text-sm text-terra-300 mt-1.5 font-semibold">7-day free trial on monthly</p>
                </div>

                <ul className="space-y-4 mb-8 flex-1">
                  {[
                    `Up to ${config.limits.premium.bookmarks.toLocaleString()} bookmarks`,
                    `Up to ${config.limits.premium.browsers} browser profiles`,
                    'Multiple collections',
                    'Web drag & drop editor',
                    'Session history & rollback',
                    'Bookmark file import & export',
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-terra-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-white/90">{item}</span>
                    </li>
                  ))}
                </ul>

                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => handleUpgrade('monthly')}
                    disabled={checkoutLoading !== null}
                    className="block w-full text-center bg-terra-500 hover:bg-terra-600 disabled:opacity-60 text-white px-6 py-3.5 rounded-xl font-semibold transition-all hover:shadow-glow"
                  >
                    {checkoutLoading === 'monthly' ? 'Redirecting…' : `Join Monthly · $${config.pricing.monthly / 100}/mo`}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpgrade('yearly')}
                    disabled={checkoutLoading !== null}
                    className="block w-full text-center bg-white/10 hover:bg-white/15 disabled:opacity-60 text-white px-6 py-3.5 rounded-xl font-semibold border border-white/15 transition-all"
                  >
                    {checkoutLoading === 'yearly' ? 'Redirecting…' : `Join Yearly · $${config.pricing.yearly / 100}/yr`}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpgrade('lifetime')}
                    disabled={checkoutLoading !== null}
                    className="block w-full text-center bg-white/10 hover:bg-white/15 disabled:opacity-60 text-white px-6 py-3.5 rounded-xl font-semibold border border-white/15 transition-all"
                  >
                    {checkoutLoading === 'lifetime' ? 'Redirecting…' : `Get Lifetime · $${config.pricing.lifetime / 100}`}
                  </button>
                </div>
              </div>

              {/* Enterprise Plan */}
              <div className="bg-white dark:bg-[#242424] rounded-3xl p-8 border border-cream-300 dark:border-white/[0.06] h-full flex flex-col">
                <div className="mb-8">
                  <h3 className="font-display text-lg font-semibold text-ink dark:text-cream-100 mb-2">Enterprise</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="font-display text-4xl font-bold text-ink dark:text-cream-100">Custom</span>
                  </div>
                  <p className="text-sm text-ink-400 dark:text-white/40 mt-1.5">Contact us for pricing</p>
                </div>

                <ul className="space-y-4 mb-8 flex-1">
                  {[
                    `Everything in ${config.branding.premiumTitle}`,
                    `Up to ${config.limits.premium.bookmarks.toLocaleString()} bookmarks`,
                    'Team sharing & collaboration',
                    'SSO integration',
                    'Priority support',
                    'Custom onboarding',
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-sage-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-ink-600 dark:text-white/80">{item}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/contact"
                  className="block w-full text-center border-2 border-cream-400 dark:border-white/15 hover:border-ink dark:hover:border-white/40 hover:bg-ink dark:hover:bg-white/10 hover:text-cream-100 text-ink dark:text-cream-100 px-6 py-3.5 rounded-xl font-semibold transition-all"
                >
                  Contact Sales
                </Link>
              </div>
            </div>

            <p className="text-center text-sm text-slate-500 dark:text-white/40 mb-16">Secure payments powered by <span className="font-semibold text-slate-700 dark:text-white/70">PayPal</span></p>
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
                { f: 'Bookmark Capacity', free: `${config.limits.free.bookmarks.toLocaleString()} Items`, prem: `${config.limits.premium.bookmarks.toLocaleString()} Items` },
                { f: 'Syncable Browsers', free: `${config.limits.free.browsers} Profiles`, prem: `${config.limits.premium.browsers} Profiles` },
                { f: 'Custom Collections', free: `${config.limits.free.collections} Collection`, prem: `${config.limits.premium.collections} Collections` },
                { f: 'Visual Collection Editor', free: '✗', prem: '✓' },
                { f: 'Session History & Undo', free: '✗', prem: '✓' },
                { f: 'Bookmark File Import & Export', free: '✓', prem: '✓' },
                { f: 'Optional Automatic Sync', free: 'Every 5 minutes', prem: 'Every 5 minutes' },
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
                We utilize <span className="font-bold text-slate-800 dark:text-cream-200">PayPal</span> for secure processing, accepting all major global credit cards, PayPal balance, Apple Pay, and Google Pay.
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
                Your data is <span className="text-primary-600 dark:text-terra-400 font-bold">never deleted</span>. You just won&apos;t be able to sync new bookmarks until you either free up space or reactivate Premium.
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

        <AlertDialog
          isOpen={alertDialog.isOpen}
          title={alertDialog.title}
          message={alertDialog.message}
          variant={alertDialog.variant}
          onClose={() => setAlertDialog({ ...alertDialog, isOpen: false })}
        />
      </div>
    </DashboardLayout>
  )
}
