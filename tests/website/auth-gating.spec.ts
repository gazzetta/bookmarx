// tests/website/auth-gating.spec.ts
//
// L2 — Every protected route on the website must bounce to /login when no
// auth token is in localStorage. src/website/lib/auth-context.tsx:27-28
// reads `bookmarx_token`, and each protected page has a useEffect that
// calls router.push('/login') when `!user` (e.g. dashboard:19-20).
//
// This is the "embarrassing regression catch" — if someone moves the gating
// to a HOC or middleware and misses one page, this test goes red.
import { test, expect } from './_fixtures';

const PROTECTED_ROUTES = [
  '/dashboard',
  '/collections',
  '/collections/default',
  '/collections/default/edit',
  '/sessions',
  '/install',
  '/settings',
  '/settings/subscription',
  '/settings/browsers',
];

test.describe('auth gating — unauthenticated users bounce to /login', () => {
  for (const route of PROTECTED_ROUTES) {
    test(`GET ${route} → /login`, async ({ page }) => {
      // Defensive: ensure NO bookmarx_token in localStorage. A previous test
      // could have left one in the page worker's storage otherwise.
      await page.addInitScript(() => {
        localStorage.removeItem('bookmarx_token');
        localStorage.removeItem('bookmarx_user');
      });
      await page.goto(route);
      // Pages render a skeleton briefly, then redirect..waitForURL defaults to
      // 30s which is plenty for the auth-context's microtask + router.push.
      await expect(page).toHaveURL(/\/login(\?.*)?$/);
    });
  }
});

test.describe('auth gating — tampered token still gates', () => {
  test('/dashboard with garbage token → /login', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('bookmarx_token', 'not-a-real-jwt');
      localStorage.setItem('bookmarx_user', JSON.stringify({ id: 'x', email: 'fake@x.test', isPremium: false }));
    });
    await page.goto('/dashboard');
    // The fetch to /auth/me returns 401 (asserted by L1); auth-context
    // catches that and clears the token, then redirects. So expect redirect
    // to /login even though we seeded a token.
    await expect(page).toHaveURL(/\/login(\?.*)?$/);
  });
});