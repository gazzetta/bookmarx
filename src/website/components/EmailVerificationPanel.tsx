'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'

export default function EmailVerificationPanel({ deliveryFailed = false }: { deliveryFailed?: boolean }) {
  const { user, token, refreshUser } = useAuth()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  if (!user || user.emailVerified) return null
  const resend = async () => {
    setBusy(true); setError(''); setMessage('')
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/v1/auth/resend-verification`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error?.message || 'Could not send the confirmation email.')
      if (result.data.emailVerified) { await refreshUser(); setMessage('Your email is already verified.') }
      else setMessage(`Confirmation email sent to ${user.email}. Check your inbox and junk folder.`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not send the confirmation email.') }
    finally { setBusy(false) }
  }
  const check = async () => {
    setBusy(true); setError(''); setMessage('')
    try { await refreshUser(); setMessage('Account status refreshed. If this panel remains, your email is not verified yet.') }
    catch { setError('Could not check your account. Please try again.') }
    finally { setBusy(false) }
  }
  return <section aria-labelledby="verify-email-heading" className="max-w-xl rounded-2xl border border-terra-200 bg-white dark:bg-[#242424] p-6 space-y-4">
    <h2 id="verify-email-heading" className="text-2xl font-semibold">Verify your email address</h2>
    <p>Your account is saved. Confirm <strong>{user.email}</strong> before using bookmarks, imports, exports or browser sync.</p>
    <p>Open the confirmation email and follow its link. Check your junk folder if it has not arrived.</p>
    {deliveryFailed && <p role="alert">The signup email could not be sent. Your account remains saved; request another confirmation email below.</p>}
    <div className="flex flex-wrap gap-3">
      <button type="button" onClick={resend} disabled={busy} className="rounded-lg bg-terra-600 text-white px-4 py-3 disabled:opacity-50">Resend confirmation email</button>
      <button type="button" onClick={check} disabled={busy} className="rounded-lg border px-4 py-3 disabled:opacity-50">I have verified my email</button>
    </div>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert" className="text-red-600 dark:text-red-300">{error}</p>}
  </section>
}
