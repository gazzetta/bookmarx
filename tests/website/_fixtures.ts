import { grantLocalTestPremium, verifyLocalTestEmail } from '../local-entitlements';
// tests/website/_fixtures.ts
//
// Shared L2 fixtures for the BookMarx website Playwright suite.
//
// Important contract (per docs/TESTING-REGIME.md):
//   - We run against the REAL dev DB (`src/website/data/bookmarx.db`).
//   - The user's 435-bookmark master collection stays sacred — premium-path
//     tests that need a scratch collection MUST create one via
//     POST /api/v1/collections and delete it in `afterAll`.
//   - Free-path tests register a UNIQUE free user per spec file and clean up
//     any collections / browsers / bookmarks that user created.
//   - Cleanup works through this module's `cleanup()` function — every spec
//     file calls `await fixtures.cleanup()` in `afterAll`, and we also register
//     the ids-to-clean in a global array so even a test that crashed mid-run
//     gets tidied on the next run.
//
// Usage pattern (in a spec):
//   import { test, expect, type AccountCtx } from './_fixtures';
//
//   test.describe('premium dashboard', () => {
//     test('shows no upgrade banner', async ({ page, premiumAccount }) => {
//       await page.goto('/dashboard');
//       await expect(page.locator('text=Upgrade')).not.toBeVisible();
//     });
//   });

import { test as base, expect, type Page, type APIResponse } from '@playwright/test';

const BASE_URL = process.env.BOOKMARX_BASE_URL ?? 'http://localhost:3005';
const API = `${BASE_URL}/api/v1`;

// Permanently-premium account per `backend/api/auth.ts:39`.
export const PREMIUM_EMAIL = process.env.BOOKMARX_PREMIUM_EMAIL ?? 'qa@bookmarx.cc';
export const PREMIUM_PASSWORD = process.env.BOOKMARX_PREMIUM_PASSWORD ?? '';

export interface AuthState {
  email: string;
  password: string;
  token: string;
  userId: string;
  isPremium: boolean;
}

// Registered IDs/rows to garbage-collect after the test file runs. Tracked
// regardless of pass/fail so crash mid-run still cleans up next time.
interface CleanupSet {
  collectionIds: string[];
  browserInstanceIds: string[];
  // Users are intentionally NOT cleanup-tracked — there's no DELETE /users
  // endpoint. Free users accumulate in the DB harmlessly; their collection/
  // browser/bookmark pollution is what we care about (and clean up here).
}
const trash: CleanupSet = { collectionIds: [], browserInstanceIds: [] };

// Direct internal HTTP client so tests don't have to drive fetch via Playwright's
// APIResponseCtx. We use Playwright's `request.newContext()` so tracing captures it.
async function postJSON(path: string, body: any, token?: string): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return res.json();
}

async function del(path: string, token: string): Promise<void> {
  await fetch(`${API}${path}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
}

// Seed localStorage so the next page.goto skips /login.
// Key names taken directly from src/website/lib/auth-context.tsx:
//   - localStorage['bookmarx_token'] = JWT (string, not JSON)
//   - localStorage['bookmarx_user']  = JSON.stringify(userObject)
// `auth-context.tsx:27-28` reads both in its initial useEffect.
async function seedAuthInContext(page: Page, auth: AuthState): Promise<void> {
  await page.addInitScript((auth: AuthState) => {
    localStorage.setItem('bookmarx_token', auth.token);
    localStorage.setItem('bookmarx_user', JSON.stringify({
      id: auth.userId,
      email: auth.email,
      subscriptionTier: auth.isPremium ? 'premium' : 'free',
      isPremium: auth.isPremium,
      // Include the optional premium detail fields the dashboard page reads
      // (dashboard\page.tsx uses user.isPremium + user.subscriptionExpiresAt).
      // Missing fields are fine — the page calls /auth/me on mount anyway.
      subscriptionExpiresAt: null,
    }));
  }, auth);
}

// Register a throwaway free user; track them for follow-up logins intra-test.
export async function registerFreeUser(): Promise<AuthState> {
  const pid = process.pid;
  const ts = Date.now();
  const email = `free-l2-${pid}-${ts}-${Math.floor(Math.random() * 99)}@bookmarx.test`;
  const password = 'Sup3rSecret!123';
  const body = await postJSON('/auth/register', { email, password });
  if (!body?.success) throw new Error(`free user registration failed: ${JSON.stringify(body)}`);
  verifyLocalTestEmail(BASE_URL, body.data.user.id, email);
  return {
    email, password,
    token: body.data.token,
    userId: body.data.user.id,
    isPremium: false,
  };
}

// Login a known user. Used for `qa@bookmarx.cc` (premium paths).
export async function loginUser(email: string, password: string): Promise<AuthState> {
  const body = await postJSON('/auth/login', { email, password });
  if (!body?.success) throw new Error(`login failed for ${email}: ${JSON.stringify(body)}`);
  return {
    email, password,
    token: body.data.token,
    userId: body.data.user.id,
    isPremium: body.data.user.isPremium ?? body.data.user.subscriptionTier === 'premium',
  };
}

// Cleanup helper. Idempotent — safe to call multiple times. Run in `afterAll`
// of every spec file that touched the DB.
export async function cleanup(auth: AuthState | null): Promise<void> {
  if (!auth) return;
  for (const id of trash.collectionIds) {
    try { await del(`/collections/${id}`, auth.token); } catch {}
  }
  for (const id of trash.browserInstanceIds) {
    try { await del(`/user/browsers/${id}`, auth.token); } catch {}
  }
  trash.collectionIds.length = 0;
  trash.browserInstanceIds.length = 0;
}

export function trackCollection(id: string): void { trash.collectionIds.push(id); }
export function trackBrowser(id: string): void { trash.browserInstanceIds.push(id); }

// ---------------------------------------------------------------------------
// Playwright fixture extension: per-test `page` already exists; we add the
// auth-layer fixtures used by the website tests.
// ---------------------------------------------------------------------------
export const test = base.extend<
  // Per-test options the spec can request via `test.use({ premiumAccount: { ... } })`
  // or just by declaring `{ freeAccount }` in the test signature.
  {
    freeAccount: AuthState;
    premiumAccount: AuthState | null;
  }
>({
  // Ordinary account/bookmark suites model a visitor who rejected optional
  // storage. cookie-consent.spec.ts uses fresh contexts to exercise the banner.
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem('bookmarx-consent')) localStorage.setItem('bookmarx-consent', JSON.stringify({
        version: 1, savedAt: Date.now(), analytics: false, preferences: false
      }));
    });
    await use(page);
  },
  // Lazy-registered free user per spec file (per `beforeAll` semantics once).
  // Note: Playwright binds `test.use` workers + beforeAll per-work, not per-test,
  // so the fixture itself is created the first time it's requested in each file.
  // We register once via a module-scoped memo rather than per-test.
  freeAccount: async ({}, use) => {
    const auth = await registerFreeUser();
    await use(auth);
    await cleanup(auth);
  },
  // Premium account needs a known password from env. If unset, the test that
  // requests it will SKIP (not fail) — this lets us ship the harness even
  // before the human has typed the password into `wsh setvar --workspace`.
  premiumAccount: async ({}, use) => {
    let auth: AuthState;
    if (PREMIUM_PASSWORD) auth = await loginUser(PREMIUM_EMAIL, PREMIUM_PASSWORD);
    else if (['localhost', '127.0.0.1'].includes(new URL(BASE_URL).hostname)) {
      const local = await registerFreeUser();
      grantLocalTestPremium(BASE_URL, local.userId, local.email);
      auth = await loginUser(local.email, local.password);
    } else {
      test.skip(true, 'Remote premium tests require explicit test-account credentials');
      return;
    }
    await use(auth);
    await cleanup(auth);
  },
});

export { expect };

// ---------------------------------------------------------------------------
// Small helpers re-exported for convenience in spec files.
// ---------------------------------------------------------------------------
export async function loginAs(page: Page, auth: AuthState): Promise<void> {
  await seedAuthInContext(page, auth);
}

export function apiBase(): string { return API; }
export { BASE_URL };
