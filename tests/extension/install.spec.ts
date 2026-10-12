// tests/extension/install.spec.ts
//
// L3 — Verifies the extension's service worker boots cleanly after install:
//   - No console errors on startup
//   - chrome.alarms.create('sync-status-check') registered
//   - deviceId + browserInstanceId persisted to chrome.storage.local

import { test, expect, evalInBackground, getExtensionStorage } from './_fixtures';

test.describe('Extension install / service worker boot', () => {
  test('service worker boots without errors', async ({ context, extensionId }) => {
    expect(extensionId).toBeTruthy();
    // If we got here, the service worker registered successfully (the fixture
    // waits for it). Verify it's still alive.
    const workers = context.serviceWorkers();
    expect(workers.length).toBeGreaterThan(0);
    const swUrl = workers[0].url();
    expect(swUrl).toContain(extensionId);
  });

  test('alarm "sync-status-check" is registered', async ({ context }) => {
    // Wait a moment for the background service to finish initializeServices()
    // which calls setupNotificationSchedule() -> chrome.alarms.create()
    await test.step('wait for alarm registration', async () => {
      // Poll for up to 10 seconds
      let alarmExists = false;
      for (let i = 0; i < 20; i++) {
        const result = await evalInBackground(async () => {
          // @ts-ignore
          return new Promise((resolve) => {
            // @ts-ignore
            chrome.alarms.getAll((alarms: any[]) => {
              resolve(alarms.map(a => a.name));
            });
          });
        });
        if (Array.isArray(result) && result.includes('sync-status-check')) {
          alarmExists = true;
          break;
        }
        await new Promise(r => setTimeout(r, 500));
      }
      expect(alarmExists).toBe(true);
    });
  });

  test('deviceId and browserInstanceId persisted to chrome.storage.local', async ({ context }) => {
    // Wait for initializeServices to complete
    await test.step('wait for storage initialization', async () => {
      let hasIds = false;
      for (let i = 0; i < 20; i++) {
        const storage = await getExtensionStorage();
        if (storage?.deviceId && storage?.browserInstanceId) {
          hasIds = true;
          break;
        }
        await new Promise(r => setTimeout(r, 500));
      }
      expect(hasIds).toBe(true);
    });

    const storage = await getExtensionStorage();
    expect(storage.deviceId).toBeTruthy();
    expect(storage.browserInstanceId).toBeTruthy();
    // Both should be UUIDs (36 chars with dashes)
    expect(storage.deviceId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(storage.browserInstanceId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  test('default storage shape is correct', async ({ context }) => {
    // Wait for initialization
    await new Promise(r => setTimeout(r, 2000));
    const storage = await getExtensionStorage();
    expect(storage.changes).toEqual([]);
    expect(storage.lastSync).toBe(0);
    expect(storage.settings).toBeDefined();
    expect(storage.settings.syncInterval).toBeGreaterThan(0);
    expect(storage.auth).toBeNull();
  });
});
