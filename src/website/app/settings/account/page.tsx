'use client'

import { useEffect, useRef, useState } from 'react'
import Script from 'next/script'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import DashboardLayout from '@/components/DashboardLayout'

export default function AccountSettings() {
  const { user, token, isLoading } = useAuth()
  const router = useRouter()
  const password = useRef<HTMLInputElement>(null)
  const button = useRef<HTMLDivElement>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (!isLoading && !user) router.replace('/login') }, [isLoading, user, router])

  const initialize = () => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    if (!clientId || !window.google?.accounts || !button.current) return
    window.google.accounts.id.initialize({ client_id: clientId, auto_select: false, callback: async ({ credential }) => {
      setError(''); setMessage(''); setBusy(true)
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/v1/auth/google/link`, { method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken: credential, password: password.current?.value || '' }) })
        const result = await response.json()
        if (!response.ok || !result.success) throw new Error(result.error?.message || 'Google could not be linked')
        if (password.current) password.current.value = ''
        setMessage('Google is linked. You can now use it to sign in to this BookMarx account.')
      } catch (e) { setError(e instanceof Error ? e.message : 'Linking failed') }
      finally { setBusy(false) }
    } })
    button.current.replaceChildren()
    window.google.accounts.id.renderButton(button.current, { theme: 'outline', size: 'large', width: 280 })
  }
  if (isLoading || !user) return <p role="status">Loading account…</p>
  return <DashboardLayout>
    <div className="max-w-xl space-y-5">
      <h1 className="text-3xl font-bold">Account settings</h1>
      <p>Signed in as {user.email}.</p>
      <section className="rounded-2xl border p-6 space-y-4">
        <h2 className="text-xl font-semibold">Link Google sign-in</h2>
        <p>Confirm your BookMarx password, then choose the Google account you want to use for this account.</p>
        <label className="block" htmlFor="link-password">Current BookMarx password</label>
        <input id="link-password" ref={password} type="password" autoComplete="current-password" disabled={busy} className="w-full rounded-lg border p-3 bg-transparent" />
        {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? <>
          <div ref={button} aria-busy={busy} />
          <Script src="https://accounts.google.com/gsi/client" onReady={initialize} />
        </> : <p>Google sign-in is not configured for this website yet.</p>}
        {message && <p role="status">{message}</p>}
        {error && <p role="alert" className="text-red-600">{error}</p>}
      </section>
      <Link href="/settings/subscription" className="underline">Subscription settings</Link>
    </div>
  </DashboardLayout>
}
