// Actual installed Firefox, isolated extension/profile, real API. Never uses a personal profile.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn, execFileSync } = require('node:child_process');

const base = process.env.BOOKMARX_BASE_URL || 'http://localhost:3005';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('This probe requires a local test server');
const firefox = process.env.BOOKMARX_FIREFOX_EXE || 'C:/Program Files/Mozilla Firefox/firefox.exe';

async function probe(auth, base, resultUrl) {
  const progress = stage => fetch(`${resultUrl}/${encodeURIComponent(stage)}`).catch(() => {});
  await progress('probe loaded');
  const call = (fn, ...args) => new Promise((resolve, reject) => fn(...args, result => {
    const error = chrome.runtime.lastError; error ? reject(new Error(error.message)) : resolve(result);
  }));
  const message = msg => call(chrome.runtime.sendMessage, msg);
  const result = { browser: 'Firefox', userAgent: navigator.userAgent, passed: false };
  const check = (condition, description) => { if (!condition) throw new Error(description); };
  const waitForQueued = async minimum => {
    for (let i = 0; i < 100; i++) {
      const state = await call(chrome.storage.local.get, null);
      if ((state.changes || []).length >= minimum) return state;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('A native Firefox bookmark edit did not enter the durable queue');
  };
  try {
    await progress('saving auth');
    check((await message({ action: 'setAuth', data: auth })).success, 'Sign-in state was not saved');
    await progress('creating native bookmarks');
    const tree = await call(chrome.bookmarks.getTree);
    const roots = tree[0].children;
    result.roots = roots.map(node => ({ id: node.id, title: node.title }));
    const bar = roots.find(node => node.id === 'toolbar_____');
    check(bar, 'Firefox toolbar root was not found');
    const folder = await call(chrome.bookmarks.create, { parentId: bar.id, title: 'Firefox ü parent' });
    const nested = await call(chrome.bookmarks.create, { parentId: folder.id, title: 'Nested' });
    const url = `https://example.test/firefox/${auth.user.id}/Case?A=B`;
    const local = await call(chrome.bookmarks.create, { parentId: nested.id, title: 'First duplicate', url });
    await call(chrome.bookmarks.create, { parentId: nested.id, title: 'Second duplicate', url });
    await waitForQueued(4);
    await progress('initial upload');
    const up = await message({ action: 'syncNow' });
    check(up.success, `Initial Firefox upload failed: ${JSON.stringify(up)}`);
    const state = await call(chrome.storage.local.get, null);
    const headers = { Authorization: `Bearer ${auth.token}`, 'X-Device-ID': state.deviceId,
      'X-Browser-Instance-ID': state.browserInstanceId, 'X-Sync-Version': '2' };
    const master = await (await fetch(`${base}/api/v1/sync/master-collection`, { headers })).json();
    check(master.success, 'Master collection could not be read');
    const duplicates = master.data.bookmarks.filter(node => node.url === url);
    check(duplicates.length === 2, 'Firefox duplicate URLs were collapsed');
    const first = duplicates.find(node => node.title === 'First duplicate');
    const other = master.data.folders.find(node => node.rootKind === 'other');
    check(other, 'Canonical Other bookmarks role is missing');
    await call(chrome.bookmarks.update, local.id, { title: 'Native Firefox rename' });
    await waitForQueued(1);
    check((await message({ action: 'syncNow' })).success, 'Firefox callback-based rename upload failed');
    // Website rename and move must be delivered to the browser that originally created this item.
    const edit = await (await fetch(`${base}/api/v1/collections/default/changes`, { method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ changes: [
        { type: 'rename', itemType: 'bookmark', itemId: first.masterId, newTitle: 'Website renamed Firefox item' },
        { type: 'move', itemType: 'bookmark', itemId: first.masterId, newParentId: other.masterId, position: 0 },
      ] }) })).json();
    // The web editor is premium, so exercise the same cross-browser mutation via sync API instead.
    if (!edit.success) {
      // A remote mutation must have a different browser identity. Using the
      // receiving Firefox instance here correctly suppresses its own echo.
      const remoteDeviceId = state.deviceId;
      const remoteInstanceId = crypto.randomUUID();
      const modified = await (await fetch(`${base}/api/v1/sync`, { method: 'POST',
        headers: { ...headers, 'X-Device-ID': remoteDeviceId, 'X-Browser-Instance-ID': remoteInstanceId, 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId: remoteDeviceId,
          metadata: { deviceInfo: { browserInstanceId: remoteInstanceId, deviceId: remoteDeviceId, browser: 'chrome',
            browserVersion: 'probe', os: 'Windows', osVersion: '10' }, userAgent: 'BookMarx Firefox QA remote peer', timestamp: Date.now() },
          changes: [{ operationId: 'firefox-remote-rename', type: 'UPDATE', data: { type: 'bookmark', masterId: first.masterId,
            title: 'Website renamed Firefox item', masterParentId: other.masterId, parentId: 'unfiled_____', index: 0 } }] }) })).json();
      check(modified.success, `Remote Firefox edit failed: ${JSON.stringify(modified)}`);
    }
    const down = await message({ action: 'syncDown' });
    check(down.success, `Firefox pull failed: ${JSON.stringify(down)}`);
    const [updated] = await call(chrome.bookmarks.get, local.id);
    check(updated.title === 'Website renamed Firefox item' && updated.parentId === 'unfiled_____', 'Firefox remote rename/move did not preserve identity and root role');
    await call(chrome.bookmarks.removeTree, folder.id);
    await waitForQueued(1);
    check((await message({ action: 'syncNow' })).success, 'Firefox folder delete upload failed');
    const final = await (await fetch(`${base}/api/v1/sync/master-collection`, { headers })).json();
    check(final.data.bookmarks.filter(node => node.url === url).length === 1, 'Recursive Firefox deletion removed the survivor or retained its deleted sibling');
    result.passed = true;
    result.checks = ['initial upload', 'nested folders', 'duplicate URLs', 'native rename queue', 'remote rename/move', 'recursive delete'];
  } catch (error) { result.error = error.message; }
  await fetch(resultUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) });
}

(async () => {
  const registration = await (await fetch(`${base}/api/v1/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `firefox-probe-${crypto.randomUUID()}@bookmarx.test`, password: 'Firefox-test123!' }) })).json();
  if (!registration.success) throw new Error('Firefox probe account could not be registered');
  if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname) ||
      !/^firefox-probe-.+@bookmarx\.test$/.test(registration.data.user.email)) throw new Error('Firefox fixtures require a synthetic localhost account');
  const VerificationDatabase = require('../../src/website/node_modules/better-sqlite3');
  const verificationDatabase = new VerificationDatabase(process.env.BOOKMARX_TEST_SERVER_DATABASE || path.resolve('src/website/data/bookmarx.db'));
  try {
    const stored = verificationDatabase.prepare('SELECT email FROM users WHERE id = ?').get(registration.data.user.id);
    if (stored?.email !== registration.data.user.email) throw new Error('Firefox fixture account was not found in the local DB');
    verificationDatabase.prepare("UPDATE users SET emailVerifiedAt = strftime('%s','now') WHERE id = ? AND email = ?")
      .run(registration.data.user.id, registration.data.user.email);
    verificationDatabase.prepare('DELETE FROM email_verification_tokens WHERE userId = ?').run(registration.data.user.id);
  } finally { verificationDatabase.close(); }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bookmarx-firefox-probe-'));
  const extension = path.join(directory, 'extension');
  const profile = path.join(directory, 'profile');
  fs.mkdirSync(profile); fs.cpSync(path.resolve('src/extension/dist-firefox'), extension, { recursive: true });
  const manifestPath = path.join(extension, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.background.scripts.push('qa-boot.js');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  const server = http.createServer((req, res) => {
    if (req.method === 'GET') lastStage = decodeURIComponent(req.url.slice(1));
    let content = ''; req.on('data', chunk => { content += chunk; });
    req.on('end', () => { res.setHeader('Access-Control-Allow-Origin', '*'); res.end('ok'); if (req.method === 'POST') resolveResult(JSON.parse(content)); });
  });
  let resolveResult;
  let lastStage = 'waiting for probe page';
  const completed = new Promise(resolve => { resolveResult = resolve; });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const resultUrl = `http://127.0.0.1:${server.address().port}`;
  fs.writeFileSync(path.join(extension, 'qa-boot.js'), "chrome.runtime.onInstalled.addListener(() => chrome.tabs.create({url:chrome.runtime.getURL('qa-probe.html')}));");
  fs.writeFileSync(path.join(extension, 'qa-probe.html'), '<!doctype html><html><body><script src="qa-probe.js"></script></body></html>');
  fs.writeFileSync(path.join(extension, 'qa-probe.js'), `(${probe.toString()})(${JSON.stringify(registration.data)},${JSON.stringify(base)},${JSON.stringify(resultUrl)});`);
  const child = spawn('cmd.exe', ['/c', 'npx', 'web-ext', 'run', '--source-dir', extension, '--firefox', firefox, '--firefox-profile', profile,
    '--keep-profile-changes', '--no-reload', '--no-input', '--no-config-discovery', '--args=-headless'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  const timer = setTimeout(() => resolveResult({ browser: 'Firefox', passed: false, error: 'Firefox probe timed out after 90 seconds', lastStage, launcher: output.slice(-2500) }), 90000);
  const result = await completed;
  clearTimeout(timer); server.close();
  try { execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch {}
  // Keep the disposable profile when diagnostics are needed; a failed probe cannot delete personal data.
  fs.writeFileSync('docs/firefox-runtime-results.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  if (!result.passed) process.exitCode = 1;
})().catch(error => { console.error(error.message); process.exitCode = 1; });
