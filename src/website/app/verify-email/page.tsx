'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import EmailVerificationPanel from '@/components/EmailVerificationPanel'

export default function VerifyEmailPage() {
  const { user, isLoading, refreshUser } = useAuth()
  const [token, setToken] = useState('')
  const [deliveryFailed, setDeliveryFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [verified, setVerified] = useState(false)
  const [error, setError] = useState('')
  const fragmentRead = useRef(false)
  useEffect(() => {
    if (fragmentRead.current) return
    fragmentRead.current = true
    const value = new URLSearchParams(window.location.hash.slice(1)).get('token') || ''
    // Read the fragment once after hydration; it must never enter server logs or page requests.
    setToken(value)
    setDeliveryFailed(new URLSearchParams(window.location.search).get('delivery') === 'failed')
    if (value) window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }, [])
  const confirm = async () => {
    setBusy(true); setError('')
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/v1/auth/verify-email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error?.message || 'Email verification failed.')
      setVerified(true); setToken(''); await refreshUser()
    } catch (e) { setError(e instanceof Error ? e.message : 'Email verification failed.') }
    finally { setBusy(false) }
  }
  return <main className="min-h-screen bg-cream-100 dark:bg-[#1A1A1A] text-ink dark:text-cream-100 flex items-center justify-center p-6">
    <div className="max-w-xl w-full space-y-6">
      <Link href="/" className="text-2xl font-semibold hover:underline">BookMarx</Link>
      {verified || (!token && user?.emailVerified) ? <section className="space-y-4">
        <h1 className="text-3xl font-semibold">Email verified</h1>
        <p role="status">You can now use your bookmark collection. Reopen the extension or check your account status there.</p>
        <Link href={user ? '/dashboard' : '/login'} className="underline">{user ? 'Open dashboard' : 'Sign in to BookMarx'}</Link>
      </section> : token ? <section className="rounded-2xl border bg-white dark:bg-[#242424] p-6 space-y-4">
        <h1 className="text-3xl font-semibold">Confirm your email address</h1>
        <p>Click below to verify your BookMarx email. Bookmark features will unlock after confirmation.</p>
        <button type="button" onClick={confirm} disabled={busy} className="rounded-lg bg-terra-600 text-white px-5 py-3 disabled:opacity-50">{busy ? 'Verifying…' : 'Verify email address'}</button>
        {error && <p role="alert" className="text-red-600 dark:text-red-300">{error} <Link href="/verify-email" className="underline">Request a new email</Link></p>}
      </section> : isLoading ? <p role="status">Loading account…</p> : user ? <EmailVerificationPanel deliveryFailed={deliveryFailed} /> : <section className="space-y-4">
        <h1 className="text-3xl font-semibold">Verify your email</h1>
        <p>Open the link in your confirmation email, or sign in to request another email.</p>
        <Link href="/login" className="underline">Sign in</Link>
      </section>}
    </div>
  </main>
}
