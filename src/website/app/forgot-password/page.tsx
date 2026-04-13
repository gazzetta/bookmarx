'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to send reset email')
      }

      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-cream-100 dark:bg-[#1A1A1A] flex items-center justify-center px-4 py-12 relative">
      {/* Decorative shapes */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-terra-400 rounded-full opacity-[0.03] blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-sage-400 rounded-full opacity-[0.03] blur-3xl translate-y-1/2 -translate-x-1/4 pointer-events-none"></div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo & Header */}
        <div className="text-center mb-10">
          <Link href="/" className="inline-flex items-center gap-2.5 mb-10 group">
            <div className="w-10 h-10 rounded-xl bg-ink dark:bg-cream-100 flex items-center justify-center transition-transform group-hover:scale-105">
              <svg className="w-6 h-6 text-cream-100 dark:text-ink" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </div>
            <span className="text-xl font-semibold text-ink dark:text-cream-100 tracking-tight">BookMarx</span>
          </Link>
          <h1 className="font-display text-3xl font-bold text-ink dark:text-cream-100 tracking-tight">Reset your password</h1>
          <p className="text-ink-400 dark:text-white/40 mt-2.5 text-[15px]">
            {sent
              ? 'Check your email for a reset link'
              : "Enter your email and we'll send you a reset link"
            }
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white dark:bg-[#242424] p-8 rounded-2xl border border-cream-300 dark:border-white/10 shadow-soft">
          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 text-red-700 dark:text-red-400 rounded-xl text-sm flex items-start gap-3">
              <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {sent ? (
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-2xl bg-sage-50 dark:bg-sage-500/10 border border-sage-200 dark:border-sage-500/30 flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-sage-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-ink dark:text-cream-100 mb-2">Check your inbox</h2>
              <p className="text-ink-400 dark:text-white/40 text-[15px] mb-6">
                We&apos;ve sent a password reset link to <span className="font-medium text-ink-600 dark:text-white/70">{email}</span>. 
                The link will expire in 1 hour.
              </p>
              <p className="text-sm text-ink-400 dark:text-white/40">
                Didn&apos;t receive the email? Check your spam folder or{' '}
                <button
                  onClick={() => { setSent(false); setError('') }}
                  className="text-terra-500 hover:text-terra-600 font-medium"
                >
                  try again
                </button>
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="mb-6">
                <label htmlFor="email" className="block text-sm font-medium text-ink-600 dark:text-white/70 mb-2">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-cream-300 dark:border-white/10 rounded-xl bg-white dark:bg-[#242424] text-ink dark:text-cream-100 placeholder:text-ink-300 dark:placeholder:text-white/30 transition-all"
                  placeholder="you@example.com"
                  required
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-ink dark:bg-cream-100 hover:bg-ink-900 dark:hover:bg-white disabled:bg-ink-300 dark:disabled:bg-white/30 text-cream-100 dark:text-ink py-3.5 rounded-xl font-semibold transition-all hover:shadow-lifted disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                    Sending...
                  </span>
                ) : (
                  'Send Reset Link'
                )}
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-ink-500 dark:text-white/50 text-[15px]">
            Remember your password?{' '}
            <Link href="/login" className="text-terra-500 hover:text-terra-600 font-semibold">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
