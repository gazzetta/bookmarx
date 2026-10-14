# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: landing.spec.ts >> Landing page (/) >> theme toggle persists across navigation (bookmarx-theme key)
- Location: tests\website\landing.spec.ts:41:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "dark"
Received: ""
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
          - list [ref=e255]:
            - listitem [ref=e256]:
              - img [ref=e257]
              - generic [ref=e259]: Up to 10,000 bookmarks
            - listitem [ref=e260]:
              - img [ref=e261]
              - generic [ref=e263]: Up to 100 browser profiles
            - listitem [ref=e264]:
              - img [ref=e265]
              - generic [ref=e267]: Multiple collections
            - listitem [ref=e268]:
              - img [ref=e269]
              - generic [ref=e271]: Web drag & drop editor
            - listitem [ref=e272]:
              - img [ref=e273]
              - generic [ref=e275]: Session history & rollback
            - listitem [ref=e276]:
              - img [ref=e277]
              - generic [ref=e279]: Bookmark file import & export
          - link "Start Premium" [ref=e280] [cursor=pointer]:
            - /url: /register?plan=premium
        - generic [ref=e282]:
          - generic [ref=e283]:
            - heading "Enterprise" [level=3] [ref=e284]
            - generic [ref=e286]: Custom
            - paragraph [ref=e287]: Contact us for pricing
          - list [ref=e288]:
            - listitem [ref=e289]:
              - img [ref=e290]
              - generic [ref=e292]: Everything in Premium
            - listitem [ref=e293]:
              - img [ref=e294]
              - generic [ref=e296]: Up to 10,000 bookmarks
            - listitem [ref=e297]:
              - img [ref=e298]
              - generic [ref=e300]: Team sharing & collaboration
            - listitem [ref=e301]:
              - img [ref=e302]
              - generic [ref=e304]: SSO integration
            - listitem [ref=e305]:
              - img [ref=e306]
              - generic [ref=e308]: Priority support
            - listitem [ref=e309]:
              - img [ref=e310]
              - generic [ref=e312]: Custom onboarding
          - link "Contact Sales" [ref=e313] [cursor=pointer]:
            - /url: mailto:support@bookmarx.cc
      - paragraph [ref=e316]: Secure payments powered by PayPal
    - generic [ref=e318]:
      - generic [ref=e320]:
        - paragraph [ref=e321]: FAQ
        - heading "Frequently asked questions" [level=2] [ref=e322]
      - generic [ref=e323]:
        - generic [ref=e325]:
          - button "How does cross-browser syncing work?" [ref=e326] [cursor=pointer]:
            - generic [ref=e327]: How does cross-browser syncing work?
            - img [ref=e328]
          - paragraph [ref=e331]: Install our browser extension on each browser you use. BookMarx creates a unified "Master Collection" that merges all your bookmarks intelligently, deduplicating URLs and preserving folder structures. Changes in any browser are synced to all others in real-time.
        - generic [ref=e333]:
          - button "What happens to my existing bookmarks?" [ref=e334] [cursor=pointer]:
            - generic [ref=e335]: What happens to my existing bookmarks?
            - img [ref=e336]
          - paragraph [ref=e339]: When you first install BookMarx, your existing bookmarks are safely imported into your Master Collection. We never delete or modify your original browser bookmarks without your explicit consent. You can always roll back to a previous state.
        - generic [ref=e341]:
          - button "Is my data secure?" [ref=e342] [cursor=pointer]:
            - generic [ref=e343]: Is my data secure?
            - img [ref=e344]
          - paragraph [ref=e347]: Production connections use HTTPS to protect bookmarks in transit. Your account controls access to your library. You can export your bookmarks and delete bookmarks or collections.
        - generic [ref=e349]:
          - button "Can I use BookMarx with multiple Google accounts?" [ref=e350] [cursor=pointer]:
            - generic [ref=e351]: Can I use BookMarx with multiple Google accounts?
            - img [ref=e352]
          - paragraph [ref=e355]: Yes! Each browser instance is tracked separately, so you can have Chrome logged into your personal Google account and another Chrome profile logged into your work account. BookMarx syncs them all to your single Master Collection.
        - generic [ref=e357]:
          - button "What browsers are supported?" [ref=e358] [cursor=pointer]:
            - generic [ref=e359]: What browsers are supported?
            - img [ref=e360]
          - paragraph [ref=e363]: We currently support Chrome, Firefox, Microsoft Edge, Brave, and other Chromium-based browsers. Safari support and mobile apps for iOS and Android are coming soon for Premium users.
        - generic [ref=e365]:
          - button "What's included in Premium?" [ref=e366] [cursor=pointer]:
            - generic [ref=e367]: What's included in Premium?
            - img [ref=e368]
          - paragraph [ref=e371]: Premium includes up to 10,000 bookmarks (vs 250 free) and 100 browser profiles (vs 2 free), the web-based drag & drop editor, session history with rollback, multiple collections, and priority support.
    - generic [ref=e373]:
      - heading "Ready to unify your bookmarks?" [level=2] [ref=e375]
      - paragraph [ref=e377]: Join thousands of professionals who never lose a bookmark again. Start free, no credit card required.
      - generic [ref=e379]:
        - link "Get Started Free" [ref=e380] [cursor=pointer]:
          - /url: /register
          - text: Get Started Free
          - img [ref=e381]
        - link "View Pricing" [ref=e383] [cursor=pointer]:
          - /url: "#pricing"
    - contentinfo [ref=e384]:
      - generic [ref=e386]:
        - generic [ref=e387]:
          - generic [ref=e388]:
            - link "BookMarx" [ref=e389] [cursor=pointer]:
              - /url: /
              - img [ref=e391]
              - generic [ref=e393]: BookMarx
            - paragraph [ref=e394]: The unified bookmark sync solution for professionals who work across multiple browsers, devices, and accounts.
            - generic [ref=e396]:
              - img "Chrome logo" [ref=e397]
              - img "Firefox logo" [ref=e398]
              - img "Microsoft Edge logo" [ref=e399]
              - img "Brave logo" [ref=e400]
          - generic [ref=e401]:
            - heading "Product" [level=4] [ref=e402]
            - list [ref=e403]:
              - listitem [ref=e404]:
                - link "Features" [ref=e405] [cursor=pointer]:
                  - /url: /#features
              - listitem [ref=e406]:
                - link "Pricing" [ref=e407] [cursor=pointer]:
                  - /url: /#pricing
              - listitem [ref=e408]:
                - link "How It Works" [ref=e409] [cursor=pointer]:
                  - /url: /#how-it-works
              - listitem [ref=e410]:
                - link "FAQ" [ref=e411] [cursor=pointer]:
                  - /url: /#faq
          - generic [ref=e412]:
            - heading "Support" [level=4] [ref=e413]
            - list [ref=e414]:
              - listitem [ref=e415]:
                - link "Sign In" [ref=e416] [cursor=pointer]:
                  - /url: /login
              - listitem [ref=e417]:
                - link "Register" [ref=e418] [cursor=pointer]:
                  - /url: /register
          - generic [ref=e419]:
            - heading "Legal" [level=4] [ref=e420]
            - list [ref=e421]:
              - listitem [ref=e422]:
                - link "Privacy Policy" [ref=e423] [cursor=pointer]:
                  - /url: /privacy
              - listitem [ref=e424]:
                - link "Terms of Service" [ref=e425] [cursor=pointer]:
                  - /url: /terms
              - listitem [ref=e426]:
                - link "Cookies & local storage" [ref=e427] [cursor=pointer]:
                  - /url: /cookies
        - generic [ref=e428]:
          - paragraph [ref=e429]: © 2026 BookMarx. All rights reserved.
          - link "Made by BookMarx" [ref=e430] [cursor=pointer]:
            - /url: https://www.bookmarx.cc/
  - button "Open Next.js Dev Tools" [ref=e436] [cursor=pointer]:
    - img [ref=e437]
  - alert [ref=e440]
  - button "Cookie settings" [ref=e441] [cursor=pointer]
```

# Test source

```ts
  1  | // tests/website/landing.spec.ts
  2  | //
  3  | // L2 — Landing page (/) is the only fully-public route that doesn't need
  4  | // auth or DB interaction. Asserts render contract the user actually sees
  5  | // on first visit.
  6  | import { test, expect } from './_fixtures';
  7  | 
  8  | test.describe('Landing page (/)', () => {
  9  |   test('loads without console errors and renders hero, pricing, FAQ', async ({ page }) => {
  10 |     await page.goto('/');
  11 |     await expect(page).toHaveURL(/\//);
  12 | 
  13 |     // Hero CTA — the practical definition of "page loaded". `.first()` goes on
  14 |     // the LOCATOR (not the expect result); the previous wrong placement made
  15 |     // expect(...).first is not a function.
  16 |     await expect(page.getByRole('link', { name: /Get Started|Start Free/i }).first()).toBeVisible();
  17 |     await expect(page.getByRole('link', { name: /Sign In/i }).first()).toBeVisible();
  18 | 
  19 |     // Pricing section is config-driven from /api/v1/config. Asserting the
  20 |     // "MOST POPULAR" text confirms the API call succeeded and rendered.
  21 |     await expect(page.locator('#pricing')).toBeVisible();
  22 |     // The pricing table renders three cards; one is "Most Popular".
  23 |     await expect(page.getByText(/MOST POPULAR/i)).toBeVisible();
  24 | 
  25 |     // FAQ is the last big section; if it rendered, hydration finished.
  26 |     await expect(page.locator('#faq')).toBeVisible();
  27 |   });
  28 | 
  29 |   test('Get Started navigates to /register', async ({ page }) => {
  30 |     await page.goto('/');
  31 |     await page.getByRole('link', { name: /Get Started|Start Free/i }).first().click();
  32 |     await expect(page).toHaveURL(/\/register/);
  33 |   });
  34 | 
  35 |   test('Sign In navigates to /login', async ({ page }) => {
  36 |     await page.goto('/');
  37 |     await page.getByRole('link', { name: /Sign In/i }).first().click();
  38 |     await expect(page).toHaveURL(/\/login/);
  39 |   });
  40 | 
  41 |   test('theme toggle persists across navigation (bookmarx-theme key)', async ({ page }) => {
  42 |     await page.goto('/');
  43 | 
  44 |     // The theme toggle button is the one in the navbar. Per
  45 |     // src/website/lib/theme-context.tsx:45 it stores to 'bookmarx-theme' and
  46 |     // the html element gets a class. The button itself has no stable aria
  47 |     // label, so we match a button inside the header region.
  48 |     const header = page.locator('header').first();
  49 |     const themeButton = header.getByRole('button', { name: /☀|🌙|dark|light|toggle/i }).first();
  50 | 
  51 |     if (await themeButton.isVisible().catch(() => false)) {
  52 |       await themeButton.click();
  53 |       // After the click, the html element should carry 'dark' (or removed)
  54 |       // some asymmetry; the actual class assignment depends on the page.
  55 |       // The robust assertion is that localStorage persists across reload.
  56 |       // Reload the page and verify the html tag's className still reflects dark.
  57 |       const classNameAfterClick = await page.locator('html').evaluate(el => el.className);
  58 |       await page.goto('/');
  59 |       const classNameAfterReload = await page.locator('html').evaluate(el => el.className);
> 60 |       expect(classNameAfterReload).toBe(classNameAfterClick);
     |                                    ^ Error: expect(received).toBe(expected) // Object.is equality
  61 |     }
  62 |   });
  63 | });
```