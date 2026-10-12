# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth-gating.spec.ts >> auth gating — unauthenticated users bounce to /login >> GET /install → /login
- Location: tests\website\auth-gating.spec.ts:26:9

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /\/login(\?.*)?$/
Received string:  "http://localhost:3005/install"
Timeout: 5000ms

Call log:
  - Expect "toHaveURL" with timeout 5000ms
    10 × unexpected value "http://localhost:3005/install"

```

```yaml
- alert
```

# Test source

```ts
  1  | // tests/website/auth-gating.spec.ts
  2  | //
  3  | // L2 — Every protected route on the website must bounce to /login when no
  4  | // auth token is in localStorage. src/website/lib/auth-context.tsx:27-28
  5  | // reads `bookmarx_token`, and each protected page has a useEffect that
  6  | // calls router.push('/login') when `!user` (e.g. dashboard:19-20).
  7  | //
  8  | // This is the "embarrassing regression catch" — if someone moves the gating
  9  | // to a HOC or middleware and misses one page, this test goes red.
  10 | import { test, expect } from './_fixtures';
  11 | 
  12 | const PROTECTED_ROUTES = [
  13 |   '/dashboard',
  14 |   '/collections',
  15 |   '/collections/default',
  16 |   '/collections/default/edit',
  17 |   '/sessions',
  18 |   '/install',
  19 |   '/settings',
  20 |   '/settings/subscription',
  21 |   '/settings/browsers',
  22 | ];
  23 | 
  24 | test.describe('auth gating — unauthenticated users bounce to /login', () => {
  25 |   for (const route of PROTECTED_ROUTES) {
  26 |     test(`GET ${route} → /login`, async ({ page }) => {
  27 |       // Defensive: ensure NO bookmarx_token in localStorage. A previous test
  28 |       // could have left one in the page worker's storage otherwise.
  29 |       await page.addInitScript(() => {
  30 |         localStorage.removeItem('bookmarx_token');
  31 |         localStorage.removeItem('bookmarx_user');
  32 |       });
  33 |       await page.goto(route);
  34 |       // Pages render a skeleton briefly, then redirect..waitForURL defaults to
  35 |       // 30s which is plenty for the auth-context's microtask + router.push.
> 36 |       await expect(page).toHaveURL(/\/login(\?.*)?$/);
     |                          ^ Error: expect(page).toHaveURL(expected) failed
  37 |     });
  38 |   }
  39 | });
  40 | 
  41 | test.describe('auth gating — tampered token still gates', () => {
  42 |   test('/dashboard with garbage token → /login', async ({ page }) => {
  43 |     await page.addInitScript(() => {
  44 |       localStorage.setItem('bookmarx_token', 'not-a-real-jwt');
  45 |       localStorage.setItem('bookmarx_user', JSON.stringify({ id: 'x', email: 'fake@x.test', isPremium: false }));
  46 |     });
  47 |     await page.goto('/dashboard');
  48 |     // The fetch to /auth/me returns 401 (asserted by L1); auth-context
  49 |     // catches that and clears the token, then redirects. So expect redirect
  50 |     // to /login even though we seeded a token.
  51 |     await expect(page).toHaveURL(/\/login(\?.*)?$/);
  52 |   });
  53 | });
```