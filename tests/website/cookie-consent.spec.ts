import { test, expect } from '@playwright/test'

async function configuredAnalytics(page: import('@playwright/test').Page) {
  let loads = 0
  await page.route('**/api/v1/config', async route => {
    const response = await route.fetch()
    const body = await response.json()
    body.data.analytics = { measurementId: 'G-TEST123' }
    await route.fulfill({ json: body })
  })
  // Never send test visits to Google. Test the real consent/script boundary.
  await page.route('https://www.googletagmanager.com/**', async route => {
    loads++
    await route.fulfill({ contentType: 'application/javascript', body: "document.cookie='_ga=test; Path=/; SameSite=Lax';" })
  })
  return () => loads
}

test('nothing loads before consent; rejection persists and does not save a theme', async ({ page }) => {
  const loads = await configuredAnalytics(page)
  const external: string[] = []
  page.on('request', request => { if (/fonts\.(googleapis|gstatic)\.com|google-analytics\.com/.test(request.url())) external.push(request.url()) })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Your privacy choices' })).toBeVisible()
  await expect(page.locator('#bookmarx-google-analytics')).toHaveCount(0)
  expect(loads()).toBe(0)
  await page.getByRole('button', { name: 'Reject optional', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Cookie settings', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Cookie settings', exact: true })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('bookmarx-theme'))).toBeNull()
  expect(loads()).toBe(0)
  expect(external).toEqual([])
})

test('acceptance permits only sanitised public events; withdrawal clears Analytics and preserves necessary storage', async ({ page }) => {
  const loads = await configuredAnalytics(page)
  await page.goto('/?email=private@example.test#secret')
  await expect(page.getByText('use Google Analytics to understand visits to our public pages.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Accept optional', exact: true }).click()
  await expect.poll(loads).toBe(1)
  await expect.poll(async () => (await page.context().cookies()).some(cookie => cookie.name === '_ga')).toBe(true)
  const events = await page.evaluate(() => Array.from((window as any).dataLayer || [], (args: any) => Array.from(args)))
  expect(JSON.stringify(events)).not.toMatch(/private@example|#secret/)
  expect(events).toContainEqual(['consent', 'update', { analytics_storage: 'granted' }])
  const views = events.filter((event: any) => event[0] === 'event' && event[1] === 'page_view')
  expect(views).toHaveLength(1)
  await page.evaluate(() => localStorage.setItem('bookmarx_token', 'essential-storage-marker'))
  await page.getByRole('button', { name: 'Cookie settings', exact: true }).click()
  await page.getByRole('button', { name: 'Reject optional', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Cookie settings', exact: true })).toBeVisible()
  await expect(page.locator('#bookmarx-google-analytics')).toHaveCount(0)
  expect(loads()).toBe(1)
  expect((await page.context().cookies()).some(cookie => cookie.name.startsWith('_ga'))).toBe(false)
  expect(await page.evaluate(() => localStorage.getItem('bookmarx_token'))).toBe('essential-storage-marker')
  expect(await page.evaluate(() => localStorage.getItem('bookmarx-theme'))).toBeNull()
})

test('settings allow preference-only consent and private pages never initialise Analytics', async ({ page }) => {
  const loads = await configuredAnalytics(page)
  await page.goto('/cookies')
  await page.getByRole('button', { name: 'Choose settings' }).click()
  await page.getByLabel('Remember my light/dark theme between visits').check()
  await page.getByRole('button', { name: 'Save choices', exact: true }).click()
  expect(loads()).toBe(0)
  await expect.poll(async () => page.evaluate(() => localStorage.getItem('bookmarx-theme'))).not.toBeNull()
  await page.getByRole('button', { name: 'Cookie settings', exact: true }).click()
  await page.getByLabel('Google Analytics (optional; no advertising)', { exact: true }).check()
  await page.getByRole('button', { name: 'Save choices', exact: true }).click()
  await expect.poll(loads).toBe(1)
  await page.goto('/verify-email')
  await expect(page.getByRole('button', { name: 'Cookie settings', exact: true })).toBeVisible()
  await expect(page.locator('#bookmarx-google-analytics')).toHaveCount(0)
  expect(loads()).toBe(1)
})

test('expired choices require new consent and remove previous Analytics cookies', async ({ page }) => {
  const loads = await configuredAnalytics(page)
  await page.addInitScript(() => {
    localStorage.setItem('bookmarx-consent', JSON.stringify({ version: 1, savedAt: Date.now() - 181 * 86400000, analytics: true, preferences: true }))
    document.cookie = '_ga=expired; Path=/'
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Your privacy choices' })).toBeVisible()
  expect(loads()).toBe(0)
  expect((await page.context().cookies()).some(cookie => cookie.name === '_ga')).toBe(false)
})
