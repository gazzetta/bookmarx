// tests/api/sync.test.ts
//
// Covers the highest-risk code paths in the backend: the masterId-based sync
// engine (Phase 2 refactor), initial import, delta sync (CREATE/UPDATE/
// DELETE), master-collection read-back, cross-user isolation, and the premium
// browser-limit gate. This is the test that de-risks PROGRESS.md:78
// ("Test backward compatibility with existing extension") — the regression
// we're guarding against is stale-default-collection + stale-masterParentId
// behaviour, which is exactly what the sync round-trip below exercises.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import {
  app, baseUrl, bearer, registerUser,
  deviceInfo, syncMetadata, makeBookmark, makeFolder,
  uniqueDeviceId, dbReady,
} from '../helpers';

// See DatabaseService.readyPromise and tests/helpers.ts — must wait for the
// async file-migrations before any request hits a table they touch.
beforeAll(async () => { await dbReady; });

// Two distinct devices per test so the same user can sync from multiple
// browsers — the realistic case for a cross-browser product.
let chrome = deviceInfo({ browser: 'Chrome', browserInstanceId: 'binst-chrome-sync' });
let firefox = deviceInfo({ browser: 'Firefox', browserInstanceId: 'binst-firefox-sync' });

beforeEach(() => { chrome = deviceInfo({ browser: 'Chrome' }); firefox = deviceInfo({ browser: 'Firefox' }); });

async function initialSync(
  token: string,
  device = chrome,
  payload: { bookmarks?: ReturnType<typeof makeBookmark>[]; folders?: ReturnType<typeof makeFolder>[]; deviceId?: string } = {}
) {
  return request(app)
    .post(`${baseUrl}/sync/initial`)
    .set('Authorization', bearer(token))
    .set('x-device-id', payload.deviceId ?? device.deviceId)
    .send({
      bookmarks: payload.bookmarks ?? [],
      folders: payload.folders ?? [],
      deviceId: payload.deviceId ?? device.deviceId,
      metadata: syncMetadata(device),
    });
}

async function masterCollection(
  token: string,
  device = chrome,
  headers: Record<string, string> = {}
) {
  return request(app)
    .get(`${baseUrl}/sync/master-collection`)
    .set('Authorization', bearer(token))
    .set('x-device-id', device.deviceId)
    .set('x-browser-instance-id', device.browserInstanceId)
    .set(headers);
}

describe('Sync: initial import', () => {
  it('imports folders + bookmarks and echoes a sessionId + eventId', async () => {
    const u = await registerUser();
    const folderA = makeFolder({ title: 'Dev', id: 'fld-dev-1' });
    const bm1 = makeBookmark({ title: 'MDN', url: 'https://developer.mozilla.org', id: 'bm-mdn' });
    const bm2 = makeBookmark({ title: 'GitHub', url: 'https://github.com', id: 'bm-gh' });

    const res = await initialSync(u.token, chrome, {
      folders: [folderA],
      bookmarks: [bm1, bm2],
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.action).toBe('INITIAL_IMPORT_COMPLETE');
    expect(res.body.data.sessionId).toBeTypeOf('string');
    // createCollectionEvent (database.ts:1288) mints a UUID string, not an
    // auto-increment number; pin the actual returned shape.
    expect(res.body.data.eventId).toBeTypeOf('string');
    expect(res.body.data.imported.folders).toBe(1);
    expect(res.body.data.imported.bookmarks).toBe(2);
  });

  it('succeeds with an empty payload (clearing/dry-import)', async () => {
    const u = await registerUser();
    const res = await initialSync(u.token);
    expect(res.status).toBe(200);
    expect(res.body.data.imported.bookmarks).toBe(0);
  });

  it('requires authentication (401)', async () => {
    const res = await initialSync('not-a-token');
    expect(res.status).toBe(401);
  });
});

describe('Sync: master-collection read-back', () => {
  it('round-trips initial sync items back through master-collection', async () => {
    const u = await registerUser();
    const bm = makeBookmark({ title: 'Hacker News', url: 'https://news.ycombinator.com', id: 'bm-hn' });
    await initialSync(u.token, chrome, { bookmarks: [bm] });

    const res = await masterCollection(u.token);
    expect(res.status).toBe(200);
    expect(res.body.data.bookmarks).toHaveLength(1);
    expect(res.body.data.bookmarks[0].url).toBe(bm.url);
    expect(res.body.data.bookmarks[0].masterId).toBeTypeOf('string');
  });

  it('requires x-device-id header (400)', async () => {
    const u = await registerUser();
    const res = await request(app)
      .get(`${baseUrl}/sync/master-collection`)
      .set('Authorization', bearer(u.token));
    expect(res.status).toBe(400);
  });
});

describe('Sync: status + delta sync', () => {
  it('requires initial sync for a brand-new account despite seeded root folders', async () => {
    // Native root placeholders do not mean a browser snapshot was imported.
    const u = await registerUser();
    const res = await request(app)
      .get(`${baseUrl}/sync/status`)
      .set('Authorization', bearer(u.token))
      .set('x-browser-instance-id', chrome.browserInstanceId);
    expect(res.status).toBe(200);
    expect(res.body.data.needsInitialSync).toBe(true);
    // pendingChanges has the documented shape. We don't pin specific numbers
    // because the auto-seeded root folders show up as `addsFolders` for a
    // browser instance that has never synced — the exact count depends on
    // join_collection seeding which we don't own in this test.
    expect(Object.keys(res.body.data.pendingChanges).sort()).toEqual(
      ['adds', 'addsFolders', 'deletes', 'deletesFolders', 'moves', 'updates', 'updatesFolders']
    );
  });

  it('CREATE via /sync round-trips through master-collection', async () => {
    const u = await registerUser();
    const seedBookmark = makeBookmark({ id: 'bm-seed', title: 'Seed', url: 'https://seed.example.test/a' });
    await initialSync(u.token, firefox, { bookmarks: [seedBookmark] });

    const created = makeBookmark({ id: 'bm-new', title: 'New', url: 'https://new.example.com/path' });
    const syncRes = await request(app)
      .post(`${baseUrl}/sync`)
      .set('Authorization', bearer(u.token))
      .set('x-device-id', chrome.deviceId)
      .send({
        changes: [{
          type: 'CREATE',
          data: { ...created, type: 'bookmark' },
          metadata: syncMetadata(chrome),
          timestamp: Date.now(),
        }],
        deviceId: chrome.deviceId,
        metadata: syncMetadata(chrome),
      } as any);
    expect(syncRes.status).toBe(200);
    expect(syncRes.body.data.results).toHaveLength(1);
    expect(syncRes.body.data.results[0].success).toBe(true);
    expect(syncRes.body.data.results[0].masterId).toBeTypeOf('string');

    const mc = await masterCollection(u.token, chrome);
    const urls = mc.body.data.bookmarks.map((b: any) => b.url);
    // Both bookmarks show up; `/sync` produces side-effects visible to
    // master-collection reads — the contract this test exists to pin.
    expect(urls).toContain(created.url);
    expect(urls).toContain(seedBookmark.url);
  });

  it('DELETE via /sync removes the bookmark from master-collection', async () => {
    const u = await registerUser();
    const bm = makeBookmark({ id: 'bm-del', title: 'ToDelete', url: 'https://delete.example.com' });
    await initialSync(u.token, chrome, { bookmarks: [bm] });

    // NOTE: `db.deleteBookmark` (database.ts:2012) without `masterId` falls
    // into a `WHERE browserId = ? AND browserInstanceId = ?` path — so the
    // DELETE change MUST carry metadata.deviceInfo.browserInstanceId pointing
    // at the browser that originally created the bookmark (here: `chrome`).
    // Otherwise zero rows match and the delete silently no-ops. The extension
    // always carries this metadata; the test must too.
    const del = await request(app)
      .post(`${baseUrl}/sync`)
      .set('Authorization', bearer(u.token))
      .set('x-device-id', chrome.deviceId)
      .send({
        changes: [{
          type: 'DELETE',
          data: { browserId: bm.id },
          metadata: syncMetadata(chrome),
          timestamp: Date.now(),
        }],
        deviceId: chrome.deviceId,
        metadata: syncMetadata(chrome),
      } as any);
    expect(del.status).toBe(200);

    const mc = await masterCollection(u.token, chrome);
    // getBookmarksByCollection (database.ts:1764) filters status='active', so
    // a soft-deleted row won't appear here.
    expect(mc.body.data.bookmarks).toHaveLength(0);
  });
});

describe('Sync: cross-user isolation', () => {
  it('user A cannot see user B\'s bookmarks in master-collection', async () => {
    const alice = await registerUser();
    const bob = await registerUser();

    const aliceUrl = 'https://alice.secret.test/path';
    const bobUrl = 'https://bob.public.test/path';
    await initialSync(alice.token, chrome, {
      bookmarks: [makeBookmark({ title: 'Alice Secret', url: aliceUrl, id: 'bm-alice' })],
    });
    await initialSync(bob.token, firefox, {
      bookmarks: [makeBookmark({ title: 'Bob Public', url: bobUrl, id: 'bm-bob' })],
    });

    const bobMc = await masterCollection(bob.token, firefox);
    expect(bobMc.status).toBe(200);
    const bobUrls = bobMc.body.data.bookmarks.map((b: any) => b.url);
    expect(bobUrls.some((u: string) => u.startsWith('https://bob.public.test'))).toBe(true);
    expect(bobUrls.some((u: string) => u.startsWith('https://alice.secret.test'))).toBe(false);

    const aliceMc = await masterCollection(alice.token, chrome);
    const aliceUrls = aliceMc.body.data.bookmarks.map((b: any) => b.url);
    expect(aliceUrls.some((u: string) => u.startsWith('https://alice.secret.test'))).toBe(true);
    expect(aliceUrls.some((u: string) => u.startsWith('https://bob.public.test'))).toBe(false);
  });

  it('user B\'s /user/stats reflects only their own counts', async () => {
    const alice = await registerUser();
    const bob = await registerUser();

    await initialSync(alice.token, chrome, {
      bookmarks: Array.from({ length: 5 }, (_, i) =>
        makeBookmark({ id: `bm-alice-${i}`, title: `A${i}`, url: `https://alice/${i}` })),
    });
    await initialSync(bob.token, firefox, {
      bookmarks: [makeBookmark({ id: 'bm-bob-0', url: 'https://bob/0' })],
    });

    const aliceStats = await request(app)
      .get(`${baseUrl}/user/stats`)
      .set('Authorization', bearer(alice.token));
    expect(aliceStats.body.data.bookmarkCount).toBe(5);

    const bobStats = await request(app)
      .get(`${baseUrl}/user/stats`)
      .set('Authorization', bearer(bob.token));
    expect(bobStats.body.data.bookmarkCount).toBe(1);
  });
});

describe('Sync: premium browser-limit enforcement (free tier)', () => {
  // Free tier limited to 2 *distinct* browser instances (config.limits.free.browsers=2).
  // checkBrowserLimit (premium.ts:124) short-circuits when the same browser-instance is already
  // registered to this user, so we use an unknown instance each attempt AND distinct
  // browser/os fingerprints. Without distinct fingerprints checkBrowserLimit's
  // abuse-prevention branch (premium.ts:176-193) lets the 3rd through by deleting
  // an old same-fingerprint registration — which would mask the 403 we want to assert.
  it('refuses a 3rd distinct browser for a free user (403)', async () => {
    const u = await registerUser();
    const a = deviceInfo({ browserInstanceId: uniqueDeviceId('a'), browser: 'Chrome', os: 'Windows', osVersion: '11' });
    const b = deviceInfo({ browserInstanceId: uniqueDeviceId('b'), browser: 'Firefox', os: 'macOS', osVersion: '14' });
    const c = deviceInfo({ browserInstanceId: uniqueDeviceId('c'), browser: 'Edge', os: 'Linux', osVersion: '22' });

    await initialSync(u.token, a);
    await initialSync(u.token, b);
    const res = await initialSync(u.token, c);
    expect([403, 429]).toContain(res.status);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toMatch(/BROWSER_LIMIT_REACHED|BROWSER_REGISTRATION_RATE_LIMITED/);
  });
});