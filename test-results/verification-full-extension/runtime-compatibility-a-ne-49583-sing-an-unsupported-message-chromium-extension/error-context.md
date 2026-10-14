# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: runtime-compatibility.spec.ts >> a new popup with an older background requests a reload before using an unsupported message
- Location: tests\extension\runtime-compatibility.spec.ts:3:5

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('#errorContainer')
Expected substring: "Reload the extension"
Received string:    ""
Timeout: 10000ms

Call log:
  - Expect "toContainText" with timeout 10000ms
  - waiting for locator('#errorContainer')
    23 × locator resolved to <div id="errorContainer" class="toast-container hidden"></div>
       - unexpected value ""

```

```yaml
- img
- link "BookMarx":
  - /url: https://www.bookmarx.cc/
- button "☀️"
- text: F free-l3-116680-1791976723015-52@bookmarx.test Free
- button "Sign out"
- button "Collection Master Collection ▼"
- text: Unlock more collections & browsers
- button "Upgrade"
- text: Welcome to BookMarx Your collection is empty. Run an initial sync to upload your browser bookmarks. Sync Status Never synced Local Browser Bookmarks 0 Folders 2 Remote Collection Bookmarks 0 Folders 0 ↑ 0 to push ↓ 0 to pull
- button "⬆ Run Initial Sync"
- button "Overwrite Local"
- button "View Collection"
- text: Bookmarks 0 / 250 Browsers 0 / 2 Collections 1 / 1
- button "Debug Tools ▾"
```

# Test source

```ts
  1  | import { test, expect, seedAuthInExtension } from './_fixtures';
  2  | 
  3  | test('a new popup with an older background requests a reload before using an unsupported message', async ({ page, extensionId, freeAccount }) => {
  4  |     await seedAuthInExtension(freeAccount);
  5  |     await page.addInitScript(() => {
  6  |         const original = chrome.runtime.sendMessage.bind(chrome.runtime);
  7  |         (window as any).__baselineRequests = 0;
  8  |         (chrome.runtime as any).sendMessage = (message: any, callback: (response: any) => void) => {
  9  |             if (message.action === 'getAuthState') {
  10 |                 original(message, (response: any) => {
  11 |                     const legacy = { ...response };
  12 |                     delete legacy.capabilities;
  13 |                     callback(legacy);
  14 |                 });
  15 |                 return;
  16 |             }
  17 |             if (message.action === 'baselineEmptyCollection') (window as any).__baselineRequests++;
  18 |             return original(message, callback);
  19 |         };
  20 |     });
  21 |     const onboardingErrors: string[] = [];
  22 |     page.on('console', message => {
  23 |         if (message.text().includes('Onboarding check error')) onboardingErrors.push(message.text());
  24 |     });
  25 |     await page.goto(`chrome-extension://${extensionId}/popup/index.html`);
> 26 |     await expect(page.locator('#errorContainer')).toContainText('Reload the extension', { timeout: 10000 });
     |                                                   ^ Error: expect(locator).toContainText(expected) failed
  27 |     expect(await page.evaluate(() => (window as any).__baselineRequests)).toBe(0);
  28 |     expect(onboardingErrors).toEqual([]);
  29 | });
  30 | 
  31 | test('unknown background messages receive an explicit response instead of closing the port', async ({ page, extensionId }) => {
  32 |     await page.goto(`chrome-extension://${extensionId}/popup/index.html`);
  33 |     const result = await page.evaluate(() => new Promise<any>(resolve => {
  34 |         chrome.runtime.sendMessage({ action: 'not-a-supported-bookmarx-action' }, response => {
  35 |             resolve({ response, transportError: chrome.runtime.lastError?.message || null });
  36 |         });
  37 |     }));
  38 |     expect(result.transportError).toBeNull();
  39 |     expect(result.response).toMatchObject({ success: false, error: { code: 'UNSUPPORTED_MESSAGE' } });
  40 | });
  41 | 
```