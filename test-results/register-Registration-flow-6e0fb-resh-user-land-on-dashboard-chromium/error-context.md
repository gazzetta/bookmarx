# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: register.spec.ts >> Registration flow >> happy path: register fresh user, land on /dashboard
- Location: tests\website\register.spec.ts:31:7

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /\/(dashboard|settings\/subscription)/
Received string:  "http://localhost:3005/verify-email?delivery=failed"
Timeout: 5000ms

Call log:
  - Expect "toHaveURL" with timeout 5000ms
    4 × unexpected value "http://localhost:3005/register"
    10 × unexpected value "http://localhost:3005/verify-email?delivery=failed"

```

```yaml
- alert
- main:
  - link "BookMarx":
    - /url: /
  - region "Verify your email address":
    - heading "Verify your email address" [level=2]
    - paragraph:
      - text: Your account is saved. Confirm
      - strong: ui-57612-1791975949581@bookmarx.test
      - text: before using bookmarks, imports, exports or browser sync.
    - paragraph: Open the confirmation email and follow its link. Check your junk folder if it has not arrived.
    - alert: The signup email could not be sent. Your account remains saved; request another confirmation email below.
    - button "Resend confirmation email"
    - button "I have verified my email"
```

# Test source

```ts
  1  | // tests/website/register.spec.ts
  2  | //
  3  | // L2 — Registration flow through the real UI. Uses the `freeAccount`
  4  | // fixture which registers via /api/v1/auth/register, but this spec drives
  5  | // the form-filling through the rendered page instead of the API direct,
  6  | // so it verifies the form wiring, validation messages, and post-success
  7  | // redirect to /dashboard.
  8  | //
  9  | // NOTE: websites don't have a "register new account" link in the testing
  10 | // flow necessarily — this spec hits /register directly via URL.
  11 | import { test, expect, type AuthState } from './_fixtures';
  12 | 
  13 | // Helpers: register through UI, then return the auth for inspection.
  14 | async function registerViaUi(page: import('@playwright/test').Page, email: string, password: string): Promise<void> {
  15 |   await page.goto('/register');
  16 |   await page.getByLabel(/email/i).fill(email);
  17 |   await page.getByLabel(/^password/i).first().fill(password);
  18 |   // Confirm-password field per register\page.tsx:34.
  19 |   await page.getByLabel(/confirm.*password/i).fill(password);
  20 |   // Two elements match the loose /create|register|sign up/i pattern: the
  21 |   // "Sign up with Google" div (role=button, from Google Identity Services)
  22 |   // and the actual <input type="submit"> labelled "Create Account". We need
  23 |   // the latter — use exact name to disambiguate.
  24 |   await page.getByRole('button', { name: 'Create Account', exact: true }).click();
  25 |   // auth-context.tsx:55-56 sets bookmarx_token + bookmarx_user then page.tsx
  26 |   // redirects to /dashboard (or /settings/subscription if ?plan=premium).
> 27 |   await expect(page).toHaveURL(/\/(dashboard|settings\/subscription)/);
     |                      ^ Error: expect(page).toHaveURL(expected) failed
  28 | }
  29 | 
  30 | test.describe('Registration flow', () => {
  31 |   test('happy path: register fresh user, land on /dashboard', async ({ page, freeAccount }) => {
  32 |     // Use the email/password from `freeAccount` — that's already a real account
  33 |     // in the dev DB. Driving the UI register would 409 (already registered),
  34 |     // so we just verify the *post-register* state: login, click "logout", then
  35 |     // verify the dashboard-equivalent state. This is a sanity check that the
  36 |     // freeAccount fixture produces a working user.
  37 | 
  38 |     // Alternatively, register a SECOND fresh user through the UI:
  39 |     const email = `ui-${process.pid}-${Date.now()}@bookmarx.test`;
  40 |     const password = 'Sup3rSecret!123';
  41 |     await registerViaUi(page, email, password);
  42 |     // The fact we landed on /dashboard is the assertion.
  43 |     // Bookmarx_token must now be in localStorage.
  44 |     const token = await page.evaluate(() => localStorage.getItem('bookmarx_token'));
  45 |     expect(token).toBeTruthy();
  46 |     expect(token!.split('.').length).toBe(3); // JWT shape
  47 |   });
  48 | 
  49 |   test('password too short shows inline validation', async ({ page }) => {
  50 |     await page.goto('/register');
  51 |     await page.getByLabel(/email/i).fill(`short-pw-${Date.now()}@bookmarx.test`);
  52 |     await page.getByLabel(/^password/i).first().fill('short');
  53 |     await page.getByLabel(/confirm.*password/i).fill('short');
  54 |     await page.getByRole('button', { name: 'Create Account', exact: true }).click();
  55 | 
  56 |     // Error text per register\page.tsx:34 — at least 8 chars per server
  57 |     // (auth.ts:404 checks `password.length < 8`).
  58 |     await expect(page.getByText(/password.*8|at least 8/i).first()).toBeVisible();
  59 |     await expect(page).toHaveURL(/\/register/); // didn't navigate
  60 |   });
  61 | 
  62 |   test('password mismatch shows inline validation', async ({ page }) => {
  63 |     await page.goto('/register');
  64 |     await page.getByLabel(/email/i).fill(`mismatch-${Date.now()}@bookmarx.test`);
  65 |     await page.getByLabel(/^password/i).first().fill('Sup3rSecret!123');
  66 |     await page.getByLabel(/confirm.*password/i).fill('Different!@#XYZ');
  67 |     await page.getByRole('button', { name: 'Create Account', exact: true }).click();
  68 | 
  69 |     await expect(page.getByText(/password.*match|passwords.*match|do not match/i).first()).toBeVisible();
  70 |     await expect(page).toHaveURL(/\/register/);
  71 |   });
  72 | 
  73 |   test('duplicate email shows "already registered"', async ({ page, freeAccount }) => {
  74 |     // freeAccount already registered this email via the API. Use it.
  75 |     await page.goto('/register');
  76 |     await page.getByLabel(/email/i).fill(freeAccount.email);
  77 |     await page.getByLabel(/^password/i).first().fill('Sup3rSecret!123');
  78 |     await page.getByLabel(/confirm.*password/i).fill('Sup3rSecret!123');
  79 |     await page.getByRole('button', { name: 'Create Account', exact: true }).click();
  80 | 
  81 |     // Server returns 409 (auth.ts:117), the page renders server's error.message
  82 |     // which is "Email is already registered".
  83 |     await expect(page.getByText(/already registered|already.*account/i).first()).toBeVisible({ timeout: 10000 });
  84 |     await expect(page).toHaveURL(/\/register/);
  85 |   });
  86 | });
```