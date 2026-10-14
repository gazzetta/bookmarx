'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import BrowserIcon from '@/components/BrowserIcon'
import { useAuth } from '@/lib/auth-context'
import DashboardLayout from '@/components/DashboardLayout'



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
                <BrowserIcon browser="chrome" className="w-10 h-10" />
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
                <BrowserIcon browser="firefox" className="w-10 h-10" />
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
                <BrowserIcon browser="edge" className="w-10 h-10" />
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
