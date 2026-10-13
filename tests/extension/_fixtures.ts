import { grantLocalTestPremium } from '../local-entitlements';
// tests/extension/_fixtures.ts
//
// Shared L3 fixtures for the BookMarx extension Playwright suite.
//
// Key contract (per docs/TESTING-REGIME.md §5):
//   - Uses chromium.launchPersistentContext with --load-extension to load
//     the real built extension from src/extension/dist.
//   - Registers a fresh free user per spec file via the API.
//   - Premium tests use qa@bookmarx.cc (needs BOOKMARX_PREMIUM_PASSWORD).
//   - Per-test cleanup via afterAll — deletes collections/browsers created.
//   - Extension must be built before running: cd src/extension; npm run build:chrome

import { test as base, expect, type Page, type BrowserContext } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const BASE_URL = process.env.BOOKMARX_BASE_URL ?? 'http://localhost:3005';
const API = `${BASE_URL}/api/v1`;
const EXTENSION_DIR = path.resolve(__dirname, '../../src/extension/dist');

export const PREMIUM_EMAIL = process.env.BOOKMARX_PREMIUM_EMAIL ?? 'qa@bookmarx.cc';
export const PREMIUM_PASSWORD = process.env.BOOKMARX_PREMIUM_PASSWORD ?? '';

export interface AuthState {
  email: string;
  password: string;
  token: string;
  userId: string;
  isPremium: boolean;
}

// --- HTTP helpers (same pattern as L2 _fixtures.ts) ---

async function postJSON(p: string, body: any, token?: string): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${p}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return res.json();
}

async function del(p: string, token: string): Promise<void> {
  await fetch(`${API}${p}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
}

async function getJSON(p: string, token: string): Promise<any> {
  const res = await fetch(`${API}${p}`, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}

// --- User registration ---

export async function registerFreeUser(): Promise<AuthState> {
  const pid = process.pid;
  const ts = Date.now();
  const email = `free-l3-${pid}-${ts}-${Math.floor(Math.random() * 99)}@bookmarx.test`;
  const password = 'Sup3rSecret!123';
  const body = await postJSON('/auth/register', { email, password });
  if (!body?.success) throw new Error(`free user registration failed: ${JSON.stringify(body)}`);
  return {
    email, password,
    token: body.data.token,
    userId: body.data.user.id,
    isPremium: false,
  };
}

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

// --- Cleanup tracking ---

interface CleanupSet {
  collectionIds: string[];
  browserInstanceIds: string[];
}
const trash: CleanupSet = { collectionIds: [], browserInstanceIds: [] };

export function trackCollection(id: string): void { trash.collectionIds.push(id); }
export function trackBrowser(id: string): void { trash.browserInstanceIds.push(id); }

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

// --- Extension context management ---

// We use a module-scoped persistent context so the extension's service worker
// stays alive across tests within the same spec file. Each spec file gets its
// own context via the fixture's beforeAll/afterAll.
let _context: BrowserContext | null = null;
let _extensionId: string | null = null;

async function createExtensionContext(): Promise<{ context: BrowserContext; extensionId: string; userDataDir: string }> {
  if (!fs.existsSync(path.join(EXTENSION_DIR, 'manifest.json'))) {
    throw new Error(
      `Extension not built. Run: cd src/extension; npm run build:chrome\n` +
      `Expected manifest at: ${path.join(EXTENSION_DIR, 'manifest.json')}`
    );
  }

  const { chromium } = await import('@playwright/test');

  // Launch persistent context with the extension loaded. This requires
  // headless: false (Chrome limitation). Each test gets its own fresh temp
  // user-data-dir. A shared fixed dir let one test's Chrome still hold the
  // profile when the next test launched, so the new browser attached to the
  // old one and the service worker never showed up (install/pending/popup timeouts).
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bookmarx-l3-profile-'));

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_DIR}`,
      `--load-extension=${EXTENSION_DIR}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  // Find the extension ID by checking service worker
  let extensionId: string | null = null;

  // Method: check for service worker registration
  if (context.serviceWorkers && context.serviceWorkers().length > 0) {
    const sw = context.serviceWorkers()[0];
    extensionId = sw.url().split('/')[2];
  }

  if (!extensionId) {
    // Wait for service worker to register
    await context.waitForEvent('serviceworker', { timeout: 15000 });
    const sw = context.serviceWorkers()[0];
    if (sw) {
      extensionId = sw.url().split('/')[2];
    }
  }

  if (!extensionId) {
    throw new Error('Could not determine extension ID — service worker not found');
  }

  return { context, extensionId, userDataDir };
}

export function getExtensionId(): string {
  if (!_extensionId) throw new Error('Extension ID not set — call setupExtensionContext first');
  return _extensionId;
}

export async function getExtensionPage(page: Page, pagePath: string): Promise<Page> {
  const extId = getExtensionId();
  const url = `chrome-extension://${extId}/${pagePath}`;
  // Open the extension page in a new tab
  const newPage = await page.context().newPage();
  await newPage.goto(url);
  return newPage;
}

export async function openPopup(page: Page): Promise<Page> {
  return getExtensionPage(page, 'popup/index.html');
}

export async function getBackgroundWorker(): Promise<any> {
  if (!_context) throw new Error('No extension context');
  const workers = _context.serviceWorkers();
  if (workers.length === 0) {
    await _context.waitForEvent('serviceworker', { timeout: 10000 });
  }
  return _context.serviceWorkers()[0];
}

// Send a message to the background service worker via CDP.
// This simulates what the popup does with chrome.runtime.sendMessage.
export async function sendBackgroundMessage(message: any): Promise<any> {
  const worker = await getBackgroundWorker();
  // Use Runtime.evaluate to call chrome.runtime.sendMessage from the SW context
  // Actually, we need to evaluate IN the service worker context.
  // Playwright's worker.evaluate runs in the worker global scope.
  const result = await (worker as any).evaluate(async (msg: any) => {
    return new Promise((resolve) => {
      // @ts-ignore — chrome is available in the SW context
      chrome.runtime.sendMessage(msg, (response: any) => {
        // @ts-ignore
        const err = chrome.runtime.lastError;
        if (err) {
          resolve({ __error: err.message });
          return;
        }
        resolve(response);
      });
    });
  }, message);
  return result;
}

// Evaluate an expression in the service worker context
export async function evalInBackground(fn: any, arg?: any): Promise<any> {
  const worker = await getBackgroundWorker();
  return (worker as any).evaluate(fn, arg);
}

// Seed auth directly into chrome.storage.local from the service worker context.
// This avoids needing to drive the popup's login form for tests that just need
// an authenticated extension state.
export async function seedAuthInExtension(auth: AuthState): Promise<void> {
  const authData = {
    token: auth.token,
    user: {
      id: auth.userId,
      email: auth.email,
      displayName: null,
      isPremium: auth.isPremium,
      subscriptionTier: auth.isPremium ? 'premium' : 'free',
    },
  };
  await sendFromTestPage({ action: 'setAuth', data: authData });
}

// Clear all extension storage (useful between tests)
export async function clearExtensionStorage(): Promise<void> {
  await sendFromTestPage({ action: 'clearStorage' });
}

async function sendFromTestPage(message: any): Promise<any> {
  if (!_context || !_extensionId) throw new Error('Extension context is unavailable');
  const page = await _context.newPage();
  try {
    await page.goto(`chrome-extension://${_extensionId}/popup/debug.html`);
    const result: any = await page.evaluate(msg => new Promise(resolve => {
      // @ts-ignore
      chrome.runtime.sendMessage(msg, (response: any) => resolve(response));
    }), message);
    if (!result?.success) throw new Error(`Test message failed: ${JSON.stringify(result)}`);
    return result;
  } finally { await page.close(); }
}

// Get all extension storage
export async function getExtensionStorage(): Promise<any> {
  return evalInBackground(async () => {
    // @ts-ignore
    return new Promise((resolve) => {
      // @ts-ignore
      chrome.storage.local.get(null, (items: any) => resolve(items));
    });
  });
}

// Create a bookmark via chrome.bookmarks API in the service worker context.
// This simulates what happens when a user uses the native star button.
export async function createBookmarkViaApi(parentId: string, title: string, url: string): Promise<string> {
  const result = await (await getBackgroundWorker() as any).evaluate(async (params: any) => {
    // @ts-ignore
    return new Promise((resolve) => {
      // @ts-ignore
      chrome.bookmarks.create({ parentId: params.parentId, title: params.title, url: params.url }, (bm: any) => {
        // @ts-ignore
        const err = chrome.runtime.lastError;
        if (err) { resolve({ __error: err.message }); return; }
        resolve({ id: bm.id });
      });
    });
  }, { parentId, title, url });
  return result?.id ?? '';
}

// --- Fixture export ---

export interface ExtensionFixtures {
  context: BrowserContext;
  extensionId: string;
  page: Page;
  freeAccount: AuthState;
  premiumAccount: AuthState | null;
}

export const test = base.extend<ExtensionFixtures>({
  context: async ({}, use) => {
    const { context, extensionId, userDataDir } = await createExtensionContext();
    _context = context;
    _extensionId = extensionId;
    await use(context);
    // Close this test's browser, then remove its profile so nothing leaks into the next test
    await context.close();
    _context = null;
    _extensionId = null;
    fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3 });
  },
  extensionId: async ({ context }, use) => {
    await use(_extensionId!);
  },
  page: async ({ context }, use) => {
    // Create a new page within the extension context
    const page = await context.newPage();
    await use(page);
    // Don't close — context cleanup handles it
  },
  freeAccount: async ({}, use) => {
    const auth = await registerFreeUser();
    await use(auth);
    await cleanup(auth);
  },
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
    if (!PREMIUM_PASSWORD) {
      const seed = await postJSON('/capture', { title: 'Premium fixture bookmark', url: 'https://example.test/premium-fixture' }, auth.token);
      if (!seed.success) throw new Error('Premium fixture bookmark could not be created');
    }
    await use(auth);
    await cleanup(auth);
  },
});

export { expect };
export { BASE_URL };
export function apiBase(): string { return API; }
