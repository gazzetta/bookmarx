'use client'

import Link from 'next/link'
import Footer from '@/components/Footer'
import { useConfig } from '@/lib/config-context'

export default function TermsPage() {
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
          <h1 className="font-display text-4xl lg:text-5xl font-bold text-ink tracking-tight mb-4">Terms of Service</h1>
          <p className="text-ink-400 text-lg">Last updated: February 2026</p>
        </div>

        <div className="prose prose-ink max-w-none">
          <div className="space-y-10">
            <section>
              <h2 className="font-display text-2xl font-bold text-ink mb-4">1. Acceptance of Terms</h2>
              <p className="text-ink-500 leading-relaxed">
                By accessing or using {appName} (the &quot;Service&quot;), you agree to be bound by these 
                Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms, you may not use 
                the Service. The Service is provided by GAS Digital (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;).
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-bold text-ink mb-4">2. Description of Service</h2>
              <p className="text-ink-500 leading-relaxed">
                {appName} is a bookmark synchronisation service that allows you to sync bookmarks 
                across multiple browsers, devices, and accounts. The Service includes a website, 
                browser extensions, and mobile applications.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-bold text-ink mb-4">3. Accounts</h2>
              <p className="text-ink-500 leading-relaxed mb-4">
                To use the Service, you must create an account. You are responsible for:
              </p>
              <ul className="space-y-2 text-ink-500">
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-terra-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span>Maintaining the confidentiality of your account credentials</span>
                </li>
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-terra-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span>All activity that occurs under your account</span>
                </li>
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-terra-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span>Providing accurate and current account information</span>
                </li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-2xl font-bold text-ink mb-4">4. Free & Premium Plans</h2>
              <div className="bg-white rounded-2xl border border-cream-300 p-6 mb-4">
                <h3 className="text-lg font-semibold text-ink mb-3">Free Plan</h3>
                <p className="text-ink-500 leading-relaxed">
                  Includes limited bookmark storage, browser connections, and collections. 
                  Free plans are subject to usage limits as displayed on our pricing page.
                </p>
              </div>
              <div className="bg-white rounded-2xl border border-cream-300 p-6">
                <h3 className="text-lg font-semibold text-ink mb-3">Premium Plan</h3>
                <p className="text-ink-500 leading-relaxed">
                  Offers expanded limits and additional features. Premium subscriptions are billed 
                  according to the plan selected at signup. Prices are subject to change with 
                  30 days&apos; notice. Payments are processed through our payment partner, Polar.
                </p>
              </div>
            </section>

            <section>
              <h2 className="font-display text-2xl font-bold text-ink mb-4">5. Acceptable Use</h2>
              <p className="text-ink-500 leading-relaxed mb-4">You agree not to:</p>
              <ul className="space-y-2 text-ink-500">
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span>Use the Service for any unlawful purpose</span>
                </li>
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span>Attempt to gain unauthorised access to other accounts or systems</span>
                </li>
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span>Interfere with or disrupt the Service or its infrastructure</span>
                </li>
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span>Use automated tools to scrape or abuse the Service</span>
                </li>
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span>Create multiple accounts to circumvent usage limits</span>
                </li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-2xl font-bold text-ink mb-4">6. Intellectual Property</h2>
              <p className="text-ink-500 leading-relaxed">
                The Service, including its design, code, and branding, is owned by GAS Digital. 
                You retain ownership of your bookmark data. By using the Service, you grant us 
                a limited licence to store and process your data solely for the purpose of 
                providing the synchronisation service.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-bold text-ink mb-4">7. Limitation of Liability</h2>
              <p className="text-ink-500 leading-relaxed">
                The Service is provided &quot;as is&quot; without warranties of any kind. We are not 
                liable for any data loss, including loss of bookmarks, that may occur during 
                synchronisation. We recommend maintaining local backups of important bookmarks. 
                Our total liability shall not exceed the amount paid by you for the Service 
                in the 12 months preceding the claim.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-bold text-ink mb-4">8. Cancellation & Refunds</h2>
              <p className="text-ink-500 leading-relaxed">
                You may cancel your Premium subscription at any time. Upon cancellation, you will 
                retain access to Premium features until the end of your current billing period. 
                Refunds are handled on a case-by-case basis. Please contact us if you believe 
                you are entitled to a refund.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-bold text-ink mb-4">9. Termination</h2>
              <p className="text-ink-500 leading-relaxed">
                We reserve the right to suspend or terminate your account if you violate these 
                Terms or engage in activity that is harmful to the Service or other users. 
                Upon termination, your right to use the Service ceases immediately.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-bold text-ink mb-4">10. Changes to Terms</h2>
              <p className="text-ink-500 leading-relaxed">
                We may update these Terms from time to time. We will notify you of material 
                changes by posting the updated Terms on our website. Your continued use of the 
                Service after changes constitutes acceptance of the updated Terms.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-bold text-ink mb-4">11. Governing Law</h2>
              <p className="text-ink-500 leading-relaxed">
                These Terms are governed by and construed in accordance with the laws of England 
                and Wales, without regard to conflict of law provisions.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-bold text-ink mb-4">12. Contact</h2>
              <p className="text-ink-500 leading-relaxed">
                For questions about these Terms, please contact us at{' '}
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
