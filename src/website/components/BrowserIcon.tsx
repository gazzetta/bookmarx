import Image from 'next/image'

const browsers = ['helium', 'brave', 'opera', 'edge', 'firefox', 'safari', 'chromium', 'chrome'] as const

export default function BrowserIcon({ browser, className = 'w-8 h-8' }: { browser: string; className?: string }) {
  const name = browsers.find(name => browser.toLowerCase().includes(name))
  if (!name) {
    return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-label="Browser" role="img">
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M3 9h18M7 6.5h.01M10 6.5h.01" />
    </svg>
  }
  return <Image src={`/browser-logos/${name}.png`} alt={`${name === 'edge' ? 'Microsoft Edge' : name[0].toUpperCase() + name.slice(1)} logo`}
    width={128} height={128} className={`${className} object-contain shrink-0`} unoptimized />
}
