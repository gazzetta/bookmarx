'use client'

import Link from 'next/link'
import BrowserIcon from '@/components/BrowserIcon'
import { useConfig } from '@/lib/config-context'
import { useAuth } from '@/lib/auth-context'



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
                <BrowserIcon browser="chrome" className="w-5 h-5" />
                <BrowserIcon browser="firefox" className="w-5 h-5" />
                <BrowserIcon browser="edge" className="w-5 h-5" />
                <BrowserIcon browser="brave" className="w-5 h-5" />
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
              <li><Link href="/contact" className="text-white/60 hover:text-white transition-colors text-[15px]">Help & requests</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div className="lg:col-span-2">
            <h4 className="text-xs font-bold uppercase tracking-[0.15em] text-white/50 mb-6">Legal</h4>
            <ul className="space-y-3.5">
              <li><Link href="/privacy" className="text-white/60 hover:text-white transition-colors text-[15px]">Privacy Policy</Link></li>
              <li><Link href="/terms" className="text-white/60 hover:text-white transition-colors text-[15px]">Terms of Service</Link></li>
              <li><Link href="/cookies" className="text-white/60 hover:text-white transition-colors text-[15px]">Cookies & local storage</Link></li>
            </ul>

          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/[0.06] pt-8 flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-sm text-white/30">
            &copy; {new Date().getFullYear()} {config.branding.appName}. All rights reserved.
          </p>
          <Link href="https://www.bookmarx.cc/" target="_blank" rel="noopener noreferrer" className="text-sm text-white/30 hover:text-white/60 transition-colors">
            Made by BookMarx
          </Link>
        </div>
      </div>
    </footer>
  )
}
