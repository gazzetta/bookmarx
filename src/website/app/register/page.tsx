'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string
            callback: (response: { credential: string; select_by: string }) => void
            auto_select?: boolean
          }) => void
          renderButton: (element: HTMLElement, options: {
            theme?: 'outline' | 'filled_blue' | 'filled_black'
            size?: 'large' | 'medium' | 'small'
            width?: string | number
            type?: 'standard' | 'icon'
            shape?: 'rectangular' | 'pill' | 'circle' | 'square'
            text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
            logo_alignment?: 'left' | 'center'
          }) => void
          prompt: () => void
        }
      }
    }
  }
}

function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { register, loginWithGoogle } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  const plan = searchParams.get('plan')

  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    document.body.appendChild(script)

    script.onload = () => {
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
      if (clientId && window.google) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleGoogleCallback,
        })

        const buttonDiv = document.getElementById('google-signup-button')
        if (buttonDiv) {
          window.google.accounts.id.renderButton(buttonDiv, {
            theme: 'outline',
            size: 'large',
            width: '100%',
            text: 'signup_with',
            shape: 'rectangular',
            logo_alignment: 'center',
          })
        }
      }
    }

    return () => {
      document.body.removeChild(script)
    }
  }, [])

  const handleGoogleCallback = async (response: { credential: string }) => {
    setGoogleLoading(true)
    setError('')

    try {
      if (loginWithGoogle) {
        await loginWithGoogle(response.credential)
        if (plan === 'premium') {
          router.push('/settings/subscription')
        } else {
          router.push('/dashboard')
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign up failed')
    } finally {
      setGoogleLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setIsLoading(true)

    try {
      await register(email, password)
      if (plan === 'premium') {
        router.push('/settings/subscription')
      } else {
        router.push('/dashboard')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-cream-100 dark:bg-[#1A1A1A] flex items-center justify-center px-4 py-12 relative">
      {/* Subtle decorative shapes */}
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-sage-400 rounded-full opacity-[0.03] blur-3xl -translate-y-1/2 -translate-x-1/4 pointer-events-none"></div>
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-terra-400 rounded-full opacity-[0.03] blur-3xl translate-y-1/2 translate-x-1/4 pointer-events-none"></div>

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
          <h1 className="font-display text-3xl font-bold text-ink dark:text-cream-100 tracking-tight">Create your account</h1>
          <p className="text-ink-400 dark:text-white/40 mt-2.5 text-[15px]">
            {plan === 'premium' ? (
              <span className="inline-flex items-center gap-2">
                Start your <span className="text-terra-500 font-semibold">Premium</span> journey
              </span>
            ) : (
              'Get started for free — no credit card required'
            )}
          </p>
        </div>

        {/* Register Form Card */}
        <div className="bg-white dark:bg-[#242424] p-8 rounded-2xl border border-cream-300 dark:border-white/10 shadow-soft">
          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 text-red-700 dark:text-red-400 rounded-xl text-sm flex items-start gap-3">
              <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Google Sign-Up Button */}
          <div className="mb-6">
            <div
              id="google-signup-button"
              className="w-full flex justify-center"
              style={{ minHeight: '44px' }}
            >
              {googleLoading ? (
                <button disabled className="w-full social-btn opacity-70">
                  <div className="w-5 h-5 border-2 border-cream-400 dark:border-white/10 border-t-terra-500 rounded-full animate-spin"></div>
                  <span>Signing up with Google...</span>
                </button>
              ) : !process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? (
                <button type="button" disabled className="w-full social-btn opacity-50 cursor-not-allowed">
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  <span className="text-ink-400 dark:text-white/40">Google Sign-Up Not Configured</span>
                </button>
              ) : null}
            </div>
          </div>

          {/* Divider */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-cream-300 dark:border-white/10"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white dark:bg-[#242424] text-ink-400 dark:text-white/40">or sign up with email</span>
            </div>
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleSubmit}>
            <div className="mb-5">
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
              />
            </div>

            <div className="mb-5">
              <label htmlFor="password" className="block text-sm font-medium text-ink-600 dark:text-white/70 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-cream-300 dark:border-white/10 rounded-xl bg-white dark:bg-[#242424] text-ink dark:text-cream-100 placeholder:text-ink-300 dark:placeholder:text-white/30 transition-all pr-12"
                  placeholder="Create a password"
                  required
                />
                <button
                  type="button"
                  onMouseDown={() => setShowPassword(true)}
                  onMouseUp={() => setShowPassword(false)}
                  onMouseLeave={() => setShowPassword(false)}
                  onTouchStart={() => setShowPassword(true)}
                  onTouchEnd={() => setShowPassword(false)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-ink-300 dark:text-white/30 hover:text-ink-500 dark:hover:text-white/50 transition-colors select-none"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {showPassword ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    )}
                  </svg>
                </button>
              </div>
              <p className="mt-1.5 text-xs text-ink-400 dark:text-white/40">At least 8 characters</p>
            </div>

            <div className="mb-6">
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-ink-600 dark:text-white/70 mb-2">
                Confirm password
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-cream-300 dark:border-white/10 rounded-xl bg-white dark:bg-[#242424] text-ink dark:text-cream-100 placeholder:text-ink-300 dark:placeholder:text-white/30 transition-all pr-12"
                  placeholder="Confirm your password"
                  required
                />
                <button
                  type="button"
                  onMouseDown={() => setShowConfirmPassword(true)}
                  onMouseUp={() => setShowConfirmPassword(false)}
                  onMouseLeave={() => setShowConfirmPassword(false)}
                  onTouchStart={() => setShowConfirmPassword(true)}
                  onTouchEnd={() => setShowConfirmPassword(false)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-ink-300 dark:text-white/30 hover:text-ink-500 dark:hover:text-white/50 transition-colors select-none"
                  tabIndex={-1}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {showConfirmPassword ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    )}
                  </svg>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-ink dark:bg-cream-100 hover:bg-ink-900 dark:hover:bg-white disabled:bg-ink-300 dark:disabled:bg-white/30 text-cream-100 dark:text-ink py-3.5 rounded-xl font-semibold transition-all hover:shadow-lifted disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                  Creating account...
                </span>
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          {/* Terms */}
          <p className="mt-6 text-center text-sm text-ink-400 dark:text-white/40">
            By signing up, you agree to our{' '}
            <Link href="/terms" className="text-terra-500 hover:text-terra-600 font-medium">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="text-terra-500 hover:text-terra-600 font-medium">
              Privacy Policy
            </Link>
          </p>

          <p className="mt-4 text-center text-ink-500 dark:text-white/50 text-[15px]">
            Already have an account?{' '}
            <Link href="/login" className="text-terra-500 hover:text-terra-600 font-semibold">
              Sign in
            </Link>
          </p>
        </div>

        {/* Benefits badges */}
        <div className="mt-10 grid grid-cols-3 gap-4 text-center text-xs text-ink-400 dark:text-white/40">
          <div className="flex flex-col items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-white dark:bg-[#242424] border border-cream-300 dark:border-white/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-sage-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span>Free forever plan</span>
          </div>
          <div className="flex flex-col items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-white dark:bg-[#242424] border border-cream-300 dark:border-white/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-sage-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <span>Secure & private</span>
          </div>
          <div className="flex flex-col items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-white dark:bg-[#242424] border border-cream-300 dark:border-white/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-sage-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span>Set up in 2 min</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-cream-100 dark:bg-[#1A1A1A] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-2 border-cream-300 dark:border-white/10 border-t-terra-500 rounded-full animate-spin"></div>
          <p className="text-ink-400 dark:text-white/40 font-medium">Loading...</p>
        </div>
      </div>
    }>
      <RegisterForm />
    </Suspense>
  )
}
