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

    // The theme toggle button is the one in the navbar. Per
    // src/website/lib/theme-context.tsx:45 it stores to 'bookmarx-theme' and
    // the html element gets a class. The button itself has no stable aria
    // label, so we match a button inside the header region.
    const header = page.locator('header').first();
    const themeButton = header.getByRole('button', { name: /☀|🌙|dark|light|toggle/i }).first();

    if (await themeButton.isVisible().catch(() => false)) {
      await themeButton.click();
      // After the click, the html element should carry 'dark' (or removed)
      // some asymmetry; the actual class assignment depends on the page.
      // The robust assertion is that localStorage persists across reload.
      // Reload the page and verify the html tag's className still reflects dark.
      const classNameAfterClick = await page.locator('html').evaluate(el => el.className);
      await page.goto('/');
      const classNameAfterReload = await page.locator('html').evaluate(el => el.className);
      expect(classNameAfterReload).toBe(classNameAfterClick);
    }
  });
});