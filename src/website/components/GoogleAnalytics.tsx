'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useCookieConsent } from '@/lib/cookie-consent'
import { useConfig } from '@/lib/config-context'

type AnalyticsWindow = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void; [key: `ga-disable-${string}`]: boolean }
const publicPages = new Set(['/', '/privacy', '/terms', '/cookies'])

export default function GoogleAnalytics() {
  const { consent, ready } = useCookieConsent()
  const { config } = useConfig()
  const pathname = usePathname()
  const id = config.analytics?.measurementId
  const lastPageView = useRef('')
  useEffect(() => {
    if (!id || !/^G-[A-Z0-9]+$/.test(id)) return
    const target = window as unknown as AnalyticsWindow
    const enabled = ready && consent?.analytics === true && publicPages.has(pathname)
    target[`ga-disable-${id}`] = !enabled
    if (!enabled) { lastPageView.current = ''; return }
    target.dataLayer ||= []
    target.gtag ||= function () { target.dataLayer!.push(arguments) }
    const track = () => {
      if (target[`ga-disable-${id}`]) return
      if (lastPageView.current === `${id}:${pathname}`) return
      lastPageView.current = `${id}:${pathname}`
      target.gtag!('event', 'page_view', { page_location: `${location.origin}${pathname}`, page_title: 'BookMarx',
        page_referrer: document.referrer ? new URL(document.referrer).origin : '' })
    }
    let script = document.getElementById('bookmarx-google-analytics') as HTMLScriptElement | null
    if (!script) {
      target.gtag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' })
      target.gtag('consent', 'update', { analytics_storage: 'granted' })
      target.gtag('js', new Date())
      target.gtag('config', id, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false,
        cookie_expires: 180 * 24 * 60 * 60, cookie_update: false, page_location: `${location.origin}${pathname}`,
        page_title: 'BookMarx', page_referrer: document.referrer ? new URL(document.referrer).origin : '' })
      script = document.createElement('script'); script.id = 'bookmarx-google-analytics'; script.async = true
      script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`
      document.head.appendChild(script)
    }
    track()
    return () => { target[`ga-disable-${id}`] = true }
  }, [id, pathname, ready, consent?.analytics])
  return null
}
