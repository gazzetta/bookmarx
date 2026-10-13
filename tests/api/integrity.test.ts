import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, db, dbReady, registerUser, bearer, deviceInfo, syncMetadata } from '../helpers';
import { bookmarksToHtml, parseBookmarkFile, validateBookmarkItems } from '../../src/website/backend/utils/bookmarkFiles';

beforeAll(async () => { await dbReady; });
async function account() {
  const user = await registerUser();
  db.updateUserSubscription(user.userId, { subscriptionTier: 'premium' });
  const device = deviceInfo();
  const collectionId = db.ensureDefaultCollection(user.userId);
  db.registerBrowser({ ...device, userId: user.userId, currentCollectionId: collectionId, userAgent: 'integrity test' });
  return { ...user, collectionId, device };
}
const headers = (u: any) => ({ Authorization: bearer(u.token), 'X-Device-ID': u.device.deviceId,
  'X-Browser-Instance-ID': u.device.browserInstanceId, 'X-Collection-ID': u.collectionId, 'X-Sync-Version': '2', 'X-Sync-Ack': '1' });
const details = (u: any, id: string, position = 0) => ({ browserId: id, title: id, url: `https://example.test/${id}`,
  userId: u.userId, collectionId: u.collectionId, parentId: '1', position, metadata: syncMetadata(u.device) });

describe('revision and retry integrity', () => {
  it('acknowledges only an offered snapshot and delivers edits committed after it', async () => {
    const u = await account();
    db.createBookmark(details(u, 'before'));
    const snapshot = await request(app).get('/api/v1/sync/master-collection').set(headers(u));
    expect(snapshot.status).toBe(200); expect(snapshot.body.data.cursor).toBeGreaterThan(0);
    const after = db.createBookmark(details(u, 'after'));
    const forged = await request(app).post('/api/v1/sync/pending/ack').set(headers(u)).send({ cursor: snapshot.body.data.cursor + 1000 });
    expect(forged.status).toBe(400);
    const ack = await request(app).post('/api/v1/sync/pending/ack').set(headers(u)).send({ cursor: snapshot.body.data.cursor });
    expect(ack.status).toBe(200);
    const next = await request(app).get('/api/v1/sync/pending').set(headers(u));
    expect(next.body.data.changes.creates.bookmarks.map((b: any) => b.masterId)).toEqual([after.masterId]);
  });

  it('keeps an overwrite retry from deleting a newer remote addition', async () => {
    const u = await account();
    const body = { mode: 'replace', operationId: 'durable-snapshot', deviceId: u.device.deviceId,
      folders: [], bookmarks: [{ id: 'local', title: 'Local', url: 'https://example.test/local', parentId: '1' }], metadata: syncMetadata(u.device) };
    const first = await request(app).post('/api/v1/sync/initial').set(headers(u)).send(body);
    expect(first.status).toBe(200);
    const remote = db.createBookmark(details(u, 'new-remote'));
    const retry = await request(app).post('/api/v1/sync/initial').set(headers(u)).send(body);
    expect(retry.body.data).toEqual(first.body.data);
    expect(db.getBookmarksByCollection(u.collectionId, u.userId).map((b: any) => b.masterId)).toContain(remote.masterId);
  });

  it('atomically rejects a batch with a bad parent, then accepts an unchanged retry exactly once', async () => {
    const u = await account();
    const change = { operationId: 'first-create', type: 'CREATE', data: { type: 'bookmark', id: 'first', title: 'First', url: 'https://example.test/first', parentId: '1' } };
    const body = { changes: [change, { type: 'CREATE', data: { ...change.data, id: 'bad', parentId: 'unavailable' } }], deviceId: u.device.deviceId, metadata: syncMetadata(u.device) };
    expect((await request(app).post('/api/v1/sync').set(headers(u)).send(body)).status).toBe(400);
    expect(db.getBookmarksByCollection(u.collectionId, u.userId)).toHaveLength(0);
    body.changes = [change];
    const first = await request(app).post('/api/v1/sync').set(headers(u)).send(body);
    expect(first.status).toBe(200);
    expect((await request(app).post('/api/v1/sync').set(headers(u)).send(body)).body.data.processed).toEqual(first.body.data.processed);
    expect(db.getBookmarksByCollection(u.collectionId, u.userId)).toHaveLength(1);
    body.changes[0].data.title = 'Reused ID with different contents';
    expect((await request(app).post('/api/v1/sync').set(headers(u)).send(body)).status).toBe(400);
  });

  it('reindexes mixed bookmark/folder siblings when an item moves to the front', async () => {
    const u = await account();
    const root = db.getFoldersByCollection(u.collectionId, u.userId).find((f: any) => f.rootKind === 'bar')!;
    const a = db.createBookmark({ ...details(u, 'a', 0), masterParentId: root.masterId });
    const f = db.createFolder({ ...details(u, 'folder', 1), masterParentId: root.masterId });
    const b = db.createBookmark({ ...details(u, 'b', 2), masterParentId: root.masterId });
    db.moveBookmark({ masterId: b.masterId, userId: u.userId, collectionId: u.collectionId, index: 0 });
    const all = [...db.getFoldersByCollection(u.collectionId, u.userId), ...db.getBookmarksByCollection(u.collectionId, u.userId)]
      .filter((item: any) => item.masterParentId === root.masterId).sort((a: any, b: any) => a.position - b.position);
    expect(all.map((item: any) => [item.masterId, item.position])).toEqual([[b.masterId, 0], [a.masterId, 1], [f.masterId, 2]]);
  });
});

describe('bookmark file integrity', () => {
  it('round-trips Unicode, escaped URLs, duplicates, nesting, and empty folders through browser HTML', () => {
    const original = [{ type: 'folder', title: 'Über & <folder>', rootKind: 'bar', children: [
      { type: 'folder', title: 'Empty', children: [] },
      { type: 'bookmark', title: '"A" & B', url: 'https://example.test/Case?a=A&b=%22' },
      { type: 'bookmark', title: 'Same URL twice', url: 'https://example.test/Case?a=A&b=%22' }
    ] }];
    const parsed = parseBookmarkFile(bookmarksToHtml(original as any), 'html');
    expect(JSON.parse(JSON.stringify(parsed.items))).toEqual(original);
    expect(parsed.bookmarks).toBe(2); expect(parsed.folders).toBe(2);
  });

  it('preserves JSON backup contents and rejects malformed or overly deep trees', () => {
    const items = [{ type: 'bookmark', title: 'Bookmarklet', url: 'javascript:alert(1)', position: 3 }];
    expect(parseBookmarkFile(JSON.stringify({ format: 'bookmarx', version: 1, items }), 'json').items).toEqual(items);
    expect(() => parseBookmarkFile('{', 'json')).toThrow();
    expect(() => validateBookmarkItems([{ type: 'bookmark', title: 'Bad', url: 'data:text/html,<script>bad</script>' }])).toThrow();
    let nested: any[] = [];
    for (let i = 0; i < 130; i++) nested = [{ type: 'folder', title: 'Depth', children: nested }];
    expect(() => validateBookmarkItems(nested)).toThrow(/deeply/);
  });

  it('imports once after a lost response and rejects another account reading its export', async () => {
    const u = await account(); const foreign = await account();
    const body = { operationId: 'file-retry', items: [{ type: 'bookmark', title: '<img src=x onerror=bad()>', url: 'https://example.test/Case?A=B' }] };
    for (let i = 0; i < 2; i++) expect((await request(app).post(`/api/v1/collections/${u.collectionId}/import`).set(headers(u)).send(body)).status).toBe(200);
    expect(db.getBookmarksByCollection(u.collectionId, u.userId)).toHaveLength(1);
    const html = await request(app).get(`/api/v1/collections/${u.collectionId}/export?format=html`).set(headers(u));
    expect(html.text).toContain('&lt;img src=x onerror=bad()&gt;');
    expect((await request(app).get(`/api/v1/collections/${u.collectionId}/export`).set(headers(foreign))).status).not.toBe(200);
  });

  it('revokes the old session after a password reset and allows only one concurrent reset', async () => {
    const u = await account(); const token = crypto.randomUUID();
    db.createPasswordResetToken(u.userId, token, Math.floor(Date.now() / 1000) + 60);
    const responses = await Promise.all([1, 2].map(() => request(app).post('/api/v1/auth/reset-password').send({ token, password: 'New-password123!' })));
    expect(responses.map(r => r.status).sort()).toEqual([200, 400]);
    expect((await request(app).get('/api/v1/auth/me').set(headers(u))).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/login').send({ email: u.email, password: 'New-password123!' })).status).toBe(200);
  });
});
