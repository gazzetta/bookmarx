import Link from 'next/link'
import Footer from './Footer'
import type { ReactNode } from 'react'

export const businessAddress = 'GasDigital Ltd, 82 Wandsworth Bridge Rd, London, SW6 2TF, United Kingdom'
export interface LegalSection { heading: string; paragraphs: string[] }

export default function LegalPage({ title, sections = [], children }: { title: string; sections?: LegalSection[]; children?: ReactNode }) {
  return <div className="legal-page min-h-screen bg-cream-100 dark:bg-[#1A1A1A]">
    <nav aria-label="Legal page navigation" className="border-b border-cream-300 dark:border-white/10 px-6 py-4">
      <div className="max-w-5xl mx-auto flex justify-between gap-4"><Link href="/" className="font-semibold text-lg">BookMarx</Link><Link href="/dashboard" className="underline">My account</Link></div>
    </nav>
    <main className="max-w-3xl mx-auto px-6 py-12 lg:py-20">
      <h1 className="font-display text-4xl font-bold mb-4">{title}</h1>
      <p className="mb-10 text-ink-500 dark:text-cream-400">Last updated: 14 October 2026</p>
      <div className="space-y-8 leading-relaxed [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:mb-3 [&_p]:mb-3 [&_a]:underline">
        {sections.map(section => <section key={section.heading}><h2>{section.heading}</h2>{section.paragraphs.map(text => <p key={text}>{text}</p>)}</section>)}
        {children}
      </div>
    </main>
    <Footer />
  </div>
}
