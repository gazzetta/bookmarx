// tests/website/register.spec.ts
//
// L2 — Registration flow through the real UI. Uses the `freeAccount`
// fixture which registers via /api/v1/auth/register, but this spec drives
// the form-filling through the rendered page instead of the API direct,
// so it verifies the form wiring, validation messages, and post-success
// redirect to /dashboard.
//
// NOTE: websites don't have a "register new account" link in the testing
// flow necessarily — this spec hits /register directly via URL.
import { test, expect, type AuthState } from './_fixtures';

// Helpers: register through UI, then return the auth for inspection.
async function registerViaUi(page: import('@playwright/test').Page, email: string, password: string): Promise<void> {
  await page.goto('/register');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/^password/i).first().fill(password);
  // Confirm-password field per register\page.tsx:34.
  await page.getByLabel(/confirm.*password/i).fill(password);
  // Two elements match the loose /create|register|sign up/i pattern: the
  // "Sign up with Google" div (role=button, from Google Identity Services)
  // and the actual <input type="submit"> labelled "Create Account". We need
  // the latter — use exact name to disambiguate.
  await page.getByRole('button', { name: 'Create Account', exact: true }).click();
  // auth-context.tsx:55-56 sets bookmarx_token + bookmarx_user then page.tsx
  // redirects to /dashboard (or /settings/subscription if ?plan=premium).
  await expect(page).toHaveURL(/\/(dashboard|settings\/subscription)/);
}

test.describe('Registration flow', () => {
  test('happy path: register fresh user, land on /dashboard', async ({ page, freeAccount }) => {
    // Use the email/password from `freeAccount` — that's already a real account
    // in the dev DB. Driving the UI register would 409 (already registered),
    // so we just verify the *post-register* state: login, click "logout", then
    // verify the dashboard-equivalent state. This is a sanity check that the
    // freeAccount fixture produces a working user.

    // Alternatively, register a SECOND fresh user through the UI:
    const email = `ui-${process.pid}-${Date.now()}@bookmarx.test`;
    const password = 'Sup3rSecret!123';
    await registerViaUi(page, email, password);
    // The fact we landed on /dashboard is the assertion.
    // Bookmarx_token must now be in localStorage.
    const token = await page.evaluate(() => localStorage.getItem('bookmarx_token'));
    expect(token).toBeTruthy();
    expect(token!.split('.').length).toBe(3); // JWT shape
  });

  test('password too short shows inline validation', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel(/email/i).fill(`short-pw-${Date.now()}@bookmarx.test`);
    await page.getByLabel(/^password/i).first().fill('short');
    await page.getByLabel(/confirm.*password/i).fill('short');
    await page.getByRole('button', { name: 'Create Account', exact: true }).click();

    // Error text per register\page.tsx:34 — at least 8 chars per server
    // (auth.ts:404 checks `password.length < 8`).
    await expect(page.getByText(/password.*8|at least 8/i).first()).toBeVisible();
    await expect(page).toHaveURL(/\/register/); // didn't navigate
  });

  test('password mismatch shows inline validation', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel(/email/i).fill(`mismatch-${Date.now()}@bookmarx.test`);
    await page.getByLabel(/^password/i).first().fill('Sup3rSecret!123');
    await page.getByLabel(/confirm.*password/i).fill('Different!@#XYZ');
    await page.getByRole('button', { name: 'Create Account', exact: true }).click();

    await expect(page.getByText(/password.*match|passwords.*match|do not match/i).first()).toBeVisible();
    await expect(page).toHaveURL(/\/register/);
  });

  test('duplicate email shows "already registered"', async ({ page, freeAccount }) => {
    // freeAccount already registered this email via the API. Use it.
    await page.goto('/register');
    await page.getByLabel(/email/i).fill(freeAccount.email);
    await page.getByLabel(/^password/i).first().fill('Sup3rSecret!123');
    await page.getByLabel(/confirm.*password/i).fill('Sup3rSecret!123');
    await page.getByRole('button', { name: 'Create Account', exact: true }).click();

    // Server returns 409 (auth.ts:117), the page renders server's error.message
    // which is "Email is already registered".
    await expect(page.getByText(/already registered|already.*account/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/register/);
  });
});