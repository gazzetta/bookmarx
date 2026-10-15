'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'

const RESEND_COOLDOWN_S = 120

const formatCooldown = (s: number) =>
  s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}s`

export default function EmailVerificationPanel({ deliveryFailed = false }: { deliveryFailed?: boolean }) {
  const { user, token, refreshUser } = useAuth()
  const [busy, setBusy] = useState<'resend' | 'check' | null>(null)
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<'success' | 'info'>('info')
  const [error, setError] = useState('')
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [cooldownLeft, setCooldownLeft] = useState(0)

  const startCooldown = (seconds: number) => {
    setCooldownUntil(Date.now() + seconds * 1000)
    setCooldownLeft(seconds)
  }

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return
    const timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000))
      setCooldownLeft(left)
      if (left <= 0) clearInterval(timer)
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldownUntil])

  if (!user || user.emailVerified) return null
  const resend = async () => {
    setBusy('resend'); setError(''); setMessage('')
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/v1/auth/resend-verification`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      const result = await response.json()
      if (result.error?.code === 'VERIFICATION_RATE_LIMIT') {
        const wait = result.error.retryAfter ?? RESEND_COOLDOWN_S
        startCooldown(wait)
        setError(result.error.message || `Please wait ${wait} seconds before requesting another email.`)
        return
      }
      if (!response.ok || !result.success) throw new Error(result.error?.message || 'Could not send the confirmation email.')
      setMessageTone('success')
      if (result.data.emailVerified) { await refreshUser(); setMessage('Your email is already verified.') }
      else {
        startCooldown(RESEND_COOLDOWN_S)
        setMessage(`Confirmation email sent to ${user.email}. Check your inbox and junk folder.`)
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not send the confirmation email.') }
    finally { setBusy(null) }
  }
  const check = async () => {
    setBusy('check'); setError(''); setMessage('')
    try {
      await refreshUser()
      setMessageTone('info')
      setMessage('Account status refreshed. If this panel remains, your email is not verified yet.')
    }
    catch { setError('Could not check your account. Please try again.') }
    finally { setBusy(null) }
  }
  return <section aria-labelledby="verify-email-heading" className="max-w-xl rounded-2xl border border-terra-200 bg-white dark:bg-[#242424] p-6 space-y-4">
    <h2 id="verify-email-heading" className="text-2xl font-semibold">Verify your email address</h2>
    <p>Your account is saved. Confirm <strong>{user.email}</strong> before using bookmarks, imports, exports or browser sync.</p>
    <p>Open the confirmation email and follow its link. Check your junk folder if it has not arrived.</p>
    {deliveryFailed && <p role="alert">The signup email could not be sent. Your account remains saved; request another confirmation email below.</p>}
    <div className="flex flex-wrap gap-3">
      <button type="button" onClick={resend} disabled={busy !== null || cooldownLeft > 0} className="rounded-lg bg-terra-600 text-white px-4 py-3 disabled:opacity-50">
        {cooldownLeft > 0 ? `Resend available in ${formatCooldown(cooldownLeft)}` : 'Resend confirmation email'}
      </button>
      <button type="button" onClick={check} disabled={busy !== null} className="rounded-lg border px-4 py-3 disabled:opacity-50">I have verified my email</button>
    </div>
    {message && <p role="status" className={messageTone === 'success' ? 'text-sage-600 dark:text-sage-300 font-medium' : undefined}>{message}</p>}
    {error && <p role="alert" className="text-red-600 dark:text-red-300">{error}</p>}
  </section>
}
