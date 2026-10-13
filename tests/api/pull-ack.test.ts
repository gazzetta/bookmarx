// tests/api/pull-ack.test.ts
//
// Pull watermark and apply semantics. Each test uses a fresh user, so tests don't share state.
//
//  - An acknowledged pull (X-Sync-Ack: 1) moves the watermark only when the client acks it.
//  - A browser's own push never moves its pull watermark. Changes other browsers pushed earlier
//    must still be delivered.
//  - Reading the master collection never moves the pull watermark.
//  - A re-sent folder CREATE returns the stored folder and creates no duplicate.
//  - A DELETE by masterId removes a folder and its contents, even when another browser sent it.
//
// Timestamps are whole seconds, so tests sleep past a second boundary where ordering matters.

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import {
  app, baseUrl, bearer, registerUser, deviceInfo, syncMetadata, makeBookmark, makeFolder,
  dbReady, type DeviceMeta, type RegisteredUser,
} from '../helpers';

beforeAll(async () => { await dbReady; });

interface Dev {
  user: RegisteredUser;
  meta: DeviceMeta;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function newDevice(user: RegisteredUser): Dev {
  return { user, meta: deviceInfo() };
}

async function push(d: Dev, changes: Array<{ type: 'CREATE' | 'UPDATE' | 'DELETE' | 'MOVE'; data: any }>) {
  const res = await request(app)
    .post(`${baseUrl}/sync`)
    .set('Authorization', bearer(d.user.token))
    .set('x-device-id', d.meta.deviceId)
    .send({
      changes: changes.map((c) => ({ type: c.type, data: c.data, metadata: syncMetadata(d.meta), timestamp: Date.now() })),
      deviceId: d.meta.deviceId,
      metadata: syncMetadata(d.meta),
    });
  expect(res.status).toBe(200);
  return res.body;
}

async function pull(d: Dev, { ack = true } = {}) {
  const req = request(app)
    .get(`${baseUrl}/sync/pending`)
    .set('Authorization', bearer(d.user.token))
    .set('x-device-id', d.meta.deviceId)
    .set('x-browser-instance-id', d.meta.browserInstanceId);
  if (ack) req.set('x-sync-ack', '1');
  const res = await req;
  expect(res.status).toBe(200);
  return res.body.data as {
    cursor?: number;
    since?: number;
    changes: {
      creates: { folders: any[]; bookmarks: any[] };
      updates: { folders: any[]; bookmarks: any[] };
      deletes: { folders: any[]; bookmarks: any[] };
    };
    summary: { total: number };
  };
}

async function ackPull(d: Dev, cursor: number, changesApplied = 0) {
  return request(app)
    .post(`${baseUrl}/sync/pending/ack`)
    .set('Authorization', bearer(d.user.token))
    .set('x-device-id', d.meta.deviceId)
    .set('x-browser-instance-id', d.meta.browserInstanceId)
    .send({ cursor, changesApplied });
}

async function masterUrls(d: Dev): Promise<string[]> {
  const res = await request(app)
    .get(`${baseUrl}/sync/master-collection`)
    .set('Authorization', bearer(d.user.token))
    .set('x-device-id', d.meta.deviceId)
    .set('x-browser-instance-id', d.meta.browserInstanceId);
  expect(res.status).toBe(200);
  return (res.body.data.bookmarks as Array<{ url: string }>).map((b) => b.url);
}

describe('acknowledged pulls', () => {
  it('a pull is re-delivered until it is acknowledged', async () => {
    const u = await registerUser();
    const a = newDevice(u);
    const b = newDevice(u);
    const url = 'https://example.com/ack-redeliver';
    await push(a, [{ type: 'CREATE', data: { type: 'bookmark', ...makeBookmark({ id: 'ar-1', url, title: 'Redeliver' }) } }]);
    await sleep(1100); // keep the change out of the cursor's own second

    const first = await pull(b, { ack: true });
    expect(typeof first.cursor).toBe('number');
    expect(first.changes.creates.bookmarks.map((x: any) => x.url)).toContain(url);

    // Not acknowledged, so the same window comes back
    const second = await pull(b, { ack: true });
    expect(second.changes.creates.bookmarks.map((x: any) => x.url)).toContain(url);

    // Acknowledged: the window moves past it
    expect((await ackPull(b, first.cursor!, 1)).status).toBe(200);
    await sleep(1100);
    const third = await pull(b, { ack: true });
    expect(third.changes.creates.bookmarks.map((x: any) => x.url)).not.toContain(url);
  });

  it('rejects an ack without a valid cursor', async () => {
    const u = await registerUser();
    const b = newDevice(u);
    expect((await ackPull(b, NaN)).status).toBe(400);
    expect((await ackPull(b, -5)).status).toBe(400);
    expect((await ackPull(b, Math.floor(Date.now() / 1000) + 3600)).status).toBe(400);
  });
});

describe('a browser\'s own push never skips other browsers\' changes', () => {
  it('B\'s push does not move B\'s pull watermark past A\'s earlier change', async () => {
    const u = await registerUser();
    const a = newDevice(u);
    const b = newDevice(u);
    const urlA = 'https://example.com/push-before-pull-a';
    const urlB = 'https://example.com/push-before-pull-b';

    await push(a, [{ type: 'CREATE', data: { type: 'bookmark', ...makeBookmark({ id: 'pp-a', url: urlA, title: 'A' }) } }]);
    await sleep(1100);
    await push(b, [{ type: 'CREATE', data: { type: 'bookmark', ...makeBookmark({ id: 'pp-b', url: urlB, title: 'B' }) } }]);

    // B has not pulled yet, so it must still receive A's change
    const pulled = await pull(b, { ack: true });
    expect(pulled.changes.creates.bookmarks.map((x: any) => x.url)).toContain(urlA);
  });

  it('reading the master collection does not move the pull watermark', async () => {
    const u = await registerUser();
    const a = newDevice(u);
    const b = newDevice(u);
    const url = 'https://example.com/master-read-does-not-skip';

    await push(a, [{ type: 'CREATE', data: { type: 'bookmark', ...makeBookmark({ id: 'mr-a', url, title: 'Master read' }) } }]);
    await sleep(1100);
    expect(await masterUrls(b)).toContain(url);

    const pulled = await pull(b, { ack: true });
    expect(pulled.changes.creates.bookmarks.map((x: any) => x.url)).toContain(url);
  });
});

describe('creates are idempotent and never dropped silently', () => {
  it('a folder without a position is created, and a re-sent create returns the same folder', async () => {
    const u = await registerUser();
    const a = newDevice(u);
    const folder = makeFolder({ id: 'fold-idem', title: 'Idempotent folder', parentId: '1' });
    // The extension sends `index` and no `position`. position is NOT NULL, so this used to fail silently.
    const { position: _ignored, ...withoutPosition } = folder as any;

    const first = await push(a, [{ type: 'CREATE', data: { type: 'folder', ...withoutPosition } }]);
    expect(first.success).toBe(true);
    expect(first.data.results[0].success).toBe(true);
    const masterId = first.data.results[0].masterId;

    const again = await push(a, [{ type: 'CREATE', data: { type: 'folder', ...withoutPosition } }]);
    expect(again.success).toBe(true);
    expect(again.data.results[0].masterId).toBe(masterId);
    expect(again.data.results[0].duplicate).toBe(true);

    const res = await request(app)
      .get(`${baseUrl}/sync/master-collection`)
      .set('Authorization', bearer(a.user.token))
      .set('x-device-id', a.meta.deviceId)
      .set('x-browser-instance-id', a.meta.browserInstanceId);
    const titled = (res.body.data.folders as Array<{ title: string }>).filter((f) => f.title === 'Idempotent folder');
    expect(titled).toHaveLength(1);
  });
});

describe('deletes resolve by masterId across browsers', () => {
  it('a folder DELETE by masterId removes the folder and its contents for every browser', async () => {
    const u = await registerUser();
    const a = newDevice(u);
    const b = newDevice(u);

    const folder = makeFolder({ id: 'del-fold', title: 'Doomed folder', parentId: '1' });
    const created = await push(a, [{ type: 'CREATE', data: { type: 'folder', ...folder } }]);
    const folderMasterId: string = created.data.results[0].masterId;

    await push(a, [{ type: 'CREATE', data: { type: 'bookmark', ...makeBookmark({ id: 'del-child', url: 'https://example.com/doomed-child', title: 'Child', parentId: 'del-fold' }) } }]);

    // B deletes the folder by masterId. B never created it, so browserId alone can't find it.
    const deleted = await push(b, [{
      type: 'DELETE',
      data: { type: 'folder', browserId: 'del-fold', masterId: folderMasterId, title: 'Doomed folder' },
    }]);
    expect(deleted.data.results[0].error).toBeUndefined();

    const res = await request(app)
      .get(`${baseUrl}/sync/master-collection`)
      .set('Authorization', bearer(a.user.token))
      .set('x-device-id', a.meta.deviceId)
      .set('x-browser-instance-id', a.meta.browserInstanceId);
    expect((res.body.data.folders as Array<{ title: string }>).map((f) => f.title)).not.toContain('Doomed folder');
    expect((res.body.data.bookmarks as Array<{ url: string }>).map((x) => x.url)).not.toContain('https://example.com/doomed-child');
  });
});
