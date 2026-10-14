'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import LegalPage, { businessAddress } from '@/components/LegalPage'

export default function ContactPage() {
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError('')
    const form = event.currentTarget
    const data = Object.fromEntries(new FormData(form))
    try {
      const response = await fetch('/api/v1/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error?.message || 'Could not send your message.')
      form.reset(); setSent(true)
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not send your message. Please try again later.') }
    finally { setBusy(false) }
  }
  const inputClass = 'w-full rounded-lg border border-cream-400 dark:border-white/30 bg-white dark:bg-[#242424] p-3'
  return <LegalPage title="Contact BookMarx">
    <section><h2>How can we help?</h2><p>Use this form for support, sales, privacy requests, cancellation, refunds or complaints. Include your account email where relevant. Do not send passwords, payment card details or sensitive bookmark contents.</p>
      {sent ? <div role="status"><p>Your message has been delivered to our support inbox. We can reply to the email you supplied.</p><button type="button" className="underline" onClick={() => setSent(false)}>Send another message</button></div>
        : <form onSubmit={submit} className="space-y-5">
          <label className="block">Your email address<input className={inputClass} name="email" type="email" autoComplete="email" required maxLength={254} /></label>
          <label className="block">Topic<select className={inputClass} name="topic" defaultValue="Support">{['Support', 'Sales', 'Privacy request', 'Cancellation or refund', 'Complaint'].map(topic => <option key={topic}>{topic}</option>)}</select></label>
          <label className="block">Message<textarea className={inputClass} name="message" rows={7} required minLength={10} maxLength={5000} /></label>
          <div hidden aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
          <p className="text-sm">We use these details to respond to your request. See our <Link href="/privacy">Privacy Policy</Link>. This form does not subscribe you to marketing.</p>
          {error && <p role="alert" className="text-red-700 dark:text-red-300">{error}</p>}
          <button type="submit" disabled={busy} className="rounded-lg bg-ink dark:bg-cream-100 text-white dark:text-ink px-5 py-3 font-semibold disabled:opacity-50">{busy ? 'Sending…' : 'Send message'}</button>
        </form>}
    </section>
    <section><h2>Postal and service address</h2><p>{businessAddress}</p><p>If online delivery is unavailable, you can send your request to this address.</p><p>To stop a PayPal subscription renewing, you can also use <a href="https://www.paypal.com/myaccount/autopay/" target="_blank" rel="noopener noreferrer">PayPal’s automatic-payment controls</a>.</p></section>
  </LegalPage>
}
