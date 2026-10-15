'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useCookieConsent } from '@/lib/cookie-consent'
import { useConfig } from '@/lib/config-context'

export default function CookieConsent() {
  const { consent, ready, settingsOpen, openSettings, closeSettings, save } = useCookieConsent()
  const { config } = useConfig()
  const [customise, setCustomise] = useState(false)
  const [analytics, setAnalytics] = useState(false)
  const [preferences, setPreferences] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const settingsButton = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(false)
  const available = Boolean(config.analytics?.measurementId)
  useEffect(() => {
    if (settingsOpen) heading.current?.focus()
    else if (wasOpen.current) settingsButton.current?.focus()
    wasOpen.current = settingsOpen
  }, [settingsOpen])
  if (!ready) return null
  const buttonClass = 'rounded-lg border border-ink/30 dark:border-white/40 px-4 py-2.5 font-semibold hover:bg-ink/10 dark:hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terra-500'
  const primaryClass = 'rounded-lg bg-terra-500 hover:bg-terra-600 text-white px-4 py-2.5 font-semibold transition-colors sm:ml-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terra-500'
  if (consent && !settingsOpen) return <button ref={settingsButton} type="button" onClick={() => {
    setCustomise(true); setAnalytics(consent.analytics); setPreferences(consent.preferences); openSettings()
  }} className="fixed bottom-3 left-3 z-50 rounded-lg bg-white dark:bg-[#242424] border border-cream-300 dark:border-white/30 px-3 py-2 text-sm shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-terra-500">Cookie settings</button>
  return <section aria-labelledby="cookie-heading" className="fixed bottom-0 inset-x-0 z-50 max-h-[80dvh] overflow-y-auto border-t border-cream-300 dark:border-white/20 bg-cream-100 dark:bg-[#242424] text-ink dark:text-cream-100 shadow-2xl p-5 sm:p-6">
    <div className="max-w-5xl mx-auto space-y-4">
      <h2 ref={heading} tabIndex={-1} id="cookie-heading" className="font-display text-xl font-bold">Your privacy choices</h2>
      <p className="text-sm leading-relaxed">We use necessary storage for sign-in and security. With your permission, we can remember your theme and{available ? ' use Google Analytics to understand visits to our public pages.' : ' enable optional analytics when it is configured.'} Rejecting optional storage does not prevent you using BookMarx. <Link href="/cookies" className="underline">Cookies and local storage</Link>.</p>
      {(customise || settingsOpen) && <div className="space-y-3 text-sm">
        <p>Necessary storage is always enabled for the service you request.</p>
        <label className="flex gap-3 items-start"><input type="checkbox" checked={preferences} onChange={event => setPreferences(event.target.checked)} className="mt-1" />Remember my light/dark theme between visits</label>
        <label className="flex gap-3 items-start"><input type="checkbox" checked={analytics} disabled={!available} onChange={event => setAnalytics(event.target.checked)} className="mt-1" />Google Analytics {available ? '(optional; no advertising)' : '(not currently configured)'}</label>
      </div>}
      <div className="flex flex-wrap gap-3">
        <button type="button" className={buttonClass} onClick={() => save({ analytics: false, preferences: false })}>Reject optional</button>
        {(customise || settingsOpen) ? <button type="button" className={buttonClass} onClick={() => save({ analytics: available && analytics, preferences })}>Save choices</button>
          : <button type="button" className={buttonClass} onClick={() => setCustomise(true)}>Choose settings</button>}
        {consent && <button type="button" className={buttonClass} onClick={closeSettings}>Close settings</button>}
        <button type="button" className={primaryClass} onClick={() => save({ analytics: available, preferences: true })}>Accept optional</button>
      </div>
    </div>
  </section>
}
