'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import LegalPage from '@/components/LegalPage'

export default function ContactPage() {
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [sentEmail, setSentEmail] = useState('')
  const [error, setError] = useState('')
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError('')
    const form = event.currentTarget
    const data = Object.fromEntries(new FormData(form))
    try {
      const response = await fetch('/api/v1/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error?.message || 'Could not send your message.')
      form.reset(); setSentEmail(String(data.email || '')); setSent(true)
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not send your message. Please try again later.') }
    finally { setBusy(false) }
  }
  const inputClass = 'w-full rounded-lg border border-cream-400 dark:border-white/30 bg-white dark:bg-[#242424] p-3'
  return <LegalPage title="Contact BookMarx">
    <section><h2>How can we help?</h2><p>Use this form for support, sales, privacy requests, cancellation, refunds or complaints. Include your account email where relevant. Do not send passwords, payment card details or sensitive bookmark contents.</p>
      {sent ? <div role="status" className="animate-fade-in-up rounded-2xl border border-sage-200 dark:border-sage-500/30 bg-sage-50 dark:bg-sage-500/10 p-6">
          <div className="flex items-start gap-4">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-sage-500 text-white" aria-hidden="true">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
            </span>
            <div>
              <h3 className="font-display text-xl font-semibold text-sage-800 dark:text-sage-200">Message sent</h3>
              <p className="mt-1 text-sage-700 dark:text-sage-300">Your message has been submitted to our support team.{sentEmail && <> We can reply to <strong className="font-semibold">{sentEmail}</strong>.</>}</p>
              <button type="button" onClick={() => { setSent(false); setSentEmail('') }} className="mt-4 rounded-lg bg-ink dark:bg-cream-100 text-white dark:text-ink px-5 py-2.5 text-sm font-semibold">Send another message</button>
            </div>
          </div>
        </div>
        : <form onSubmit={submit} className="space-y-5">
          <label className="block">Your email address<input className={inputClass} name="email" type="email" autoComplete="email" required maxLength={254} /></label>
          <div><label htmlFor="contact-topic" className="block">Topic</label><select id="contact-topic" className={inputClass} name="topic" defaultValue="Support">{['Support', 'Sales', 'Privacy request', 'Cancellation or refund', 'Complaint'].map(topic => <option key={topic}>{topic}</option>)}</select></div>
          <label className="block">Message<textarea className={inputClass} name="message" rows={7} required minLength={10} maxLength={5000} /></label>
          <div hidden aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
          <p className="text-sm">We use these details to respond to your request. See our <Link href="/privacy">Privacy Policy</Link>. This form does not subscribe you to marketing.</p>
          {error && <p role="alert" className="text-red-700 dark:text-red-300">{error}</p>}
          <button type="submit" disabled={busy} className="rounded-lg bg-ink dark:bg-cream-100 text-white dark:text-ink px-5 py-3 font-semibold disabled:opacity-50">{busy ? 'Sending…' : 'Send message'}</button>
        </form>}
    </section>
  </LegalPage>
}
