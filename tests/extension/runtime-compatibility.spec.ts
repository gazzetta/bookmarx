import { test, expect, seedAuthInExtension } from './_fixtures';

test('a new popup with an older background requests a reload before using an unsupported message', async ({ page, extensionId, freeAccount }) => {
    await seedAuthInExtension(freeAccount);
    await page.addInitScript(() => {
        const original = chrome.runtime.sendMessage.bind(chrome.runtime);
        (window as any).__baselineRequests = 0;
        (chrome.runtime as any).sendMessage = (message: any, callback: (response: any) => void) => {
            if (message.action === 'getAuthState') {
                original(message, (response: any) => {
                    const legacy = { ...response };
                    delete legacy.capabilities;
                    callback(legacy);
                });
                return;
            }
            if (message.action === 'baselineEmptyCollection') (window as any).__baselineRequests++;
            return original(message, callback);
        };
    });
    const onboardingErrors: string[] = [];
    page.on('console', message => {
        if (message.text().includes('Onboarding check error')) onboardingErrors.push(message.text());
    });
    await page.goto(`chrome-extension://${extensionId}/popup/index.html`);
    await expect(page.locator('#errorContainer')).toContainText('Reload the extension', { timeout: 10000 });
    expect(await page.evaluate(() => (window as any).__baselineRequests)).toBe(0);
    expect(onboardingErrors).toEqual([]);
});

test('unknown background messages receive an explicit response instead of closing the port', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/index.html`);
    const result = await page.evaluate(() => new Promise<any>(resolve => {
        chrome.runtime.sendMessage({ action: 'not-a-supported-bookmarx-action' }, response => {
            resolve({ response, transportError: chrome.runtime.lastError?.message || null });
        });
    }));
    expect(result.transportError).toBeNull();
    expect(result.response).toMatchObject({ success: false, error: { code: 'UNSUPPORTED_MESSAGE' } });
});
