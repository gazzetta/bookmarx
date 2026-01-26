import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-white">
      {/* Header */}
      <header className="container mx-auto px-4 py-6">
        <nav className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📚</span>
            <span className="text-xl font-bold text-gray-900">BookMarx</span>
          </div>
          <div className="flex items-center gap-4">
            <Link 
              href="/login" 
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              Sign In
            </Link>
            <Link 
              href="/register" 
              className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Get Started
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <main className="container mx-auto px-4 py-20">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">
            Your Bookmarks, <span className="text-amber-500">Everywhere</span>
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Sync your bookmarks across Chrome, Firefox, Edge, Brave, and mobile devices. 
            Never lose a bookmark again.
          </p>
          <div className="flex gap-4 justify-center">
            <Link 
              href="/register" 
              className="bg-amber-500 hover:bg-amber-600 text-white px-8 py-3 rounded-lg font-medium text-lg transition-colors"
            >
              Start Free
            </Link>
            <Link 
              href="#features" 
              className="border border-gray-300 hover:border-gray-400 text-gray-700 px-8 py-3 rounded-lg font-medium text-lg transition-colors"
            >
              Learn More
            </Link>
          </div>
        </div>

        {/* Features */}
        <div id="features" className="mt-32 grid md:grid-cols-3 gap-8">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="text-3xl mb-4">🔄</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Cross-Browser Sync</h3>
            <p className="text-gray-600">
              Sync bookmarks between Chrome, Firefox, Edge, and Brave seamlessly.
            </p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="text-3xl mb-4">📱</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Mobile Access</h3>
            <p className="text-gray-600">
              Access and add bookmarks from iOS and Android with our mobile app.
            </p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="text-3xl mb-4">✏️</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Web Editor</h3>
            <p className="text-gray-600">
              Organize your Master Collection with our powerful drag-and-drop editor.
            </p>
          </div>
        </div>

        {/* Pricing */}
        <div className="mt-32">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">Simple Pricing</h2>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Free */}
            <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Free</h3>
              <div className="text-4xl font-bold text-gray-900 mb-4">$0</div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2 text-gray-600">
                  <span className="text-green-500">✓</span> 250 bookmarks
                </li>
                <li className="flex items-center gap-2 text-gray-600">
                  <span className="text-green-500">✓</span> 2 browser sync
                </li>
                <li className="flex items-center gap-2 text-gray-600">
                  <span className="text-green-500">✓</span> View-only Master Collection
                </li>
                <li className="flex items-center gap-2 text-gray-400">
                  <span>✗</span> Web editor
                </li>
                <li className="flex items-center gap-2 text-gray-400">
                  <span>✗</span> Session history
                </li>
                <li className="flex items-center gap-2 text-gray-400">
                  <span>✗</span> Mobile app
                </li>
              </ul>
              <Link 
                href="/register" 
                className="block w-full text-center border border-gray-300 hover:border-gray-400 text-gray-700 px-6 py-3 rounded-lg font-medium transition-colors"
              >
                Get Started
              </Link>
            </div>

            {/* Premium */}
            <div className="bg-gradient-to-br from-amber-50 to-amber-100 p-8 rounded-xl shadow-md border-2 border-amber-300 relative">
              <div className="absolute -top-3 right-4 bg-amber-500 text-white text-sm px-3 py-1 rounded-full">
                Popular
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Premium</h3>
              <div className="text-4xl font-bold text-gray-900 mb-1">$5<span className="text-lg font-normal text-gray-600">/month</span></div>
              <p className="text-sm text-gray-500 mb-4">or $50/year • $100 lifetime</p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2 text-gray-700">
                  <span className="text-amber-500">✓</span> 10,000 bookmarks
                </li>
                <li className="flex items-center gap-2 text-gray-700">
                  <span className="text-amber-500">✓</span> Unlimited browsers
                </li>
                <li className="flex items-center gap-2 text-gray-700">
                  <span className="text-amber-500">✓</span> Multiple collections
                </li>
                <li className="flex items-center gap-2 text-gray-700">
                  <span className="text-amber-500">✓</span> Web drag-drop editor
                </li>
                <li className="flex items-center gap-2 text-gray-700">
                  <span className="text-amber-500">✓</span> Session history & rollback
                </li>
                <li className="flex items-center gap-2 text-gray-700">
                  <span className="text-amber-500">✓</span> Full mobile app access
                </li>
              </ul>
              <Link 
                href="/register?plan=premium" 
                className="block w-full text-center bg-amber-500 hover:bg-amber-600 text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                Start Premium
              </Link>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-12 mt-20 border-t border-gray-200">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">📚</span>
            <span className="font-semibold text-gray-900">BookMarx</span>
          </div>
          <div className="flex gap-6 text-sm text-gray-600">
            <Link href="/privacy" className="hover:text-gray-900">Privacy</Link>
            <Link href="/terms" className="hover:text-gray-900">Terms</Link>
            <Link href="/contact" className="hover:text-gray-900">Contact</Link>
          </div>
          <p className="text-sm text-gray-500">© 2026 BookMarx. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
