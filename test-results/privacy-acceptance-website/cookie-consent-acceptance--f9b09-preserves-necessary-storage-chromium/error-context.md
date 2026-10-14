# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: cookie-consent.spec.ts >> acceptance permits only sanitised public events; withdrawal clears Analytics and preserves necessary storage
- Location: tests\website\cookie-consent.spec.ts:36:5

# Error details

```
Error: apiResponse.json: Response has been disposed
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - banner [ref=e3]:
      - navigation [ref=e4]:
        - generic [ref=e5]:
          - link "BookMarx" [ref=e6] [cursor=pointer]:
            - /url: /
            - img [ref=e8]
            - generic [ref=e10]: BookMarx
          - generic [ref=e11]:
            - link "Features" [ref=e12] [cursor=pointer]:
              - /url: "#features"
            - link "How It Works" [ref=e13] [cursor=pointer]:
              - /url: "#how-it-works"
            - link "Pricing" [ref=e14] [cursor=pointer]:
              - /url: "#pricing"
            - link "FAQ" [ref=e15] [cursor=pointer]:
              - /url: "#faq"
          - generic [ref=e16]:
            - button "Switch to dark mode" [ref=e17] [cursor=pointer]:
              - img
              - img [ref=e18]
            - link "Sign In" [ref=e20] [cursor=pointer]:
              - /url: /login
            - link "Get Started" [ref=e21] [cursor=pointer]:
              - /url: /register
    - generic [ref=e24]:
      - generic [ref=e25]:
        - generic [ref=e29]: Bookmarks across your Windows browsers
        - heading "Your bookmarks, everywhere" [level=1] [ref=e31]
        - paragraph [ref=e33]: Sync bookmarks across all your browsers, devices, and accounts. One unified library — whether you're on Chrome at work, Firefox at home, or Edge on your laptop.
        - generic [ref=e35]:
          - link "Start Free" [ref=e36] [cursor=pointer]:
            - /url: /register
            - text: Start Free
            - img [ref=e37]
          - link "See How It Works" [ref=e39] [cursor=pointer]:
            - /url: "#features"
        - generic [ref=e41]:
          - generic [ref=e42]: Works with
          - generic [ref=e43]:
            - img "Chrome logo" [ref=e45]
            - img "Firefox logo" [ref=e47]
            - img "Microsoft Edge logo" [ref=e49]
            - img "Brave logo" [ref=e51]
      - generic [ref=e54]:
        - generic [ref=e61]:
          - img [ref=e62]
          - generic [ref=e64]: www.bookmarx.cc/dashboard
        - generic [ref=e65]:
          - generic [ref=e66]:
            - generic [ref=e67]:
              - heading "Master Collection" [level=3] [ref=e68]
              - paragraph [ref=e69]: All browsers synced
            - generic [ref=e70]: Synced
          - generic [ref=e71]:
            - generic [ref=e72]:
              - generic [ref=e73]: 1,247
              - generic [ref=e74]: Bookmarks
            - generic [ref=e75]:
              - generic [ref=e76]: "4"
              - generic [ref=e77]: Browsers
            - generic [ref=e78]:
              - generic [ref=e79]: "3"
              - generic [ref=e80]: Collections
          - generic [ref=e81]:
            - generic [ref=e82]:
              - img [ref=e84]
              - generic [ref=e86]:
                - generic [ref=e87]: Work Resources
                - generic [ref=e88]: 156 bookmarks
            - generic [ref=e89]:
              - img [ref=e91]
              - generic [ref=e93]:
                - generic [ref=e94]: Development
                - generic [ref=e95]: 342 bookmarks
            - generic [ref=e96]:
              - img [ref=e98]
              - generic [ref=e100]:
                - generic [ref=e101]: Personal
                - generic [ref=e102]: 89 bookmarks
    - generic [ref=e108]:
      - generic [ref=e109]:
        - generic [ref=e110]: HTML
        - generic [ref=e111]: Browser Bookmark Import
      - generic [ref=e112]:
        - generic [ref=e113]: JSON
        - generic [ref=e114]: Portable Backups
      - generic [ref=e115]:
        - generic [ref=e116]: Folders
        - generic [ref=e117]: Your Hierarchy Preserved
      - generic [ref=e118]:
        - generic [ref=e119]: HTTPS
        - generic [ref=e120]: Production Connections
    - generic [ref=e122]:
      - generic [ref=e124]:
        - paragraph [ref=e125]: Features
        - heading "Everything you need to manage bookmarks" [level=2] [ref=e126]
        - paragraph [ref=e127]: Powerful features designed for professionals who work across multiple browsers, devices, and accounts.
      - generic [ref=e128]:
        - generic [ref=e130]:
          - generic [ref=e131]:
            - img [ref=e133]
            - generic [ref=e135]: "01"
          - heading "Cross-Browser Sync" [level=3] [ref=e136]
          - paragraph [ref=e137]: Seamlessly sync bookmarks between Chrome, Firefox, Edge, and Brave. Your bookmarks follow you, no matter which browser you open.
        - generic [ref=e139]:
          - generic [ref=e140]:
            - img [ref=e142]
            - generic [ref=e144]: "02"
          - heading "Mobile Access" [level=3] [ref=e145]
          - paragraph [ref=e146]: Use the website to browse your bookmark library on mobile. Native iOS and Android apps are planned.
        - generic [ref=e148]:
          - generic [ref=e149]:
            - img [ref=e151]
            - generic [ref=e153]: "03"
          - heading "Master Collection" [level=3] [ref=e154]
          - paragraph [ref=e155]: All your bookmarks unified in one place. A single source of truth that keeps every browser in perfect harmony.
        - generic [ref=e157]:
          - generic [ref=e158]:
            - img [ref=e160]
            - generic [ref=e162]: "04"
          - heading "Drag & Drop Editor" [level=3] [ref=e163]
          - paragraph [ref=e164]: Organize your bookmarks visually with our web-based editor. Rearrange, rename, and restructure — intuitively.
        - generic [ref=e166]:
          - generic [ref=e167]:
            - img [ref=e169]
            - generic [ref=e171]: "05"
          - heading "Session History" [level=3] [ref=e172]
          - paragraph [ref=e173]: Every sync is logged. Roll back changes, view import history, and restore previous bookmark states with a click.
        - generic [ref=e175]:
          - generic [ref=e176]:
            - img [ref=e178]
            - generic [ref=e180]: "06"
          - heading "Secure & Private" [level=3] [ref=e181]
          - paragraph [ref=e182]: Your bookmarks sync through your own account over HTTPS. We do not sell your bookmark data or track the pages you browse.
    - generic [ref=e184]:
      - generic [ref=e186]:
        - paragraph [ref=e187]: How It Works
        - heading "Three steps to unified bookmarks" [level=2] [ref=e188]
      - generic [ref=e189]:
        - generic [ref=e191]:
          - generic [ref=e192]: "01"
          - heading "Install Extension" [level=3] [ref=e193]
          - paragraph [ref=e194]: Add BookMarx to each browser you use. Available for Chrome, Firefox, Edge, and Brave.
        - generic [ref=e196]:
          - generic [ref=e197]: "02"
          - heading "Connect & Import" [level=3] [ref=e198]
          - paragraph [ref=e199]: Sign in with Google or email. Your existing bookmarks are imported automatically.
        - generic [ref=e201]:
          - generic [ref=e202]: "03"
          - heading "Stay Synced" [level=3] [ref=e203]
          - paragraph [ref=e204]: Add a bookmark anywhere and it appears everywhere. Your collection stays unified.
    - generic [ref=e206]:
      - generic [ref=e208]:
        - paragraph [ref=e209]: Pricing
        - heading "Simple, transparent pricing" [level=2] [ref=e210]
        - paragraph [ref=e211]: Start free and upgrade when you need more. No hidden fees.
      - generic [ref=e212]:
        - generic [ref=e214]:
          - generic [ref=e215]:
            - heading "Free" [level=3] [ref=e216]
            - generic [ref=e217]:
              - generic [ref=e218]: $0
              - generic [ref=e219]: /forever
          - list [ref=e220]:
            - listitem [ref=e221]:
              - img [ref=e222]
              - generic [ref=e224]: Up to 250 bookmarks
            - listitem [ref=e225]:
              - img [ref=e226]
              - generic [ref=e228]: 2 browser connections
            - listitem [ref=e229]:
              - img [ref=e230]
              - generic [ref=e232]: View-only Master Collection
            - listitem [ref=e233]:
              - img [ref=e234]
              - generic [ref=e236]: Web editor
            - listitem [ref=e237]:
              - img [ref=e238]
              - generic [ref=e240]: Session history & rollback
            - listitem [ref=e241]:
              - img [ref=e242]
              - generic [ref=e244]: Mobile app access
          - link "Get Started" [ref=e245] [cursor=pointer]:
            - /url: /register
        - generic [ref=e247]:
          - generic [ref=e248]: MOST POPULAR
          - generic [ref=e249]:
            - heading "Premium" [level=3] [ref=e250]
            - generic [ref=e251]:
              - generic [ref=e252]: $2.49
              - generic [ref=e253]: /month
            - paragraph [ref=e254]: or $24.99/yr · $49.99 lifetime
            - paragraph [ref=e255]: 7-day free trial included
          - list [ref=e256]:
            - listitem [ref=e257]:
              - img [ref=e258]
              - generic [ref=e260]: Up to 10,000 bookmarks
            - listitem [ref=e261]:
              - img [ref=e262]
              - generic [ref=e264]: Up to 100 browser profiles
            - listitem [ref=e265]:
              - img [ref=e266]
              - generic [ref=e268]: Multiple collections
            - listitem [ref=e269]:
              - img [ref=e270]
              - generic [ref=e272]: Web drag & drop editor
            - listitem [ref=e273]:
              - img [ref=e274]
              - generic [ref=e276]: Session history & rollback
            - listitem [ref=e277]:
              - img [ref=e278]
              - generic [ref=e280]: Bookmark file import & export
          - link "Start Premium" [ref=e281] [cursor=pointer]:
            - /url: /register?plan=premium
        - generic [ref=e283]:
          - generic [ref=e284]:
            - heading "Enterprise" [level=3] [ref=e285]
            - generic [ref=e287]: Custom
            - paragraph [ref=e288]: Contact us for pricing
          - list [ref=e289]:
            - listitem [ref=e290]:
              - img [ref=e291]
              - generic [ref=e293]: Everything in Premium
            - listitem [ref=e294]:
              - img [ref=e295]
              - generic [ref=e297]: Up to 10,000 bookmarks
            - listitem [ref=e298]:
              - img [ref=e299]
              - generic [ref=e301]: Team sharing & collaboration
            - listitem [ref=e302]:
              - img [ref=e303]
              - generic [ref=e305]: SSO integration
            - listitem [ref=e306]:
              - img [ref=e307]
              - generic [ref=e309]: Priority support
            - listitem [ref=e310]:
              - img [ref=e311]
              - generic [ref=e313]: Custom onboarding
          - link "Contact Sales" [ref=e314] [cursor=pointer]:
            - /url: /contact
      - paragraph [ref=e317]: Secure payments powered by PayPal
    - generic [ref=e319]:
      - generic [ref=e321]:
        - paragraph [ref=e322]: FAQ
        - heading "Frequently asked questions" [level=2] [ref=e323]
      - generic [ref=e324]:
        - generic [ref=e326]:
          - button "How does cross-browser syncing work?" [ref=e327] [cursor=pointer]:
            - generic [ref=e328]: How does cross-browser syncing work?
            - img [ref=e329]
          - paragraph [ref=e332]: Install our browser extension on each browser you use. BookMarx creates a unified "Master Collection" that merges all your bookmarks intelligently, deduplicating URLs and preserving folder structures. Changes in any browser are synced to all others in real-time.
        - generic [ref=e334]:
          - button "What happens to my existing bookmarks?" [ref=e335] [cursor=pointer]:
            - generic [ref=e336]: What happens to my existing bookmarks?
            - img [ref=e337]
          - paragraph [ref=e340]: When you first install BookMarx, your existing bookmarks are safely imported into your Master Collection. We never delete or modify your original browser bookmarks without your explicit consent. You can always roll back to a previous state.
        - generic [ref=e342]:
          - button "Is my data secure?" [ref=e343] [cursor=pointer]:
            - generic [ref=e344]: Is my data secure?
            - img [ref=e345]
          - paragraph [ref=e348]: Production connections use HTTPS to protect bookmarks in transit. Your account controls access to your library. You can export your bookmarks and delete bookmarks or collections.
        - generic [ref=e350]:
          - button "Can I use BookMarx with multiple Google accounts?" [ref=e351] [cursor=pointer]:
            - generic [ref=e352]: Can I use BookMarx with multiple Google accounts?
            - img [ref=e353]
          - paragraph [ref=e356]: Yes! Each browser instance is tracked separately, so you can have Chrome logged into your personal Google account and another Chrome profile logged into your work account. BookMarx syncs them all to your single Master Collection.
        - generic [ref=e358]:
          - button "What browsers are supported?" [ref=e359] [cursor=pointer]:
            - generic [ref=e360]: What browsers are supported?
            - img [ref=e361]
          - paragraph [ref=e364]: We currently support Chrome, Firefox, Microsoft Edge, Brave, and other Chromium-based browsers. Safari support and mobile apps for iOS and Android are coming soon for Premium users.
        - generic [ref=e366]:
          - button "What's included in Premium?" [ref=e367] [cursor=pointer]:
            - generic [ref=e368]: What's included in Premium?
            - img [ref=e369]
          - paragraph [ref=e372]: Premium includes up to 10,000 bookmarks (vs 250 free) and 100 browser profiles (vs 2 free), the web-based drag & drop editor, session history with rollback, multiple collections, and priority support.
    - generic [ref=e374]:
      - heading "Ready to unify your bookmarks?" [level=2] [ref=e376]
      - paragraph [ref=e378]: Join thousands of professionals who never lose a bookmark again. Start free, no credit card required.
      - generic [ref=e380]:
        - link "Get Started Free" [ref=e381] [cursor=pointer]:
          - /url: /register
          - text: Get Started Free
          - img [ref=e382]
        - link "View Pricing" [ref=e384] [cursor=pointer]:
          - /url: "#pricing"
    - contentinfo [ref=e385]:
      - generic [ref=e387]:
        - generic [ref=e388]:
          - generic [ref=e389]:
            - link "BookMarx" [ref=e390] [cursor=pointer]:
              - /url: /
              - img [ref=e392]
              - generic [ref=e394]: BookMarx
            - paragraph [ref=e395]: The unified bookmark sync solution for professionals who work across multiple browsers, devices, and accounts.
            - generic [ref=e397]:
              - img "Chrome logo" [ref=e398]
              - img "Firefox logo" [ref=e399]
              - img "Microsoft Edge logo" [ref=e400]
              - img "Brave logo" [ref=e401]
          - generic [ref=e402]:
            - heading "Product" [level=4] [ref=e403]
            - list [ref=e404]:
              - listitem [ref=e405]:
                - link "Features" [ref=e406] [cursor=pointer]:
                  - /url: /#features
              - listitem [ref=e407]:
                - link "Pricing" [ref=e408] [cursor=pointer]:
                  - /url: /#pricing
              - listitem [ref=e409]:
                - link "How It Works" [ref=e410] [cursor=pointer]:
                  - /url: /#how-it-works
              - listitem [ref=e411]:
                - link "FAQ" [ref=e412] [cursor=pointer]:
                  - /url: /#faq
          - generic [ref=e413]:
            - heading "Support" [level=4] [ref=e414]
            - list [ref=e415]:
              - listitem [ref=e416]:
                - link "Sign In" [ref=e417] [cursor=pointer]:
                  - /url: /login
              - listitem [ref=e418]:
                - link "Register" [ref=e419] [cursor=pointer]:
                  - /url: /register
              - listitem [ref=e420]:
                - link "Help & requests" [ref=e421] [cursor=pointer]:
                  - /url: /contact
          - generic [ref=e422]:
            - heading "Legal" [level=4] [ref=e423]
            - list [ref=e424]:
              - listitem [ref=e425]:
                - link "Privacy Policy" [ref=e426] [cursor=pointer]:
                  - /url: /privacy
              - listitem [ref=e427]:
                - link "Terms of Service" [ref=e428] [cursor=pointer]:
                  - /url: /terms
              - listitem [ref=e429]:
                - link "Cookies & local storage" [ref=e430] [cursor=pointer]:
                  - /url: /cookies
        - generic [ref=e431]:
          - paragraph [ref=e432]: © 2026 BookMarx. All rights reserved.
          - link "Made by BookMarx" [ref=e433] [cursor=pointer]:
            - /url: https://www.bookmarx.cc/
  - button "Open Next.js Dev Tools" [ref=e439] [cursor=pointer]:
    - img [ref=e440]
  - alert [ref=e443]
  - button "Cookie settings" [ref=e444] [cursor=pointer]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test'
  2  | 
  3  | async function configuredAnalytics(page: import('@playwright/test').Page) {
  4  |   let loads = 0
  5  |   await page.route('**/api/v1/config', async route => {
  6  |     const response = await route.fetch()
> 7  |     const body = await response.json()
     |                                 ^ Error: apiResponse.json: Response has been disposed
  8  |     body.data.analytics = { measurementId: 'G-TEST123' }
  9  |     await route.fulfill({ json: body })
  10 |   })
  11 |   // Never send test visits to Google. Test the real consent/script boundary.
  12 |   await page.route('https://www.googletagmanager.com/**', async route => {
  13 |     loads++
  14 |     await route.fulfill({ contentType: 'application/javascript', body: "document.cookie='_ga=test; Path=/; SameSite=Lax';" })
  15 |   })
  16 |   return () => loads
  17 | }
  18 | 
  19 | test('nothing loads before consent; rejection persists and does not save a theme', async ({ page }) => {
  20 |   const loads = await configuredAnalytics(page)
  21 |   const external: string[] = []
  22 |   page.on('request', request => { if (/fonts\.(googleapis|gstatic)\.com|google-analytics\.com/.test(request.url())) external.push(request.url()) })
  23 |   await page.goto('/')
  24 |   await expect(page.getByRole('heading', { name: 'Your privacy choices' })).toBeVisible()
  25 |   await expect(page.locator('#bookmarx-google-analytics')).toHaveCount(0)
  26 |   expect(loads()).toBe(0)
  27 |   await page.getByRole('button', { name: 'Reject optional', exact: true }).click()
  28 |   await expect(page.getByRole('button', { name: 'Cookie settings', exact: true })).toBeVisible()
  29 |   await page.reload()
  30 |   await expect(page.getByRole('button', { name: 'Cookie settings', exact: true })).toBeVisible()
  31 |   expect(await page.evaluate(() => localStorage.getItem('bookmarx-theme'))).toBeNull()
  32 |   expect(loads()).toBe(0)
  33 |   expect(external).toEqual([])
  34 | })
  35 | 
  36 | test('acceptance permits only sanitised public events; withdrawal clears Analytics and preserves necessary storage', async ({ page }) => {
  37 |   const loads = await configuredAnalytics(page)
  38 |   await page.goto('/?email=private@example.test#secret')
  39 |   await expect(page.getByText('use Google Analytics to understand visits to our public pages.', { exact: false })).toBeVisible()
  40 |   await page.getByRole('button', { name: 'Accept optional', exact: true }).click()
  41 |   await expect.poll(loads).toBe(1)
  42 |   await expect.poll(async () => (await page.context().cookies()).some(cookie => cookie.name === '_ga')).toBe(true)
  43 |   const events = await page.evaluate(() => Array.from((window as any).dataLayer || [], (args: any) => Array.from(args)))
  44 |   expect(JSON.stringify(events)).not.toMatch(/private@example|#secret/)
  45 |   expect(events).toContainEqual(['consent', 'update', { analytics_storage: 'granted' }])
  46 |   const views = events.filter((event: any) => event[0] === 'event' && event[1] === 'page_view')
  47 |   expect(views).toHaveLength(1)
  48 |   await page.evaluate(() => localStorage.setItem('bookmarx_token', 'essential-storage-marker'))
  49 |   await page.getByRole('button', { name: 'Cookie settings', exact: true }).click()
  50 |   await page.getByRole('button', { name: 'Reject optional', exact: true }).click()
  51 |   await expect(page.getByRole('button', { name: 'Cookie settings', exact: true })).toBeVisible()
  52 |   await expect(page.locator('#bookmarx-google-analytics')).toHaveCount(0)
  53 |   expect(loads()).toBe(1)
  54 |   expect((await page.context().cookies()).some(cookie => cookie.name.startsWith('_ga'))).toBe(false)
  55 |   expect(await page.evaluate(() => localStorage.getItem('bookmarx_token'))).toBe('essential-storage-marker')
  56 |   expect(await page.evaluate(() => localStorage.getItem('bookmarx-theme'))).toBeNull()
  57 | })
  58 | 
  59 | test('settings allow preference-only consent and private pages never initialise Analytics', async ({ page }) => {
  60 |   const loads = await configuredAnalytics(page)
  61 |   await page.goto('/cookies')
  62 |   await page.getByRole('button', { name: 'Choose settings' }).click()
  63 |   await page.getByLabel('Remember my light/dark theme between visits').check()
  64 |   await page.getByRole('button', { name: 'Save choices', exact: true }).click()
  65 |   expect(loads()).toBe(0)
  66 |   await expect.poll(async () => page.evaluate(() => localStorage.getItem('bookmarx-theme'))).not.toBeNull()
  67 |   await page.getByRole('button', { name: 'Cookie settings', exact: true }).click()
  68 |   await page.getByLabel('Google Analytics (optional; no advertising)', { exact: true }).check()
  69 |   await page.getByRole('button', { name: 'Save choices', exact: true }).click()
  70 |   await expect.poll(loads).toBe(1)
  71 |   await page.goto('/verify-email')
  72 |   await expect(page.getByRole('button', { name: 'Cookie settings', exact: true })).toBeVisible()
  73 |   await expect(page.locator('#bookmarx-google-analytics')).toHaveCount(0)
  74 |   expect(loads()).toBe(1)
  75 | })
  76 | 
  77 | test('expired choices require new consent and remove previous Analytics cookies', async ({ page }) => {
  78 |   const loads = await configuredAnalytics(page)
  79 |   await page.addInitScript(() => {
  80 |     localStorage.setItem('bookmarx-consent', JSON.stringify({ version: 1, savedAt: Date.now() - 181 * 86400000, analytics: true, preferences: true }))
  81 |     document.cookie = '_ga=expired; Path=/'
  82 |   })
  83 |   await page.goto('/')
  84 |   await expect(page.getByRole('heading', { name: 'Your privacy choices' })).toBeVisible()
  85 |   expect(loads()).toBe(0)
  86 |   expect((await page.context().cookies()).some(cookie => cookie.name === '_ga')).toBe(false)
  87 | })
  88 | 
```