'use client'

import Link from 'next/link'
import { useConfig } from '@/lib/config-context'
import { useAuth } from '@/lib/auth-context'

const ChromeIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5">
    <circle cx="12" cy="12" r="10" fill="#4285F4" />
    <circle cx="12" cy="12" r="4" fill="white" />
    <path d="M12 6l5.2 9h-10.4L12 6z" fill="#34A853" />
    <path d="M21.9 10.5C22 11 22 11.5 22 12c0 3-1.4 5.8-3.6 7.7L13.2 10 18 10c.8 0 2.4 0 3.9.5z" fill="#FBBC05" />
    <path d="M12 22c-3 0-5.8-1.4-7.7-3.6L9.5 10 6 10c-.8 0-2.4 0-3.9.5C2 11 2 11.5 2 12c0 5.5 4.5 10 10 10z" fill="#EA4335" />
  </svg>
)

const FirefoxIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5">
    <circle cx="12" cy="12" r="10" fill="url(#footer-firefox-gradient)" />
    <defs>
      <linearGradient id="footer-firefox-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FF9500" />
        <stop offset="100%" stopColor="#FF3366" />
      </linearGradient>
    </defs>
    <path d="M12 5c-3.9 0-7 3.1-7 7s3.1 7 7 7 7-3.1 7-7-3.1-7-7-7zm0 12c-2.8 0-5-2.2-5-5s2.2-5 5-5 5 2.2 5 5-2.2 5-5 5z" fill="white" opacity="0.5" />
  </svg>
)

const EdgeIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5">
    <circle cx="12" cy="12" r="10" fill="url(#footer-edge-gradient)" />
    <defs>
      <linearGradient id="footer-edge-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#0078D4" />
        <stop offset="100%" stopColor="#00BCF2" />
      </linearGradient>
    </defs>
    <path d="M12 7c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5z" fill="white" opacity="0.5" />
  </svg>
)

const BraveIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5">
    <circle cx="12" cy="12" r="10" fill="#FB542B" />
    <path d="M12 6l3 2v8l-3 2-3-2V8l3-2z" fill="white" opacity="0.9" />
  </svg>
)

export default function Footer() {
  const { config } = useConfig()
  const { user } = useAuth()

  return (
    <footer className="bg-ink text-white relative overflow-hidden">
      {/* Subtle decorative gradient */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-terra-500/20 to-transparent"></div>
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-terra-500/[0.03] rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none"></div>

      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-20 lg:py-28 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-12 lg:gap-8 mb-16">
          {/* Brand Column */}
          <div className="lg:col-span-4">
            <Link href="/" className="flex items-center gap-3 mb-6 group">
              <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center group-hover:bg-white/15 transition-colors">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              </div>
              <span className="text-xl font-semibold text-white tracking-tight">
                {config.branding.appName}
              </span>
            </Link>
            <p className="text-white/40 max-w-sm leading-relaxed mb-8 text-[15px]">
              The unified bookmark sync solution for professionals who work across multiple browsers, devices, and accounts.
            </p>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2.5 bg-white/[0.06] p-2.5 rounded-xl border border-white/[0.06]">
                <ChromeIcon />
                <FirefoxIcon />
                <EdgeIcon />
                <BraveIcon />
              </div>
            </div>
          </div>

          {/* Product */}
          <div className="lg:col-span-2 lg:col-start-6">
            <h4 className="text-xs font-bold uppercase tracking-[0.15em] text-white/50 mb-6">Product</h4>
            <ul className="space-y-3.5">
              <li><Link href="/#features" className="text-white/60 hover:text-white transition-colors text-[15px]">Features</Link></li>
              <li><Link href="/#pricing" className="text-white/60 hover:text-white transition-colors text-[15px]">Pricing</Link></li>
              <li><Link href="/#how-it-works" className="text-white/60 hover:text-white transition-colors text-[15px]">How It Works</Link></li>
              <li><Link href="/#faq" className="text-white/60 hover:text-white transition-colors text-[15px]">FAQ</Link></li>
            </ul>
          </div>

          {/* Support */}
          <div className="lg:col-span-2">
            <h4 className="text-xs font-bold uppercase tracking-[0.15em] text-white/50 mb-6">Support</h4>
            <ul className="space-y-3.5">
              {user ? (
                <>
                  <li><Link href="/dashboard" className="text-white/60 hover:text-white transition-colors text-[15px]">Dashboard</Link></li>
                  <li><Link href="/settings/browsers" className="text-white/60 hover:text-white transition-colors text-[15px]">Manage Browsers</Link></li>
                  <li><Link href="/settings/subscription" className="text-white/60 hover:text-white transition-colors text-[15px]">Subscription</Link></li>
                </>
              ) : (
                <>
                  <li><Link href="/login" className="text-white/60 hover:text-white transition-colors text-[15px]">Sign In</Link></li>
                  <li><Link href="/register" className="text-white/60 hover:text-white transition-colors text-[15px]">Register</Link></li>
                </>
              )}
              <li><Link href="mailto:bookmarx@gasdigital.co.uk" className="text-white/60 hover:text-white transition-colors text-[15px]">Contact Us</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div className="lg:col-span-2">
            <h4 className="text-xs font-bold uppercase tracking-[0.15em] text-white/50 mb-6">Legal</h4>
            <ul className="space-y-3.5">
              <li><Link href="/privacy" className="text-white/60 hover:text-white transition-colors text-[15px]">Privacy Policy</Link></li>
              <li><Link href="/terms" className="text-white/60 hover:text-white transition-colors text-[15px]">Terms of Service</Link></li>
            </ul>

            <div className="mt-10 p-5 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
              <p className="text-[11px] text-white/30 font-medium tracking-wider uppercase mb-1.5">Trusted by over</p>
              <p className="font-display text-2xl font-bold text-white">50,000+</p>
              <p className="text-sm text-white/40">active users worldwide</p>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/[0.06] pt-8 flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-sm text-white/30">
            &copy; {new Date().getFullYear()} {config.branding.appName}. All rights reserved.
          </p>
          <Link href="https://gasdigital.co.uk" target="_blank" className="text-sm text-white/30 hover:text-white/60 transition-colors">
            Made by GAS Digital
          </Link>
        </div>
      </div>
    </footer>
  )
}
