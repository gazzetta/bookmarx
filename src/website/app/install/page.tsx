'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import DashboardLayout from '@/components/DashboardLayout'

const ChromeIcon = () => (
  <svg viewBox="0 0 24 24" className="w-10 h-10">
    <circle cx="12" cy="12" r="10" fill="#4285F4" />
    <circle cx="12" cy="12" r="4" fill="white" />
    <path d="M12 6l5.2 9h-10.4L12 6z" fill="#34A853" />
    <path d="M21.9 10.5C22 11 22 11.5 22 12c0 3-1.4 5.8-3.6 7.7L13.2 10 18 10c.8 0 2.4 0 3.9.5z" fill="#FBBC05" />
    <path d="M12 22c-3 0-5.8-1.4-7.7-3.6L9.5 10 6 10c-.8 0-2.4 0-3.9.5C2 11 2 11.5 2 12c0 5.5 4.5 10 10 10z" fill="#EA4335" />
  </svg>
)

const FirefoxIcon = () => (
  <svg viewBox="0 0 24 24" className="w-10 h-10">
    <circle cx="12" cy="12" r="10" fill="url(#ff-gradient)" />
    <defs>
      <linearGradient id="ff-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FF9500" />
        <stop offset="100%" stopColor="#FF3366" />
      </linearGradient>
    </defs>
    <path d="M12 5c-3.9 0-7 3.1-7 7s3.1 7 7 7 7-3.1 7-7-3.1-7-7-7zm0 12c-2.8 0-5-2.2-5-5s2.2-5 5-5 5 2.2 5 5-2.2 5-5 5z" fill="white" opacity="0.3" />
  </svg>
)

const EdgeIcon = () => (
  <svg viewBox="0 0 24 24" className="w-10 h-10">
    <circle cx="12" cy="12" r="10" fill="url(#edge-gradient)" />
    <defs>
      <linearGradient id="edge-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#0078D4" />
        <stop offset="100%" stopColor="#00BCF2" />
      </linearGradient>
    </defs>
    <path d="M12 7c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5z" fill="white" opacity="0.3" />
  </svg>
)

const BraveIcon = () => (
  <svg viewBox="0 0 24 24" className="w-10 h-10">
    <circle cx="12" cy="12" r="10" fill="#FB542B" />
    <path d="M12 6l3 2v8l-3 2-3-2V8l3-2z" fill="white" opacity="0.9" />
  </svg>
)

export default function InstallPage() {
  const router = useRouter()
  const { user, isLoading } = useAuth()

  const chromeUrl = process.env.NEXT_PUBLIC_EXTENSION_CHROME_URL || ''
  const firefoxUrl = process.env.NEXT_PUBLIC_EXTENSION_FIREFOX_URL || ''
  const edgeUrl = process.env.NEXT_PUBLIC_EXTENSION_EDGE_URL || ''

  const hasStoreLinks = Boolean(chromeUrl || firefoxUrl || edgeUrl)

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login')
    }
  }, [isLoading, user, router])

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
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-cream-100">Install the Extension</h1>
          <p className="text-slate-600 dark:text-cream-500 mt-2 text-lg">
            Add BookMarx to your browser to sync bookmarks across Chrome, Firefox, Edge, and Brave.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {chromeUrl && (
            <a
              href={chromeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group bg-white dark:bg-[#242424] rounded-3xl border border-slate-200 dark:border-white/[0.06] p-8 hover:border-primary-300 dark:hover:border-terra-500/20 hover:shadow-xl hover:shadow-primary-500/5 transition-all text-center"
            >
              <div className="flex justify-center mb-4">
                <ChromeIcon />
              </div>
              <h3 className="font-bold text-slate-900 dark:text-cream-100">Chrome</h3>
              <p className="text-sm text-slate-500 dark:text-white/50 mt-1 mb-4">Also works on Brave & Edge</p>
              <span className="inline-flex items-center gap-2 text-primary-600 dark:text-terra-400 font-semibold group-hover:underline">
                Install from Chrome Web Store
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </span>
            </a>
          )}

          {firefoxUrl && (
            <a
              href={firefoxUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group bg-white dark:bg-[#242424] rounded-3xl border border-slate-200 dark:border-white/[0.06] p-8 hover:border-primary-300 dark:hover:border-terra-500/20 hover:shadow-xl hover:shadow-primary-500/5 transition-all text-center"
            >
              <div className="flex justify-center mb-4">
                <FirefoxIcon />
              </div>
              <h3 className="font-bold text-slate-900 dark:text-cream-100">Firefox</h3>
              <p className="text-sm text-slate-500 dark:text-white/50 mt-1 mb-4">Mozilla Add-ons</p>
              <span className="inline-flex items-center gap-2 text-primary-600 dark:text-terra-400 font-semibold group-hover:underline">
                Install from Firefox Add-ons
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </span>
            </a>
          )}

          {edgeUrl && (
            <a
              href={edgeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group bg-white dark:bg-[#242424] rounded-3xl border border-slate-200 dark:border-white/[0.06] p-8 hover:border-primary-300 dark:hover:border-terra-500/20 hover:shadow-xl hover:shadow-primary-500/5 transition-all text-center"
            >
              <div className="flex justify-center mb-4">
                <EdgeIcon />
              </div>
              <h3 className="font-bold text-slate-900 dark:text-cream-100">Edge</h3>
              <p className="text-sm text-slate-500 dark:text-white/50 mt-1 mb-4">Microsoft Edge Add-ons</p>
              <span className="inline-flex items-center gap-2 text-primary-600 dark:text-terra-400 font-semibold group-hover:underline">
                Install from Edge Add-ons
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </span>
            </a>
          )}
        </div>

        {!hasStoreLinks && (
          <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/[0.06] rounded-3xl p-8 mb-8 text-center">
            <p className="text-slate-600 dark:text-cream-500">
              Store links will appear here once configured. Add <code className="bg-slate-200 dark:bg-white/10 px-1.5 py-0.5 rounded text-sm">NEXT_PUBLIC_EXTENSION_CHROME_URL</code> to your <code className="bg-slate-200 dark:bg-white/10 px-1.5 py-0.5 rounded text-sm">.env.local</code> with your Chrome Web Store listing URL.
            </p>
          </div>
        )}

        <div className="bg-white rounded-3xl border border-slate-200 p-8">
          <h3 className="text-lg font-bold text-slate-900 mb-4">After installing</h3>
          <ol className="list-decimal list-inside space-y-2 text-slate-600">
            <li>Click the BookMarx icon in your browser toolbar</li>
            <li>Sign in with the same account you use on this website</li>
            <li>Run an initial sync to import your bookmarks into your Master Collection</li>
            <li>Your bookmarks will stay in sync across all connected browsers</li>
          </ol>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 mt-6 text-primary-600 dark:text-terra-400 font-semibold hover:underline"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Dashboard
          </Link>
        </div>
      </div>
    </DashboardLayout>
  )
}
