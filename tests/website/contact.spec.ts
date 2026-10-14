import { test, expect } from './_fixtures';

test('contact form preserves a failed message, then confirms only successful delivery', async ({ page }) => {
  let success = false;
  const requests: any[] = [];
  await page.route('**/api/v1/contact', async route => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ status: success ? 200 : 503, json: success ? { success: true } : { success: false, error: { message: 'Delivery unavailable. Please try again.' } } });
  });
  await page.goto('/contact');
  await page.getByLabel('Your email address').fill('customer@example.test');
  await page.getByLabel('Topic', { exact: true }).selectOption('Privacy request');
  const message = 'Please provide my account information.';
  await page.getByLabel('Message', { exact: true }).fill(message);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Delivery unavailable');
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue(message);
  success = true;
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('delivered to our support inbox');
  expect(requests).toHaveLength(2);
  expect(requests[1]).toMatchObject({ email: 'customer@example.test', topic: 'Privacy request', message });
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
});
