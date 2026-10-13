// tests/api/edge-cases.test.ts
//
// L5 — Edge-case tests that are automatable via L1 (supertest + ephemeral SQLite).
// Covers:
//   - Unicode / special characters in bookmark titles and URLs
//   - Large bookmark tree (200+ items) round-trip
//   - Expired / malformed JWT variants
//   - Concurrent UPDATE to the same bookmark from 2 devices
//   - Empty / whitespace-only title handling
//   - Very long URL handling
//
// Per TESTING-REGIME.md §7, these are the automatable L5 items. API-down
// behaviour remains manual-only.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import {
  app, baseUrl, bearer, registerUser,
  deviceInfo, syncMetadata, makeBookmark, makeFolder,
  uniqueDeviceId, dbReady, type DeviceMeta,
} from '../helpers';

beforeAll(async () => { await dbReady; });

let chrome = deviceInfo({ browser: 'Chrome', browserInstanceId: 'binst-edge-chrome' });
let firefox = deviceInfo({ browser: 'Firefox', browserInstanceId: 'binst-edge-firefox' });

beforeEach(() => { chrome = deviceInfo({ browser: 'Chrome' }); firefox = deviceInfo({ browser: 'Firefox' }); });

async function initialSync(
  token: string,
  device: DeviceMeta,
  payload: { bookmarks?: ReturnType<typeof makeBookmark>[]; folders?: ReturnType<typeof makeFolder>[] } = {}
) {
  const res = await request(app)
    .post(`${baseUrl}/sync/initial`)
    .set('Authorization', bearer(token))
    .set('x-device-id', device.deviceId)
    .send({
      bookmarks: payload.bookmarks ?? [],
      folders: payload.folders ?? [],
      deviceId: device.deviceId,
      metadata: syncMetadata(device),
    });
  if (res.status !== 200) throw new Error(`initialSync ${res.status}: ${res.text}`);
  return res.body.data;
}

async function deltaSync(
  token: string,
  device: DeviceMeta,
  changes: Array<{ type: 'CREATE' | 'UPDATE' | 'DELETE' | 'MOVE'; data: any }>
) {
  const res = await request(app)
    .post(`${baseUrl}/sync`)
    .set('Authorization', bearer(token))
    .set('x-device-id', device.deviceId)
    .send({
      changes: changes.map((c) => ({
        type: c.type,
        data: c.data,
        metadata: syncMetadata(device),
        timestamp: Date.now(),
      })),
      deviceId: device.deviceId,
      metadata: syncMetadata(device),
    });
  if (res.status !== 200) throw new Error(`deltaSync ${res.status}: ${res.text}`);
  return res.body.data;
}

async function masterCollection(token: string, device: DeviceMeta) {
  const res = await request(app)
    .get(`${baseUrl}/sync/master-collection`)
    .set('Authorization', bearer(token))
    .set('x-device-id', device.deviceId)
    .set('x-browser-instance-id', device.browserInstanceId);
  if (res.status !== 200) throw new Error(`masterCollection ${res.status}: ${res.text}`);
  return res.body.data;
}

// ---------------------------------------------------------------------------
// 1. Unicode / special characters
// ---------------------------------------------------------------------------

describe('Edge: unicode & special characters in bookmarks', () => {
  it('round-trips bookmarks with unicode titles through initial sync', async () => {
    const u = await registerUser();
    const unicodeBookmarks = [
      makeBookmark({ id: 'bm-unicode-1', title: 'café 日本語 🎉', url: 'https://example.com/café-日本語' }),
      makeBookmark({ id: 'bm-unicode-2', title: '<script>alert("xss")</script>', url: 'https://example.com/xss-test' }),
      makeBookmark({ id: 'bm-unicode-3', title: `Quote's "Double" & Ampersand`, url: 'https://example.com/quotes?a=1&b=2' }),
      makeBookmark({ id: 'bm-unicode-4', title: 'Tab\tNewline\nTitle', url: 'https://example.com/whitespace' }),
    ];

    await initialSync(u.token, chrome, { bookmarks: unicodeBookmarks });
    const mc = await masterCollection(u.token, chrome);
    const titles = mc.bookmarks.map((b: any) => b.title);
    const urls = mc.bookmarks.map((b: any) => b.url);

    expect(titles).toContain('café 日本語 🎉');
    expect(titles).toContain('<script>alert("xss")</script>');
    expect(titles).toContain(`Quote's "Double" & Ampersand`);
    expect(urls).toContain('https://example.com/café-日本語');
    expect(urls).toContain('https://example.com/quotes?a=1&b=2');
  });

  it('round-trips bookmarks with unicode titles through delta sync (CREATE + UPDATE)', async () => {
    const u = await registerUser();
    await initialSync(u.token, chrome);

    // CREATE with unicode
    const bm = makeBookmark({ id: 'bm-edge-create', title: '中文标题', url: 'https://example.com/中文' });
    await deltaSync(u.token, chrome, [{
      type: 'CREATE',
      data: { ...bm, type: 'bookmark' },
    }]);

    let mc = await masterCollection(u.token, chrome);
    let created = mc.bookmarks.find((b: any) => b.url === 'https://example.com/中文');
    expect(created).toBeDefined();
    expect(created.title).toBe('中文标题');

    // UPDATE with different unicode
    await deltaSync(u.token, chrome, [{
      type: 'UPDATE',
      data: {
        type: 'bookmark',
        masterId: created.masterId,
        title: 'Обновлённый заголовок 🚀',
        url: 'https://example.com/обновлённый',
      },
    }]);

    mc = await masterCollection(u.token, chrome);
    const updated = mc.bookmarks.find((b: any) => b.masterId === created.masterId);
    expect(updated.title).toBe('Обновлённый заголовок 🚀');
    expect(updated.url).toBe('https://example.com/обновлённый');
  });

  it('handles folder names with special characters', async () => {
    const u = await registerUser();
    const folders = [
      makeFolder({ id: 'fld-special-1', title: 'Dev / Test <folder>' }),
      makeFolder({ id: 'fld-special-2', title: 'Emoji 📁 Folder' }),
      makeFolder({ id: 'fld-special-3', title: 'Ampersand & Co.' }),
    ];

    await initialSync(u.token, chrome, { folders });
    const mc = await masterCollection(u.token, chrome);
    const folderTitles = mc.folders.map((f: any) => f.title);

    expect(folderTitles).toContain('Dev / Test <folder>');
    expect(folderTitles).toContain('Emoji 📁 Folder');
    expect(folderTitles).toContain('Ampersand & Co.');
  });
});

// ---------------------------------------------------------------------------
// 2. Large bookmark tree
// ---------------------------------------------------------------------------

describe('Edge: large bookmark tree (200+ items)', () => {
  it('initial-synces 200 bookmarks and round-trips all via master-collection', async () => {
    const u = await registerUser();
    const COUNT = 200;
    const bookmarks = Array.from({ length: COUNT }, (_, i) =>
      makeBookmark({
        id: `bm-large-${i}`,
        title: `Bookmark ${i}`,
        url: `https://example.com/large/${i}`,
      })
    );

    await initialSync(u.token, chrome, { bookmarks });
    const mc = await masterCollection(u.token, chrome);
    expect(mc.bookmarks.length).toBe(COUNT);

    // Verify a sample of URLs
    const urls = new Set(mc.bookmarks.map((b: any) => b.url));
    expect(urls.has('https://example.com/large/0')).toBe(true);
    expect(urls.has('https://example.com/large/99')).toBe(true);
    expect(urls.has('https://example.com/large/199')).toBe(true);
  });

  it('delta-synces 50 additional bookmarks on top of existing 100', async () => {
    const u = await registerUser();
    const initial = Array.from({ length: 100 }, (_, i) =>
      makeBookmark({ id: `bm-base-${i}`, url: `https://example.com/base/${i}`, title: `Base ${i}` })
    );
    await initialSync(u.token, chrome, { bookmarks: initial });

    const additional = Array.from({ length: 50 }, (_, i) =>
      makeBookmark({ id: `bm-add-${i}`, url: `https://example.com/add/${i}`, title: `Add ${i}` })
    );
    await deltaSync(u.token, chrome, additional.map((bm) => ({
      type: 'CREATE',
      data: { ...bm, type: 'bookmark' },
    })));

    const mc = await masterCollection(u.token, chrome);
    expect(mc.bookmarks.length).toBe(150);
  });
});

// ---------------------------------------------------------------------------
// 3. Expired / malformed JWT variants
// ---------------------------------------------------------------------------

describe('Edge: JWT rejection variants', () => {
  it('rejects a token with wrong structure (not 3 parts)', async () => {
    const res = await request(app)
      .get(`${baseUrl}/auth/me`)
      .set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
  });

  it('rejects an empty bearer token', async () => {
    const res = await request(app)
      .get(`${baseUrl}/auth/me`)
      .set('Authorization', 'Bearer ');
    expect(res.status).toBe(401);
  });

  it('rejects a token with valid structure but invalid signature', async () => {
    // Real JWT format (3 base64 segments) but signed with a different secret
    const fakeJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJmYWtlIiwiZW1haWwiOiJmYWtlQHRlc3QifQ.invalid-signature-123456';
    const res = await request(app)
      .get(`${baseUrl}/auth/me`)
      .set('Authorization', `Bearer ${fakeJwt}`);
    expect(res.status).toBe(401);
  });

  it('rejects sync endpoints with expired-style token (tampered payload)', async () => {
    const res = await request(app)
      .post(`${baseUrl}/sync/initial`)
      .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjF9.fake')
      .send({ bookmarks: [], folders: [], deviceId: 'test', metadata: {} });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// 4. Concurrent UPDATE to same bookmark from 2 devices
// ---------------------------------------------------------------------------

describe('Edge: concurrent UPDATE from 2 devices on same bookmark', () => {
  it('both updates land without data loss or 500 errors', async () => {
    const u = await registerUser();
    const alice = deviceInfo({ browserInstanceId: 'binst-conc-a', browser: 'Chrome', os: 'Windows', osVersion: '11' });
    const bob = deviceInfo({ browserInstanceId: 'binst-conc-b', browser: 'Firefox', os: 'macOS', osVersion: '14' });

    // Alice seeds a bookmark
    const bm = makeBookmark({ id: 'bm-concurrent', title: 'Original', url: 'https://concurrent.test/orig' });
    await initialSync(u.token, alice, { bookmarks: [bm] });

    // Bob pulls to discover the masterId
    const bobPull = await masterCollection(u.token, bob);
    const target = bobPull.bookmarks.find((b: any) => b.url === bm.url);
    expect(target).toBeDefined();

    // Both devices UPDATE the same bookmark — Alice first, then Bob.
    // The server should handle both without error (last-write-wins).
    await deltaSync(u.token, alice, [{
      type: 'UPDATE',
      data: {
        type: 'bookmark',
        masterId: target.masterId,
        title: 'Alice Updated',
        url: 'https://concurrent.test/alice',
      },
    }]);

    await deltaSync(u.token, bob, [{
      type: 'UPDATE',
      data: {
        type: 'bookmark',
        masterId: target.masterId,
        title: 'Bob Updated',
        url: 'https://concurrent.test/bob',
      },
    }]);

    // Final state: Bob's write should win (last write)
    const mc = await masterCollection(u.token, alice);
    const final = mc.bookmarks.find((b: any) => b.masterId === target.masterId);
    expect(final).toBeDefined();
    expect(final.title).toBe('Bob Updated');
    expect(final.url).toBe('https://concurrent.test/bob');
  });
});

// ---------------------------------------------------------------------------
// 5. Empty / whitespace title & very long URL
// ---------------------------------------------------------------------------

describe('Edge: empty titles and long URLs', () => {
  it('accepts a bookmark with empty string title', async () => {
    const u = await registerUser();
    const bm = makeBookmark({ id: 'bm-empty-title', title: '', url: 'https://example.com/empty-title' });
    await initialSync(u.token, chrome, { bookmarks: [bm] });

    const mc = await masterCollection(u.token, chrome);
    const found = mc.bookmarks.find((b: any) => b.url === 'https://example.com/empty-title');
    expect(found).toBeDefined();
    // Server may fallback to URL or keep empty — just assert it doesn't crash
    expect(found.title).toBeTypeOf('string');
  });

  it('accepts a bookmark with a very long URL (1000+ chars)', async () => {
    const u = await registerUser();
    const longUrl = 'https://example.com/' + 'a'.repeat(1000);
    const bm = makeBookmark({ id: 'bm-long-url', title: 'Long URL Test', url: longUrl });
    await initialSync(u.token, chrome, { bookmarks: [bm] });

    const mc = await masterCollection(u.token, chrome);
    const found = mc.bookmarks.find((b: any) => b.url === longUrl);
    expect(found).toBeDefined();
    expect(found.url).toBe(longUrl);
  });

  it('accepts a bookmark with a very long title (500+ chars)', async () => {
    const u = await registerUser();
    const longTitle = 'A'.repeat(500);
    const bm = makeBookmark({ id: 'bm-long-title', title: longTitle, url: 'https://example.com/long-title' });
    await initialSync(u.token, chrome, { bookmarks: [bm] });

    const mc = await masterCollection(u.token, chrome);
    const found = mc.bookmarks.find((b: any) => b.url === 'https://example.com/long-title');
    expect(found).toBeDefined();
    expect(found.title).toBe(longTitle);
  });
});
