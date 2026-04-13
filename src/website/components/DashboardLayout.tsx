'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import Footer from './Footer'
import ThemeToggle from './ThemeToggle'

interface DashboardLayoutProps {
  children: React.ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const router = useRouter()
  const { user, logout, isPremium } = useAuth()

  const handleLogout = () => {
    logout()
    router.push('/')
  }

  return (
    <div className="min-h-screen bg-cream-100 dark:bg-[#1A1A1A]">
      {/* Top Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 nav-glass">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/dashboard" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-lg bg-ink dark:bg-cream-100 flex items-center justify-center transition-transform group-hover:scale-105">
                <svg className="w-4.5 h-4.5 text-cream-100 dark:text-ink" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              </div>
              <span className="text-lg font-semibold text-ink dark:text-cream-100 tracking-tight">BookMarx</span>
            </Link>

            {/* Navigation Links */}
            <nav className="hidden md:flex items-center gap-1">
              <Link
                href="/dashboard"
                className="px-4 py-2 rounded-xl text-ink-500 dark:text-cream-500 hover:text-ink dark:hover:text-cream-100 hover:bg-cream-200/60 dark:hover:bg-white/10 transition-all text-sm font-medium"
              >
                My Dashboard
              </Link>
              <Link
                href="/collections"
                className="px-4 py-2 rounded-xl text-ink-500 dark:text-cream-500 hover:text-ink dark:hover:text-cream-100 hover:bg-cream-200/60 dark:hover:bg-white/10 transition-all text-sm font-medium"
              >
                My Collections
              </Link>
              <Link
                href="/settings/subscription"
                className="px-4 py-2 rounded-xl text-ink-500 dark:text-cream-500 hover:text-ink dark:hover:text-cream-100 hover:bg-cream-200/60 dark:hover:bg-white/10 transition-all text-sm font-medium"
              >
                My Subscription
              </Link>
              <Link
                href="/settings/browsers"
                className="px-4 py-2 rounded-xl text-ink-500 dark:text-cream-500 hover:text-ink dark:hover:text-cream-100 hover:bg-cream-200/60 dark:hover:bg-white/10 transition-all text-sm font-medium"
              >
                Manage Browsers
              </Link>
            </nav>

            {/* User Menu */}
            <div className="flex items-center gap-3">
              <ThemeToggle />

              {isPremium ? (
                <span className="hidden sm:inline-flex items-center gap-1.5 bg-ink dark:bg-cream-100 text-cream-100 dark:text-ink text-[11px] font-bold px-3 py-1.5 rounded-full tracking-wider uppercase">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  Premium
                </span>
              ) : (
                <Link
                  href="/settings/subscription"
                  className="hidden sm:inline-flex items-center gap-1.5 text-terra-600 dark:text-terra-400 hover:text-terra-700 text-sm font-semibold px-4 py-2 rounded-xl bg-terra-50 dark:bg-terra-500/10 hover:bg-terra-100 dark:hover:bg-terra-500/20 transition-all border border-terra-100 dark:border-terra-500/20"
                >
                  Upgrade
                </Link>
              )}

              <div className="relative group">
                <button className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-cream-200/60 dark:hover:bg-white/10 transition-all">
                  <div className="w-8 h-8 bg-terra-100 dark:bg-terra-500/20 rounded-lg flex items-center justify-center text-terra-700 dark:text-terra-400 font-bold text-sm uppercase">
                    {user?.email?.[0] || '?'}
                  </div>
                  <svg className="hidden sm:block w-4 h-4 text-ink-300 dark:text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Dropdown */}
                <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-[#242424] rounded-2xl shadow-elevated border border-cream-300 dark:border-white/10 p-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 translate-y-2 group-hover:translate-y-0">
                  <div className="px-3 py-3 border-b border-cream-200 dark:border-white/[0.06] mb-1">
                    <p className="text-sm font-semibold text-ink dark:text-cream-100 truncate">{user?.email}</p>
                    <p className="text-xs text-ink-400 dark:text-white/40 mt-0.5">{isPremium ? 'Premium Plan' : 'Free Plan'}</p>
                  </div>
                  <Link
                    href="/dashboard"
                    className="flex items-center gap-3 px-3 py-2.5 text-sm text-ink-500 dark:text-cream-500 hover:text-ink dark:hover:text-cream-100 hover:bg-cream-100 dark:hover:bg-white/[0.06] rounded-xl transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                    My Dashboard
                  </Link>
                  <Link
                    href="/collections"
                    className="flex items-center gap-3 px-3 py-2.5 text-sm text-ink-500 dark:text-cream-500 hover:text-ink dark:hover:text-cream-100 hover:bg-cream-100 dark:hover:bg-white/[0.06] rounded-xl transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m10 0V5a2 2 0 00-2-2H9a2 2 0 00-2 2v2m10 0h-2m-4 0H7" />
                    </svg>
                    My Collections
                  </Link>
                  <Link
                    href="/settings/subscription"
                    className="flex items-center gap-3 px-3 py-2.5 text-sm text-ink-500 dark:text-cream-500 hover:text-ink dark:hover:text-cream-100 hover:bg-cream-100 dark:hover:bg-white/[0.06] rounded-xl transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    My Subscription
                  </Link>
                  <Link
                    href="/settings/browsers"
                    className="flex items-center gap-3 px-3 py-2.5 text-sm text-ink-500 dark:text-cream-500 hover:text-ink dark:hover:text-cream-100 hover:bg-cream-100 dark:hover:bg-white/[0.06] rounded-xl transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    Manage Browsers
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 w-full text-left px-3 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-colors mt-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Sign out
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 lg:px-12 pt-24 pb-12">
        {children}
      </main>

      <Footer />
    </div>
  )
}
