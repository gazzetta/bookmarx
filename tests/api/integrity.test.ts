import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, db, dbReady, registerUser, bearer, deviceInfo, syncMetadata } from '../helpers';
import { bookmarksToHtml, parseBookmarkFile, validateBookmarkItems } from '../../src/website/backend/utils/bookmarkFiles';
import { up as backfillAppliedRevisions } from '../../src/website/backend/db/migrations/009-browser-applied-revisions';

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
  it('backfills an existing successful upload without hiding later changes', async () => {
    const u = await account();
    const initial = await request(app).post('/api/v1/sync/initial').set(headers(u)).send({
      operationId: 'previous-upload', deviceId: u.device.deviceId, folders: [],
      bookmarks: ['known', 'edited'].map(id => ({ id, title: id, url: `https://example.test/${id}`, parentId: '2' })),
      metadata: syncMetadata(u.device) });
    expect(initial.status).toBe(200);
    const editedId = initial.body.data.processed.find((item: any) => item.browserId === 'edited').masterId;
    db.updateBookmark({ masterId: editedId, userId: u.userId, collectionId: u.collectionId, title: 'Later website edit' });
    const raw = (db as any).db;
    raw.prepare('DELETE FROM sync_applied_items WHERE userId = ?').run(u.userId);
    backfillAppliedRevisions(raw);
    const pending = await request(app).get('/api/v1/sync/pending').set(headers(u));
    expect(pending.body.data.changes.creates.bookmarks.map((b: any) => [b.masterId, b.title])).toEqual([[editedId, 'Later website edit']]);
  });

  it('does not offer the first browser its own initial upload, but offers it to another browser', async () => {
    const u = await account();
    const body = { operationId: 'initial-other-bookmarks', deviceId: u.device.deviceId,
      folders: [{ id: '1', title: 'Bookmarks bar', parentId: '0', rootKind: 'bar' },
        { id: '2', title: 'Other bookmarks', parentId: '0', rootKind: 'other' }],
      bookmarks: [{ id: 'example', title: 'Example Domain', url: 'https://example.com/', parentId: '2' }],
      metadata: syncMetadata(u.device) };
    expect((await request(app).post('/api/v1/sync/initial').set(headers(u)).send(body)).status).toBe(200);
    const ownStatus = await request(app).get('/api/v1/sync/status').set(headers(u));
    expect(ownStatus.body.data.pendingChanges.adds).toBe(0);
    expect(ownStatus.body.data.pendingChanges.addsFolders).toBe(0);
    const ownPull = await request(app).get('/api/v1/sync/pending').set(headers(u));
    expect(ownPull.body.data.changes.creates.bookmarks).toHaveLength(0);
    expect(ownPull.body.data.changes.creates.folders).toHaveLength(0);
    const peer = { ...u, device: deviceInfo() };
    db.registerBrowser({ ...peer.device, userId: u.userId, currentCollectionId: u.collectionId, userAgent: 'peer' });
    const peerStatus = await request(app).get('/api/v1/sync/status').set(headers(peer));
    const peerPull = await request(app).get('/api/v1/sync/pending').set(headers(peer));
    expect(peerStatus.body.data.pendingChanges.adds).toBe(1);
    expect(peerPull.body.data.changes.creates.bookmarks).toHaveLength(1);
  });

  it('suppresses only known own revisions and retains a later peer edit after a push and retry', async () => {
    const u = await account();
    const push = (actor: any, changes: any[]) => request(app).post('/api/v1/sync').set(headers(actor))
      .send({ changes, deviceId: actor.device.deviceId, metadata: syncMetadata(actor.device) });
    const create = { type: 'CREATE', operationId: 'create-example', data: { type: 'bookmark', id: 'example',
      title: 'Example', url: 'https://example.com/', parentId: '2' } };
    const first = await push(u, [create]);
    expect(first.status).toBe(200);
    const masterId = first.body.data.processed[0].masterId;
    const peer = { ...u, device: deviceInfo() };
    db.registerBrowser({ ...peer.device, userId: u.userId, currentCollectionId: u.collectionId, userAgent: 'peer' });
    expect((await push(peer, [{ type: 'UPDATE', operationId: 'peer-rename',
      data: { type: 'bookmark', masterId, title: 'Renamed by peer' } }])).status).toBe(200);
    expect((await push(u, [create])).status).toBe(200);
    expect((await push(u, [{ ...create, operationId: 'second-create', data: { ...create.data, id: 'second', title: 'Second' } }])).status).toBe(200);
    const status = await request(app).get('/api/v1/sync/status').set(headers(u));
    expect(status.body.data.pendingChanges.adds).toBe(1);
    const pull = await request(app).get('/api/v1/sync/pending').set(headers(u));
    expect(pull.body.data.changes.creates.bookmarks.map((b: any) => [b.masterId, b.title])).toEqual([[masterId, 'Renamed by peer']]);
    expect((await push(u, [{ type: 'UPDATE', operationId: 'own-newer-rename',
      data: { type: 'bookmark', masterId, title: 'Newer local title' } }])).status).toBe(200);
    const afterOwnEdit = await request(app).get('/api/v1/sync/pending').set(headers(u));
    expect(afterOwnEdit.body.data.changes.creates.bookmarks).toHaveLength(0);
    expect((await push(peer, [{ type: 'DELETE', operationId: 'peer-delete', data: { type: 'bookmark', masterId } }])).status).toBe(200);
    const deletion = await request(app).get('/api/v1/sync/pending').set(headers(u));
    expect(deletion.body.data.changes.deletes.bookmarks.map((b: any) => b.masterId)).toEqual([masterId]);
  });

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

  it('resolves a restored folder parent within the same create batch, including an idempotent retry', async () => {
    const u = await account();
    const body = { deviceId: u.device.deviceId, metadata: syncMetadata(u.device), changes: [
      { operationId: 'restore-folder', type: 'CREATE', data: { type: 'folder', id: 'restored-folder', browserId: 'restored-folder', title: 'Restored folder', parentId: '1', position: 0 } },
      { operationId: 'restore-child', type: 'CREATE', data: { type: 'bookmark', id: 'restored-child', browserId: 'restored-child', title: 'Restored child', url: 'https://example.test/restored', parentId: 'restored-folder', masterParentId: 'deleted-parent-master-id', position: 0 } },
    ] };
    const first = await request(app).post('/api/v1/sync').set(headers(u)).send(body);
    expect(first.status, first.text).toBe(200);
    const parentId = first.body.data.processed[0].masterId;
    const child = db.getBookmarksByCollection(u.collectionId, u.userId).find((item: any) => item.browserId === 'restored-child');
    expect(child?.masterParentId).toBe(parentId);

    const retry = await request(app).post('/api/v1/sync').set(headers(u)).send(body);
    expect(retry.status, retry.text).toBe(200);
    expect(retry.body.data.processed).toEqual(first.body.data.processed);
    expect(db.getFoldersByCollection(u.collectionId, u.userId).filter((item: any) => item.browserId === 'restored-folder')).toHaveLength(1);
    expect(db.getBookmarksByCollection(u.collectionId, u.userId).filter((item: any) => item.browserId === 'restored-child')).toHaveLength(1);
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
