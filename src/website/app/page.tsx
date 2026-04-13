'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { useConfig } from '@/lib/config-context'
import Footer from '@/components/Footer'
import ThemeToggle from '@/components/ThemeToggle'

// ─── Browser Icons ───
const ChromeIcon = ({ className = "w-8 h-8" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <circle cx="12" cy="12" r="10" fill="#4285F4" />
    <circle cx="12" cy="12" r="4" fill="white" />
    <path d="M12 6l5.2 9h-10.4L12 6z" fill="#34A853" />
    <path d="M21.9 10.5C22 11 22 11.5 22 12c0 3-1.4 5.8-3.6 7.7L13.2 10 18 10c.8 0 2.4 0 3.9.5z" fill="#FBBC05" />
    <path d="M12 22c-3 0-5.8-1.4-7.7-3.6L9.5 10 6 10c-.8 0-2.4 0-3.9.5C2 11 2 11.5 2 12c0 5.5 4.5 10 10 10z" fill="#EA4335" />
  </svg>
)

const FirefoxIcon = ({ className = "w-8 h-8" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <circle cx="12" cy="12" r="10" fill="url(#firefox-gradient)" />
    <defs>
      <linearGradient id="firefox-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FF9500" />
        <stop offset="100%" stopColor="#FF3366" />
      </linearGradient>
    </defs>
    <path d="M12 5c-3.9 0-7 3.1-7 7s3.1 7 7 7 7-3.1 7-7-3.1-7-7-7zm0 12c-2.8 0-5-2.2-5-5s2.2-5 5-5 5 2.2 5 5-2.2 5-5 5z" fill="white" opacity="0.3" />
  </svg>
)

const EdgeIcon = ({ className = "w-8 h-8" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className}>
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

const BraveIcon = ({ className = "w-8 h-8" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <circle cx="12" cy="12" r="10" fill="#FB542B" />
    <path d="M12 6l3 2v8l-3 2-3-2V8l3-2z" fill="white" opacity="0.9" />
  </svg>
)

// ─── Simple wrapper for consistent className usage (no hidden-by-default) ───
function RevealSection({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <div className={className}>
      {children}
    </div>
  )
}

// ─── Features data ───
const features = [
  {
    number: '01',
    title: 'Cross-Browser Sync',
    description: 'Seamlessly sync bookmarks between Chrome, Firefox, Edge, and Brave. Your bookmarks follow you, no matter which browser you open.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    ),
  },
  {
    number: '02',
    title: 'Mobile Access',
    description: 'Your entire bookmark library, right in your pocket. Save links on the go from iOS and Android with our native mobile apps.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    number: '03',
    title: 'Master Collection',
    description: 'All your bookmarks unified in one place. A single source of truth that keeps every browser in perfect harmony.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
  },
  {
    number: '04',
    title: 'Drag & Drop Editor',
    description: 'Organize your bookmarks visually with our web-based editor. Rearrange, rename, and restructure — intuitively.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
      </svg>
    ),
  },
  {
    number: '05',
    title: 'Session History',
    description: 'Every sync is logged. Roll back changes, view import history, and restore previous bookmark states with a click.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    number: '06',
    title: 'Secure & Private',
    description: 'Your bookmarks are encrypted and stored securely. We never sell your data, track your browsing, or share your information.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
]

export default function HomePage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [scrolled, setScrolled] = useState(false)
  const { config } = useConfig()

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const faqs = [
    {
      question: 'How does cross-browser syncing work?',
      answer: `Install our browser extension on each browser you use. ${config.branding.appName} creates a unified "Master Collection" that merges all your bookmarks intelligently, deduplicating URLs and preserving folder structures. Changes in any browser are synced to all others in real-time.`
    },
    {
      question: 'What happens to my existing bookmarks?',
      answer: `When you first install ${config.branding.appName}, your existing bookmarks are safely imported into your Master Collection. We never delete or modify your original browser bookmarks without your explicit consent. You can always roll back to a previous state.`
    },
    {
      question: 'Is my data secure?',
      answer: 'Absolutely. All bookmarks are encrypted in transit and at rest. We use industry-standard JWT authentication and never share or sell your data. You can export or delete your data at any time.'
    },
    {
      question: 'Can I use BookMarx with multiple Google accounts?',
      answer: `Yes! Each browser instance is tracked separately, so you can have Chrome logged into your personal Google account and another Chrome profile logged into your work account. ${config.branding.appName} syncs them all to your single Master Collection.`
    },
    {
      question: 'What browsers are supported?',
      answer: `We currently support Chrome, Firefox, Microsoft Edge, Brave, and other Chromium-based browsers. Safari support and mobile apps for iOS and Android are coming soon for ${config.branding.premiumTitle} users.`
    },
    {
      question: `What's included in ${config.branding.premiumTitle}?`,
      answer: `${config.branding.premiumTitle} unlocks unlimited bookmarks (vs ${config.limits.free.bookmarks} free), unlimited browser connections (vs ${config.limits.free.browsers} free), the web-based drag & drop editor, session history with rollback, multiple collections, and priority support.`
    },
  ]

  return (
    <div className="min-h-screen bg-cream-100 dark:bg-[#1A1A1A]">
      {/* ═══ Navigation ═══ */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'nav-glass' : 'bg-transparent'}`}>
        <nav className="max-w-7xl mx-auto px-6 lg:px-12 py-5">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-9 h-9 rounded-xl bg-ink dark:bg-cream-100 flex items-center justify-center transition-transform group-hover:scale-105">
                <svg className="w-5 h-5 text-cream-100 dark:text-ink" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              </div>
              <span className="text-xl font-semibold text-ink dark:text-cream-100 tracking-tight">BookMarx</span>
            </Link>

            <div className="hidden md:flex items-center gap-10">
              <Link href="#features" className="text-ink-500 dark:text-cream-500 hover:text-ink dark:hover:text-cream-100 text-[15px] font-medium transition-colors">Features</Link>
              <Link href="#how-it-works" className="text-ink-500 dark:text-cream-500 hover:text-ink dark:hover:text-cream-100 text-[15px] font-medium transition-colors">How It Works</Link>
              <Link href="#pricing" className="text-ink-500 dark:text-cream-500 hover:text-ink dark:hover:text-cream-100 text-[15px] font-medium transition-colors">Pricing</Link>
              <Link href="#faq" className="text-ink-500 dark:text-cream-500 hover:text-ink dark:hover:text-cream-100 text-[15px] font-medium transition-colors">FAQ</Link>
            </div>

            <div className="flex items-center gap-3">
              <ThemeToggle />
              <Link href="/login" className="hidden sm:block text-ink-600 dark:text-cream-500 hover:text-ink dark:hover:text-cream-100 text-[15px] font-medium transition-colors">
                Sign In
              </Link>
              <Link
                href="/register"
                className="bg-ink dark:bg-cream-100 hover:bg-ink-900 dark:hover:bg-white text-cream-100 dark:text-ink px-6 py-2.5 rounded-xl text-[15px] font-semibold transition-all hover:shadow-elevated"
              >
                Get Started
              </Link>
            </div>
          </div>
        </nav>
      </header>

      {/* ═══ Hero Section ═══ */}
      <section className="hero-section pt-36 pb-24 lg:pt-44 lg:pb-36 relative">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="grid lg:grid-cols-2 gap-16 lg:gap-20 items-center">
            {/* Text */}
            <div className="relative z-10 max-w-xl">
              <div className="animate-fade-in-down" style={{ animationDelay: '0ms', animationFillMode: 'both' }}>
                <div className="inline-flex items-center gap-2.5 bg-white/70 dark:bg-white/[0.06] backdrop-blur rounded-full px-4 py-2 mb-8 border border-cream-400/50 dark:border-white/10">
                  <span className="flex h-2 w-2 rounded-full bg-sage-500 animate-pulse"></span>
                  <span className="text-sm font-medium text-ink-500 dark:text-cream-500">Now supporting 4 browsers + mobile</span>
                </div>
              </div>

              <div className="animate-fade-in-up" style={{ animationDelay: '100ms', animationFillMode: 'both' }}>
                <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold text-ink dark:text-cream-100 tracking-tighter mb-7 leading-[1.05]">
                  Your bookmarks,{' '}
                  <span className="italic text-terra-500">everywhere</span>
                </h1>
              </div>

              <div className="animate-fade-in-up" style={{ animationDelay: '200ms', animationFillMode: 'both' }}>
                <p className="text-lg lg:text-xl text-ink-500 dark:text-white/50 mb-10 leading-relaxed max-w-lg">
                  Sync bookmarks across all your browsers, devices, and accounts.
                  One unified library — whether you're on Chrome at work, Firefox at home, or Edge on your laptop.
                </p>
              </div>

              <div className="animate-fade-in-up" style={{ animationDelay: '350ms', animationFillMode: 'both' }}>
                <div className="flex flex-col sm:flex-row gap-4 mb-12">
                  <Link href="/register" className="btn-primary inline-flex items-center justify-center gap-2 text-base">
                    Start Free
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </Link>
                  <Link href="#features" className="btn-secondary inline-flex items-center justify-center gap-2 text-base">
                    See How It Works
                  </Link>
                </div>
              </div>

              <div className="animate-fade-in-up" style={{ animationDelay: '500ms', animationFillMode: 'both' }}>
                <div className="flex items-center gap-5">
                  <span className="text-sm text-ink-400 dark:text-white/40 font-medium">Works with</span>
                  <div className="browser-icons">
                    <div className="browser-icon"><ChromeIcon /></div>
                    <div className="browser-icon"><FirefoxIcon /></div>
                    <div className="browser-icon"><EdgeIcon /></div>
                    <div className="browser-icon"><BraveIcon /></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Mockup */}
            <div className="relative animate-fade-in" style={{ animationDelay: '300ms', animationFillMode: 'both' }}>
              <div className="float-animation">
                <div className="dashboard-mockup p-1 relative">
                  {/* Browser chrome */}
                  <div className="bg-[#242424] rounded-t-[19px] px-4 py-3.5 flex items-center gap-3">
                    <div className="flex gap-2">
                      <div className="w-3 h-3 rounded-full bg-[#FF5F57]"></div>
                      <div className="w-3 h-3 rounded-full bg-[#FEBC2E]"></div>
                      <div className="w-3 h-3 rounded-full bg-[#28C840]"></div>
                    </div>
                    <div className="flex-1 mx-3">
                      <div className="bg-[#1A1A1A] rounded-lg px-4 py-2 flex items-center gap-2">
                        <svg className="w-3.5 h-3.5 text-[#666]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        <span className="text-xs text-[#888]">bookmarx.gasdigital.co.uk/dashboard</span>
                      </div>
                    </div>
                  </div>

                  {/* Dashboard content */}
                  <div className="bg-cream-100 dark:bg-[#1A1A1A] rounded-b-[19px] p-6">
                    <div className="flex items-center justify-between mb-5">
                      <div>
                        <h3 className="text-base font-semibold text-ink dark:text-cream-100 font-display">Master Collection</h3>
                        <p className="text-xs text-ink-400 dark:text-white/40 mt-0.5">All browsers synced</p>
                      </div>
                      <span className="text-xs bg-sage-50 text-sage-600 px-2.5 py-1 rounded-full font-medium border border-sage-100">Synced</span>
                    </div>

                    <div className="grid grid-cols-3 gap-3 mb-5">
                      <div className="bg-white dark:bg-[#242424] rounded-xl p-3.5 border border-cream-300 dark:border-white/[0.06]">
                        <div className="text-xl font-bold text-ink dark:text-cream-100 font-display">1,247</div>
                        <div className="text-[11px] text-ink-400 dark:text-white/40 mt-0.5">Bookmarks</div>
                      </div>
                      <div className="bg-white dark:bg-[#242424] rounded-xl p-3.5 border border-cream-300 dark:border-white/[0.06]">
                        <div className="text-xl font-bold text-ink dark:text-cream-100 font-display">4</div>
                        <div className="text-[11px] text-ink-400 dark:text-white/40 mt-0.5">Browsers</div>
                      </div>
                      <div className="bg-white dark:bg-[#242424] rounded-xl p-3.5 border border-cream-300 dark:border-white/[0.06]">
                        <div className="text-xl font-bold text-ink dark:text-cream-100 font-display">23</div>
                        <div className="text-[11px] text-ink-400 dark:text-white/40 mt-0.5">Sessions</div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {[
                        { name: 'Work Resources', count: 156, color: 'bg-terra-100 text-terra-600' },
                        { name: 'Development', count: 342, color: 'bg-sage-100 text-sage-600' },
                        { name: 'Personal', count: 89, color: 'bg-cream-300 text-ink-600' },
                      ].map((folder) => (
                        <div key={folder.name} className="flex items-center gap-3 bg-white dark:bg-[#242424] p-3 rounded-xl border border-cream-300 dark:border-white/[0.06]">
                          <div className={`w-8 h-8 rounded-lg ${folder.color} flex items-center justify-center`}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                            </svg>
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-medium text-ink dark:text-cream-100">{folder.name}</div>
                            <div className="text-[11px] text-ink-400 dark:text-white/40">{folder.count} bookmarks</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Decorative elements */}
              <div className="absolute -top-6 -right-6 w-24 h-24 bg-terra-400 rounded-3xl opacity-[0.06] blur-2xl"></div>
              <div className="absolute -bottom-10 -left-10 w-36 h-36 bg-sage-400 rounded-full opacity-[0.06] blur-3xl"></div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Trust Bar ═══ */}
      <section className="py-16 bg-white dark:bg-[#242424] border-y border-cream-300 dark:border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <RevealSection>
            <div className="flex flex-wrap items-center justify-center gap-12 lg:gap-20">
              {[
                { value: '50K+', label: 'Active Users' },
                { value: '2M+', label: 'Bookmarks Synced' },
                { value: '4', label: 'Browsers Supported' },
                { value: '99.9%', label: 'Uptime' },
              ].map((stat, i) => (
                <div key={i} className="text-center group">
                  <div className="font-display text-3xl lg:text-4xl font-bold text-ink dark:text-cream-100 tracking-tight">{stat.value}</div>
                  <div className="text-sm text-ink-400 dark:text-white/40 mt-1">{stat.label}</div>
                </div>
              ))}
            </div>
          </RevealSection>
        </div>
      </section>

      {/* ═══ Features Section ═══ */}
      <section id="features" className="py-24 lg:py-36 bg-cream-100 dark:bg-[#1A1A1A]">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <RevealSection>
            <div className="text-center max-w-2xl mx-auto mb-20">
              <p className="text-terra-500 font-semibold text-sm tracking-widest uppercase mb-4">Features</p>
              <h2 className="font-display text-4xl lg:text-5xl font-bold text-ink dark:text-cream-100 tracking-tight mb-6">
                Everything you need to manage bookmarks
              </h2>
              <p className="text-lg text-ink-500 dark:text-white/50 leading-relaxed">
                Powerful features designed for professionals who work across multiple browsers, devices, and accounts.
              </p>
            </div>
          </RevealSection>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <RevealSection key={index} delay={index * 80}>
                <div className="card-warm p-8 h-full group">
                  <div className="flex items-start justify-between mb-6">
                    <div className="w-12 h-12 rounded-xl bg-cream-200 dark:bg-white/[0.06] flex items-center justify-center text-ink-600 dark:text-cream-400 group-hover:bg-terra-50 dark:group-hover:bg-terra-500/10 group-hover:text-terra-500 transition-colors">
                      {feature.icon}
                    </div>
                    <span className="font-display text-4xl font-light italic text-terra-400/20">{feature.number}</span>
                  </div>
                  <h3 className="font-display text-xl font-semibold text-ink dark:text-cream-100 mb-3">{feature.title}</h3>
                  <p className="text-ink-500 dark:text-white/50 leading-relaxed">{feature.description}</p>
                </div>
              </RevealSection>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ How It Works ═══ */}
      <section id="how-it-works" className="py-24 lg:py-36 bg-white dark:bg-[#242424]">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <RevealSection>
            <div className="text-center max-w-2xl mx-auto mb-20">
              <p className="text-terra-500 font-semibold text-sm tracking-widest uppercase mb-4">How It Works</p>
              <h2 className="font-display text-4xl lg:text-5xl font-bold text-ink dark:text-cream-100 tracking-tight mb-6">
                Three steps to unified bookmarks
              </h2>
            </div>
          </RevealSection>

          <div className="grid md:grid-cols-3 gap-12 lg:gap-16 max-w-5xl mx-auto">
            {[
              {
                step: '01',
                title: 'Install Extension',
                description: 'Add BookMarx to each browser you use. Available for Chrome, Firefox, Edge, and Brave.',
              },
              {
                step: '02',
                title: 'Connect & Import',
                description: 'Sign in with Google or email. Your existing bookmarks are imported automatically.',
              },
              {
                step: '03',
                title: 'Stay Synced',
                description: 'Add a bookmark anywhere and it appears everywhere. Your collection stays unified.',
              },
            ].map((item, index) => (
              <RevealSection key={index} delay={index * 120}>
                <div className="text-center group">
                  <div className="relative inline-block mb-8">
                    <span className="font-display text-7xl font-light italic text-terra-400/15">{item.step}</span>
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-terra-400 scale-x-0 group-hover:scale-x-100 transition-transform origin-center"></div>
                  </div>
                  <h3 className="font-display text-xl font-semibold text-ink dark:text-cream-100 mb-3">{item.title}</h3>
                  <p className="text-ink-500 dark:text-white/50 leading-relaxed">{item.description}</p>
                </div>
              </RevealSection>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ Pricing Section ═══ */}
      <section id="pricing" className="py-24 lg:py-36 bg-cream-100 dark:bg-[#1A1A1A]">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <RevealSection>
            <div className="text-center max-w-2xl mx-auto mb-20">
              <p className="text-terra-500 font-semibold text-sm tracking-widest uppercase mb-4">Pricing</p>
              <h2 className="font-display text-4xl lg:text-5xl font-bold text-ink dark:text-cream-100 tracking-tight mb-6">
                Simple, transparent pricing
              </h2>
              <p className="text-lg text-ink-500 dark:text-white/50">
                Start free and upgrade when you need more. No hidden fees.
              </p>
            </div>
          </RevealSection>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {/* Free Plan */}
            <RevealSection delay={0}>
              <div className="bg-white dark:bg-[#242424] rounded-3xl p-8 border border-cream-300 dark:border-white/[0.06] h-full flex flex-col">
                <div className="mb-8">
                  <h3 className="font-display text-lg font-semibold text-ink dark:text-cream-100 mb-2">Free</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="font-display text-4xl font-bold text-ink dark:text-cream-100">$0</span>
                    <span className="text-ink-400 dark:text-white/40">/forever</span>
                  </div>
                </div>

                <ul className="space-y-4 mb-8 flex-1">
                  {[
                    `Up to ${config.limits.free.bookmarks} bookmarks`,
                    `${config.limits.free.browsers} browser connections`,
                    'View-only Master Collection',
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-sage-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-ink-600 dark:text-white/80">{item}</span>
                    </li>
                  ))}
                  {['Web editor', 'Session history & rollback', 'Mobile app access'].map((item, i) => (
                    <li key={`no-${i}`} className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-ink-200 dark:text-white/15 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      <span className="text-ink-300 dark:text-white/25">{item}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/register"
                  className="block w-full text-center border-2 border-cream-400 dark:border-white/15 hover:border-ink dark:hover:border-white/40 hover:bg-ink dark:hover:bg-white/10 hover:text-cream-100 text-ink dark:text-cream-100 px-6 py-3.5 rounded-xl font-semibold transition-all"
                >
                  Get Started
                </Link>
              </div>
            </RevealSection>

            {/* Premium Plan */}
            <RevealSection delay={100}>
              <div className="pricing-popular rounded-3xl p-8 text-white relative h-full flex flex-col lg:scale-[1.03]">
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-terra-500 text-white text-xs font-bold px-4 py-1.5 rounded-full tracking-wide">
                  MOST POPULAR
                </div>

                <div className="mb-8">
                  <h3 className="text-lg font-semibold text-white/80 mb-2 font-display">{config.branding.premiumTitle}</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="font-display text-4xl font-bold text-white">${config.pricing.monthly / 100}</span>
                    <span className="text-white/50">/month</span>
                  </div>
                  <p className="text-sm text-white/40 mt-1.5">or ${config.pricing.yearly / 100}/yr &middot; ${config.pricing.lifetime / 100} lifetime</p>
                </div>

                <ul className="space-y-4 mb-8 flex-1">
                  {[
                    `Up to ${config.limits.premium.bookmarks.toLocaleString()} bookmarks`,
                    'Unlimited browser connections',
                    'Multiple collections',
                    'Web drag & drop editor',
                    'Session history & rollback',
                    'Full mobile app access',
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-terra-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-white/90">{item}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/register?plan=premium"
                  className="block w-full text-center bg-terra-500 hover:bg-terra-600 text-white px-6 py-3.5 rounded-xl font-semibold transition-all hover:shadow-glow"
                >
                  Start {config.branding.premiumTitle}
                </Link>
              </div>
            </RevealSection>

            {/* Enterprise Plan */}
            <RevealSection delay={200}>
              <div className="bg-white dark:bg-[#242424] rounded-3xl p-8 border border-cream-300 dark:border-white/[0.06] h-full flex flex-col">
                <div className="mb-8">
                  <h3 className="font-display text-lg font-semibold text-ink dark:text-cream-100 mb-2">Enterprise</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="font-display text-4xl font-bold text-ink dark:text-cream-100">Custom</span>
                  </div>
                  <p className="text-sm text-ink-400 dark:text-white/40 mt-1.5">Contact us for pricing</p>
                </div>

                <ul className="space-y-4 mb-8 flex-1">
                  {[
                    `Everything in ${config.branding.premiumTitle}`,
                    'Unlimited bookmarks',
                    'Team sharing & collaboration',
                    'SSO integration',
                    'Priority support',
                    'Custom onboarding',
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-sage-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-ink-600 dark:text-white/80">{item}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="mailto:bookmarx@gasdigital.co.uk"
                  className="block w-full text-center border-2 border-cream-400 dark:border-white/15 hover:border-ink dark:hover:border-white/40 hover:bg-ink dark:hover:bg-white/10 hover:text-cream-100 text-ink dark:text-cream-100 px-6 py-3.5 rounded-xl font-semibold transition-all"
                >
                  Contact Sales
                </Link>
              </div>
            </RevealSection>
          </div>

          <RevealSection delay={300}>
            <div className="text-center mt-14">
              <p className="text-sm text-ink-400 dark:text-white/40">Secure payments powered by <span className="font-semibold text-ink-600 dark:text-white/70">Polar</span></p>
            </div>
          </RevealSection>
        </div>
      </section>

      {/* ═══ FAQ Section ═══ */}
      <section id="faq" className="py-24 lg:py-36 bg-white dark:bg-[#242424]">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <RevealSection>
            <div className="text-center max-w-2xl mx-auto mb-16">
              <p className="text-terra-500 font-semibold text-sm tracking-widest uppercase mb-4">FAQ</p>
              <h2 className="font-display text-4xl lg:text-5xl font-bold text-ink dark:text-cream-100 tracking-tight">
                Frequently asked questions
              </h2>
            </div>
          </RevealSection>

          <div className="max-w-3xl mx-auto space-y-3">
            {faqs.map((faq, index) => (
              <RevealSection key={index} delay={index * 60}>
                <div className="faq-item overflow-hidden">
                  <button
                    onClick={() => setOpenFaq(openFaq === index ? null : index)}
                    className="w-full flex items-center justify-between p-6 text-left group"
                  >
                    <span className="font-semibold text-ink dark:text-cream-100 pr-8 group-hover:text-terra-600 dark:group-hover:text-terra-400 transition-colors">{faq.question}</span>
                      <svg
                      className={`w-5 h-5 text-ink-300 dark:text-white/30 flex-shrink-0 transition-transform duration-300 ${openFaq === index ? 'rotate-45' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  </button>
                  <div
                    className="overflow-hidden transition-all duration-300"
                    style={{
                      maxHeight: openFaq === index ? '300px' : '0px',
                      opacity: openFaq === index ? 1 : 0,
                    }}
                  >
                    <div className="px-6 pb-6">
                      <p className="text-ink-500 dark:text-white/50 leading-relaxed">{faq.answer}</p>
                    </div>
                  </div>
                </div>
              </RevealSection>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CTA Section ═══ */}
      <section className="cta-section py-24 lg:py-36 relative">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 text-center relative z-10">
          <RevealSection>
            <h2 className="font-display text-4xl lg:text-6xl font-bold text-white tracking-tight mb-7">
              Ready to unify your bookmarks?
            </h2>
          </RevealSection>
          <RevealSection delay={100}>
            <p className="text-lg lg:text-xl text-white/60 mb-12 max-w-2xl mx-auto leading-relaxed">
              Join thousands of professionals who never lose a bookmark again.
              Start free, no credit card required.
            </p>
          </RevealSection>
          <RevealSection delay={200}>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/register"
                className="inline-flex items-center justify-center gap-2 bg-terra-500 hover:bg-terra-600 text-white px-8 py-4 rounded-xl font-semibold text-lg transition-all hover:shadow-glow-lg"
              >
                Get Started Free
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
              <Link
                href="#pricing"
                className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 text-white px-8 py-4 rounded-xl font-semibold text-lg border border-white/15 transition-all"
              >
                View Pricing
              </Link>
            </div>
          </RevealSection>
        </div>
      </section>

      <Footer />
    </div>
  )
}
