import type { Metadata, Viewport } from 'next'
import './globals.css'
import { AuthProvider } from '@/lib/auth-context'
import { ConfigProvider } from '@/lib/config-context'
import { ThemeProvider } from '@/lib/theme-context'
import { CookieConsentProvider } from '@/lib/cookie-consent'
import CookieConsent from '@/components/CookieConsent'
import GoogleAnalytics from '@/components/GoogleAnalytics'

export const metadata: Metadata = {
  title: 'BookMarx — Sync Bookmarks Across Every Browser',
  description: 'The unified bookmark sync solution for professionals. Seamlessly sync bookmarks between Chrome, Firefox, Edge, and Brave.',
  icons: {
    icon: '/favicon.svg',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="font-sans antialiased bg-cream-100 dark:bg-[#1A1A1A] text-ink dark:text-cream-100 transition-colors duration-300">
        <script dangerouslySetInnerHTML={{ __html: `try{var c=JSON.parse(localStorage.getItem('bookmarx-consent'));var ok=c&&c.version===1&&typeof c.savedAt==='number'&&c.savedAt<=Date.now()&&Date.now()-c.savedAt<15552000000&&c.preferences===true;if(ok&&localStorage.getItem('bookmarx-theme')==='light')document.documentElement.classList.remove('dark')}catch(e){}` }} />
        <ConfigProvider>
          <CookieConsentProvider>
            <ThemeProvider>
              <AuthProvider>
                {children}
                <GoogleAnalytics />
                <CookieConsent />
              </AuthProvider>
            </ThemeProvider>
          </CookieConsentProvider>
        </ConfigProvider>
      </body>
    </html>
  )
}
