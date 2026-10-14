// tests/website/landing.spec.ts
//
// L2 — Landing page (/) is the only fully-public route that doesn't need
// auth or DB interaction. Asserts render contract the user actually sees
// on first visit.
import { test, expect } from './_fixtures';

test.describe('Landing page (/)', () => {
  test('loads without console errors and renders hero, pricing, FAQ', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\//);

    // Hero CTA — the practical definition of "page loaded". `.first()` goes on
    // the LOCATOR (not the expect result); the previous wrong placement made
    // expect(...).first is not a function.
    await expect(page.getByRole('link', { name: /Get Started|Start Free/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Sign In/i }).first()).toBeVisible();

    // Pricing section is config-driven from /api/v1/config. Asserting the
    // "MOST POPULAR" text confirms the API call succeeded and rendered.
    await expect(page.locator('#pricing')).toBeVisible();
    // The pricing table renders three cards; one is "Most Popular".
    await expect(page.getByText(/MOST POPULAR/i)).toBeVisible();

    // FAQ is the last big section; if it rendered, hydration finished.
    await expect(page.locator('#faq')).toBeVisible();
  });

  test('Get Started navigates to /register', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Get Started|Start Free/i }).first().click();
    await expect(page).toHaveURL(/\/register/);
  });

  test('Sign In navigates to /login', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Sign In/i }).first().click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('theme toggle persists across navigation (bookmarx-theme key)', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Cookie settings', exact: true }).click();
    await page.getByLabel('Remember my light/dark theme between visits').check();
    await page.getByRole('button', { name: 'Save choices', exact: true }).click();
    const header = page.locator('header').first();
    const themeButton = header.getByRole('button', { name: /☀|🌙|dark|light|toggle/i }).first();
    await expect(themeButton).toBeVisible();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('bookmarx-theme'))).not.toBeNull();
    const before = await page.evaluate(() => localStorage.getItem('bookmarx-theme'));
    await themeButton.click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('bookmarx-theme'))).toBe(before === 'dark' ? 'light' : 'dark');
    const chosen = await page.evaluate(() => localStorage.getItem('bookmarx-theme'));
    await page.reload();
    await expect.poll(() => page.locator('html').evaluate(el => el.classList.contains('dark'))).toBe(chosen === 'dark');
    expect(await page.evaluate(() => localStorage.getItem('bookmarx-theme'))).toBe(chosen);
  });
});
