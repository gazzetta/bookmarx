'use client'

import Link from 'next/link'
import Footer from '@/components/Footer'
import { useConfig } from '@/lib/config-context'

export default function PrivacyPage() {
  const { config } = useConfig()
  const appName = config.branding.appName

  return (
    <div className="legal-page min-h-screen bg-cream-100 dark:bg-[#1A1A1A]">
      {/* Header */}
      <nav className="border-b border-cream-300 dark:border-white/10 bg-white/80 dark:bg-[#1A1A1A]/90 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-ink dark:bg-cream-100 flex items-center justify-center transition-transform group-hover:scale-105">
              <svg className="w-5 h-5 text-cream-100 dark:text-ink" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </div>
            <span className="text-lg font-semibold text-ink dark:text-cream-100 tracking-tight">{appName}</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-medium text-ink-500 dark:text-white/60 hover:text-ink dark:hover:text-cream-100 transition-colors">
              Sign In
            </Link>
            <Link href="/register" className="text-sm font-semibold bg-ink dark:bg-cream-100 text-cream-100 dark:text-ink px-5 py-2.5 rounded-xl hover:bg-ink-900 dark:hover:bg-white transition-colors">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 lg:px-12 py-16 lg:py-24">
        <div className="mb-12">
          <h1 className="font-display text-4xl lg:text-5xl font-bold text-ink tracking-tight mb-4">Privacy Policy</h1>
          <p className="text-ink-400 text-lg">Last updated: February 2026</p>
        </div>

        <div className="prose prose-ink max-w-none">
          <div className="space-y-10">
            <section>
              <h2 className="font-display text-2xl font-bold text-ink mb-4">1. Introduction</h2>
              <p className="text-ink-500 leading-relaxed">
                {appName} (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) is committed to protecting your privacy. 
                This Privacy Policy explains how we collect, use, disclose, and safeguard your information 
                when you use our bookmark synchronisation service, including our website, browser extensions, 
                and mobile applications (collectively, the &quot;Service&quot;).
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-bold text-ink mb-4">2. Information We Collect</h2>
              <h3 className="text-lg font-semibold text-ink mb-3">Account Information</h3>
              <p className="text-ink-500 leading-relaxed mb-4">
                When you create an account, we collect your email address and, if you use email/password 
                authentication, a securely hashed version of your password. If you sign in with Google, 
                we receive your email address and display name from Google.
              </p>
              <h3 className="text-lg font-semibold text-ink mb-3">Bookmark Data</h3>
              <p className="text-ink-500 leading-relaxed mb-4">
                To provide our synchronisation service, we store your bookmarks, including URLs, titles, 
                folder structure, and metadata such as creation dates. This data is essential for the 
                core functionality of {appName}.
              </p>
              <h3 className="text-lg font-semibold text-ink mb-3">Device Information</h3>
              <p className="text-ink-500 leading-relaxed">
                We collect basic device and browser information (browser type, version, operating system) 
                to manage your connected browsers and provide the sync service. We do not collect 
                browsing history, page content, or any data beyond your bookmarks.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-bold text-ink mb-4">3. How We Use Your Information</h2>
              <ul className="space-y-2 text-ink-500">
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-sage-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>To synchronise your bookmarks across browsers and devices</span>
                </li>
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-sage-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>To authenticate and secure your account</span>
                </li>
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-sage-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>To manage your subscription and process payments</span>
                </li>
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-sage-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>To send transactional emails (e.g. password resets, account notifications)</span>
                </li>
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-sage-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>To improve and maintain the Service</span>
                </li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-2xl font-bold text-ink mb-4">4. Data Storage & Security</h2>
              <p className="text-ink-500 leading-relaxed mb-4">
                Your data is stored securely on our servers. Passwords are hashed using industry-standard 
                bcrypt hashing. All data transmission between your devices and our servers is encrypted 
                using HTTPS/TLS.
              </p>
              <p className="text-ink-500 leading-relaxed">
                We do not sell, trade, or otherwise transfer your personal information to third parties. 
                Your bookmark data is yours and is only used to provide the synchronisation service.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-bold text-ink mb-4">5. Third-Party Services</h2>
              <p className="text-ink-500 leading-relaxed">
                We use the following third-party services:
              </p>
              <ul className="mt-3 space-y-2 text-ink-500">
                <li className="flex items-start gap-3">
                  <span className="font-medium text-ink-600">Google OAuth:</span>
                  <span>For optional sign-in with Google. Subject to Google&apos;s Privacy Policy.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="font-medium text-ink-600">Polar:</span>
                  <span>For payment processing on premium subscriptions. Subject to Polar&apos;s Privacy Policy.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="font-medium text-ink-600">Resend:</span>
                  <span>For transactional emails. Subject to Resend&apos;s Privacy Policy.</span>
                </li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-2xl font-bold text-ink mb-4">6. Data Retention</h2>
              <p className="text-ink-500 leading-relaxed">
                We retain your data for as long as your account is active. If you delete your account, 
                we will delete all associated data, including your bookmarks, within 30 days. 
                Sync history may be retained in anonymised form for analytics purposes.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-bold text-ink mb-4">7. Your Rights</h2>
              <p className="text-ink-500 leading-relaxed mb-4">You have the right to:</p>
              <ul className="space-y-2 text-ink-500">
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-sage-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Access the personal data we hold about you</span>
                </li>
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-sage-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Request correction of inaccurate data</span>
                </li>
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-sage-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Request deletion of your data</span>
                </li>
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-sage-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Export your bookmark data</span>
                </li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-2xl font-bold text-ink mb-4">8. Contact Us</h2>
              <p className="text-ink-500 leading-relaxed">
                If you have questions about this Privacy Policy, please contact us at{' '}
                <a href="mailto:bookmarx@gasdigital.co.uk" className="text-terra-500 hover:text-terra-600 font-medium">
                  bookmarx@gasdigital.co.uk
                </a>.
              </p>
            </section>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  )
}
