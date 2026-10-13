// Real executables, disposable profiles. No access to the person's browser profiles.
// Run: node tests/audit/windows-probe.cjs
const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const extension = path.resolve(__dirname, '../../src/extension/dist');
const candidates = [
  ['Chromium', undefined],
  ['Chrome', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'],
  ['Edge', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'],
  ['Opera', 'C:/Program Files (x86)/Opera/136.0.6008.80/opera.exe'],
  ['Brave', process.env.BOOKMARX_BRAVE_EXE || 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe'],
  ['Helium', path.join(os.homedir(), 'AppData/Local/imput/Helium/Application/chrome.exe')],
];
(async () => {
  const results = [];
  for (const [browser, executablePath] of candidates) {
    if (executablePath && !fs.existsSync(executablePath)) { results.push({ browser, unavailable: 'Executable not found at configured path' }); continue; }
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bookmarx-audit-browser-'));
    let context;
    const result = { browser };
    try {
      context = await chromium.launchPersistentContext(profile, { executablePath, headless: false, timeout: 20000,
        args: [`--load-extension=${extension}`, `--disable-extensions-except=${extension}`, '--no-first-run', '--no-default-browser-check'] });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      try {
        const response = await page.goto(process.env.BOOKMARX_BASE_URL || 'http://localhost:3005', { timeout: 15000 });
        await page.getByRole('heading', { name: 'Your bookmarks, everywhere' }).waitFor({ timeout: 5000 });
        result.website = { heroRendered: true, status: response?.status(), pageErrors: errors, userAgent: await page.evaluate(() => navigator.userAgent) };
      } catch (error) {
        result.website = { heroRendered: false, error: error.message, title: await page.title(), url: page.url(), text: (await page.locator('body').innerText()).slice(0, 500), pageErrors: errors };
      }
      const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 8000 }).catch(() => null);
      if (!worker) { result.extension = { loaded: false, reason: 'No service worker after 8 seconds; unpacked command-line loading not verified' }; }
      else {
        result.extension = await worker.evaluate(async () => {
          const call = (fn, ...args) => new Promise((resolve, reject) => fn(...args, r => {
            const e = chrome.runtime.lastError; e ? reject(new Error(e.message)) : resolve(r);
          }));
          const tree = await call(chrome.bookmarks.getTree);
          const roots = tree[0].children.map(n => ({ id: n.id, title: n.title, folderType: n.folderType, unmodifiable: n.unmodifiable }));
          const bar = roots.find(n => n.folderType === 'bookmarks-bar' || n.id === '1') || roots[0];
          const folder = await call(chrome.bookmarks.create, { parentId: bar.id, title: 'Audit disposable folder' });
          const bm = await call(chrome.bookmarks.create, { parentId: folder.id, title: 'Audit disposable bookmark', url: 'https://example.test/audit' });
          await call(chrome.bookmarks.update, bm.id, { title: 'Audit changed' });
          await call(chrome.bookmarks.move, bm.id, { parentId: bar.id });
          await call(chrome.bookmarks.remove, bm.id);
          await call(chrome.bookmarks.removeTree, folder.id);
          return { loaded: true, roots, localCrud: true, notificationApi: !!chrome.notifications, actionApi: !!chrome.action };
        });
      }
    } catch (error) { result.error = error.message; }
    finally {
      if (context) await context.close().catch(() => {});
      const resolved = path.resolve(profile);
      if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith('bookmarx-audit-browser-')) {
        fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
      }
    }
    results.push(result);
    console.log(JSON.stringify(result));
  }
  fs.writeFileSync(path.resolve(__dirname, '../../docs/windows-browser-audit-results.json'), JSON.stringify(results, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
