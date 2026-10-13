// tests/extension/_peers.ts
//
// Multi-peer helpers for cross-browser sync tests.
//
// A "peer" is one browser profile with the built extension loaded. Each peer
// gets its own temp user-data-dir, so storage, deviceId and browserInstanceId
// are fully isolated — the server sees each peer as a separate browser.
//
// Engines: bundled Chromium and Edge (msedge) accept --load-extension.
// Google Chrome (channel 'chrome') does NOT — Chrome 137+ branded builds ignore
// the flag (verified by probe, 2026-10-13). Firefox is out of scope here.

import { chromium, type BrowserContext, type Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { apiBase, cleanup, trackBrowser, type AuthState } from './_fixtures';

declare const chrome: any;

const EXTENSION_DIR = path.resolve(__dirname, '../../src/extension/dist');

export type Engine = 'chromium' | 'msedge';

export interface Peer {
  label: string;
  engine: Engine;
  context: BrowserContext;
  extId: string;
  profileDir: string;
  close(): Promise<void>;
}

const ENGINE_OPTS: Record<Engine, Record<string, unknown>> = {
  chromium: {},
  msedge: { channel: 'msedge' },
};

// 'opera' keeps the bundled Chromium binary but presents an Opera UA (OPR/ token).
// detectBrowser() (background/utils/browserDetect.ts) sniffs the UA, so the server
// sees a distinct browser fingerprint. Use only where the fingerprint matters
// (free-cap tests); real Opera is still needed for true root-folder fidelity.
export type Spoof = 'opera';

const SPOOF_UA: Record<Spoof, string> = {
  opera: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 OPR/120.0.0.0',
};

export async function launchPeer(label: string, engine: Engine = 'chromium', spoof?: Spoof): Promise<Peer> {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), `bookmarx-peer-${label}-`));
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    ...ENGINE_OPTS[engine],
    args: [
      `--disable-extensions-except=${EXTENSION_DIR}`,
      `--load-extension=${EXTENSION_DIR}`,
      '--no-first-run',
      '--no-default-browser-check',
      ...(spoof ? [`--user-agent=${SPOOF_UA[spoof]}`] : []),
    ],
  } as any);

  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 20000 }));
  const extId = new URL(sw.url()).host;

  return {
    label,
    engine,
    context,
    extId,
    profileDir,
    async close() {
      await context.close();
      fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 3 });
    },
  };
}

async function serviceWorker(peer: Peer) {
  return peer.context.serviceWorkers()[0] ?? (await peer.context.waitForEvent('serviceworker', { timeout: 10000 }));
}

// Run a function inside the peer's background service worker.
export async function inBackground<T = any>(peer: Peer, fn: (...args: any[]) => any, arg?: any): Promise<T> {
  const sw = await serviceWorker(peer);
  return (sw as any).evaluate(fn, arg) as Promise<T>;
}

// Send a message the way the popup does: from an extension page, via chrome.runtime.sendMessage.
// Opens the popup page as a tab, sends, then closes it.
export async function sendFromPopup<T = any>(peer: Peer, message: Record<string, unknown>): Promise<T> {
  const page: Page = await peer.context.newPage();
  await page.goto(`chrome-extension://${peer.extId}/popup/index.html`);
  const response = await page.evaluate(
    (msg) => new Promise((resolve) => chrome.runtime.sendMessage(msg, (r: any) => resolve(r))),
    message,
  );
  await page.close();
  return response as T;
}

export async function seedAuth(peer: Peer, auth: AuthState): Promise<void> {
  const data = {
    token: auth.token,
    user: {
      id: auth.userId,
      email: auth.email,
      displayName: null,
      isPremium: auth.isPremium,
      subscriptionTier: auth.isPremium ? 'premium' : 'free',
    },
  };
  await inBackground(peer, (d: any) => new Promise<void>((resolve) => {
    chrome.storage.local.get(null, (current: any) => {
      chrome.storage.local.set({ ...current, auth: d, userId: d.user.id }, () => resolve());
    });
  }), data);
}

export async function getStorage(peer: Peer): Promise<any> {
  return inBackground(peer, () => new Promise((resolve) => {
    chrome.storage.local.get(null, (items: any) => resolve(items));
  }));
}

// Local bookmark events are queued asynchronously in the service worker. Helpers wait for the change
// to reach the queue, so a sync started right after can't run before it is queued.
async function queueLength(peer: Peer): Promise<number> {
  return ((await getStorage(peer)).changes ?? []).length;
}

async function waitForQueued(peer: Peer, lengthBefore: number): Promise<void> {
  await waitFor(() => queueLength(peer), (n) => n > lengthBefore, 5000);
}

export async function createBookmark(peer: Peer, parentId: string, title: string, url: string): Promise<string> {
  const before = await queueLength(peer);
  const id = await inBackground<string>(peer, (p: any) => new Promise((resolve, reject) => {
    chrome.bookmarks.create({ parentId: p.parentId, title: p.title, url: p.url }, (bm: any) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(bm.id);
    });
  }), { parentId, title, url });
  await waitForQueued(peer, before);
  return id;
}

export interface LocalBookmark { id: string; parentId: string; title: string; url: string }

export async function findLocalByUrl(peer: Peer, url: string): Promise<LocalBookmark[]> {
  return inBackground<LocalBookmark[]>(peer, (u: string) => new Promise((resolve) => {
    chrome.bookmarks.search({ url: u }, (results: any[]) => resolve(results.map((r) => ({
      id: r.id, parentId: r.parentId, title: r.title, url: r.url,
    }))));
  }), url);
}

export async function removeLocalByUrl(peer: Peer, url: string): Promise<void> {
  const before = await queueLength(peer);
  await inBackground(peer, (u: string) => new Promise<void>((resolve) => {
    chrome.bookmarks.search({ url: u }, (results: any[]) => {
      let pending = results.length;
      if (pending === 0) return resolve();
      for (const r of results) chrome.bookmarks.remove(r.id, () => { if (--pending === 0) resolve(); });
    });
  }), url);
  await waitForQueued(peer, before);
}

// Server truth: what the master collection currently holds for this account.
export async function serverUrls(auth: AuthState, deviceId: string): Promise<string[]> {
  const res = await fetch(`${apiBase()}/sync/master-collection`, {
    headers: {
      Authorization: `Bearer ${auth.token}`,
      'X-User-ID': auth.userId,
      'X-Device-ID': deviceId,
    },
  });
  const body: any = await res.json();
  if (!body?.success) throw new Error(`master-collection read failed: ${JSON.stringify(body)}`);
  return (body.data?.bookmarks ?? []).map((b: any) => b.url);
}

// Teardown: record the peer's server-side browser row for cleanup, close the peer,
// then delete the tracked rows for the account. Safe to call with nulls.
export async function retirePeer(peer: Peer | null, account: AuthState | null): Promise<void> {
  if (peer) {
    const st = await getStorage(peer).catch(() => null);
    if (st?.browserInstanceId) trackBrowser(st.browserInstanceId);
    await peer.close().catch(() => {});
  }
  await cleanup(account);
}

// Poll until a predicate holds (sync is async on the extension side).
export async function waitFor<T>(
  read: () => Promise<T>,
  ok: (v: T) => boolean,
  timeoutMs = 20000,
): Promise<T> {
  const start = Date.now();
  let last = await read();
  while (!ok(last) && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 500));
    last = await read();
  }
  return last;
}

// Folders have no URL. Matched by exact title, so tests should use a unique title.
export async function createFolder(peer: Peer, parentId: string, title: string): Promise<string> {
  const before = await queueLength(peer);
  const id = await inBackground<string>(peer, (p: any) => new Promise((resolve, reject) => {
    chrome.bookmarks.create({ parentId: p.parentId, title: p.title }, (node: any) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(node.id);
    });
  }), { parentId, title });
  await waitForQueued(peer, before);
  return id;
}

export async function findLocalFolders(peer: Peer, title: string): Promise<LocalBookmark[]> {
  return inBackground<LocalBookmark[]>(peer, (t: string) => new Promise((resolve) => {
    chrome.bookmarks.search({ title: t }, (results: any[]) => resolve(
      results.filter((r) => !r.url).map((r) => ({ id: r.id, parentId: r.parentId, title: r.title, url: '' })),
    ));
  }), title);
}

export async function removeLocalFolderByTitle(peer: Peer, title: string): Promise<void> {
  const before = await queueLength(peer);
  await inBackground(peer, (t: string) => new Promise<void>((resolve) => {
    chrome.bookmarks.search({ title: t }, (results: any[]) => {
      const folders = results.filter((r) => !r.url);
      let pending = folders.length;
      if (pending === 0) return resolve();
      for (const f of folders) chrome.bookmarks.removeTree(f.id, () => { if (--pending === 0) resolve(); });
    });
  }), title);
  await waitForQueued(peer, before);
}
