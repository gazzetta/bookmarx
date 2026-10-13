import { beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app, db, dbReady, registerUser, bearer, deviceInfo, syncMetadata } from '../helpers';

beforeAll(async () => { await dbReady; });

async function account() {
  const u = await registerUser();
  db.updateUserSubscription(u.userId, { subscriptionTier: 'premium' });
  const collectionId = db.ensureDefaultCollection(u.userId);
  const device = deviceInfo();
  db.registerBrowser({ ...device, userId: u.userId, userAgent: 'audit', currentCollectionId: collectionId });
  return { ...u, collectionId, device };
}
function folder(u: any, id: string, parent: string | null = null) {
  return db.createFolder({ browserId: id, title: id, parentId: '1', masterParentId: parent,
    userId: u.userId, collectionId: u.collectionId, position: 0, dateAdded: Date.now(), metadata: syncMetadata(u.device) });
}
function bookmark(u: any, id: string, parent: string | null = null) {
  return db.createBookmark({ browserId: id, title: id, url: `https://example.test/${id}`, parentId: '1',
    masterParentId: parent, userId: u.userId, collectionId: u.collectionId, position: 0,
    dateAdded: Date.now(), sessionId: u.sessionId, metadata: syncMetadata(u.device) });
}
function pull(u: any, device = deviceInfo(), collectionId = u.collectionId) {
  return request(app).get('/api/v1/sync/pending').set('Authorization', bearer(u.token))
    .set('X-Device-ID', device.deviceId).set('X-Browser-Instance-ID', device.browserInstanceId)
    .set('X-Collection-ID', collectionId).set('X-Sync-Ack', '1');
}
function edit(u: any, changes: any[]) {
  return request(app).post(`/api/v1/collections/${u.collectionId}/changes`)
    .set('Authorization', bearer(u.token)).send({ changes });
}

describe('launch gates: isolated real API and SQLite', () => {
  it('A01: a pull returns only the selected collection', async () => {
    const u = await account();
    const c = await request(app).post('/api/v1/collections').set('Authorization', bearer(u.token)).send({ name: 'Private work' });
    expect(c.status).toBe(201);
    const foreign = bookmark({ ...u, collectionId: c.body.data.collection.id }, 'other-collection');
    bookmark(u, 'selected-collection');
    const r = await pull(u);
    expect(r.status).toBe(200);
    expect(r.body.data.changes.creates.bookmarks.map((b: any) => b.masterId)).not.toContain(foreign.masterId);
  });

  it('A02: website edits are delivered back to the browser that originally created the bookmark', async () => {
    const u = await account();
    db.registerBrowser({ ...u.device, userId: u.userId, userAgent: 'audit' });
    const b = bookmark(u, 'origin-edit');
    db.updateBookmark({ masterId: b.masterId, userId: u.userId, title: 'Edited on website' });
    const r = await pull(u, u.device);
    const rows = [...r.body.data.changes.creates.bookmarks, ...r.body.data.changes.updates.bookmarks];
    expect(rows.find((row: any) => row.masterId === b.masterId)?.title).toBe('Edited on website');
  });

  it('A03: moving a nested bookmark to the collection root clears masterParentId', async () => {
    const u = await account();
    const f = folder(u, 'parent');
    const b = bookmark(u, 'nested', f.masterId);
    const r = await edit(u, [{ type: 'move', itemType: 'bookmark', itemId: b.masterId, newParentId: null }]);
    expect(r.body.success).toBe(true);
    expect(db.getBookmarksByCollection(u.collectionId, u.userId).find((row: any) => row.masterId === b.masterId)?.masterParentId).toBeNull();
  });

  it('A04: creating a folder and child in one editor commit preserves their hierarchy', async () => {
    const u = await account();
    const r = await edit(u, [
      { type: 'add-folder', itemType: 'folder', itemId: 'temp-parent', title: 'New parent' },
      { type: 'add-bookmark', itemType: 'bookmark', itemId: 'temp-child', parentId: 'temp-parent', title: 'Child', url: 'https://example.test/child' },
    ]);
    expect(r.body.success).toBe(true);
    const f = db.getFoldersByCollection(u.collectionId, u.userId).find((row: any) => row.title === 'New parent')!;
    const b = db.getBookmarksByCollection(u.collectionId, u.userId).find((row: any) => row.title === 'Child')!;
    expect(b.masterParentId).toBe(f.masterId);
  });

  it('A05: an unsigned PayPal event cannot grant premium when webhook configuration is absent', async () => {
    const u = await registerUser();
    const saved = process.env.PAYPAL_WEBHOOK_ID;
    delete process.env.PAYPAL_WEBHOOK_ID;
    try {
      await request(app).post('/api/webhooks/paypal').send({
        event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
        resource: { id: `audit-${u.userId}`, custom_id: u.userId, plan_id: 'unrecognised', status: 'ACTIVE' },
      });
      expect(db.getUserById(u.userId).subscriptionTier).toBe('free');
    } finally {
      if (saved === undefined) delete process.env.PAYPAL_WEBHOOK_ID;
      else process.env.PAYPAL_WEBHOOK_ID = saved;
    }
  });

  it('A06: legacy update cannot mutate another account using a claimed browser instance ID', async () => {
    const owner = await account();
    const attacker = await account();
    const b = bookmark(owner, 'owner-bookmark');
    const metadata = syncMetadata(owner.device);
    await request(app).post('/api/v1/sync').set('Authorization', bearer(attacker.token))
      .set('X-Device-ID', owner.device.deviceId).set('X-Browser-Instance-ID', owner.device.browserInstanceId)
      .send({ deviceId: owner.device.deviceId, metadata, changes: [{ type: 'UPDATE', metadata,
        data: { type: 'bookmark', id: 'owner-bookmark', browserId: 'owner-bookmark', title: 'Hijacked', url: 'https://example.test/hijacked', parentId: '1', index: 0 } }] });
    expect(db.getBookmarksByCollection(owner.collectionId, owner.userId).find((row: any) => row.masterId === b.masterId)?.title).toBe('owner-bookmark');
  });

  it('A07: a pull cannot register a third browser for a free account', async () => {
    const u = await registerUser();
    const collectionId = db.ensureDefaultCollection(u.userId);
    for (let i = 0; i < 3; i++) await pull({ ...u, collectionId });
    expect(db.getBrowsersForUser(u.userId).length).toBeLessThanOrEqual(2);
  });

  it('A08: converting a time-limited plan to lifetime clears the expiry', async () => {
    const u = await account();
    db.updateUserSubscription(u.userId, { subscriptionExpiresAt: 1 });
    db.updateUserSubscription(u.userId, { subscriptionTier: 'premium', subscriptionExpiresAt: null });
    expect(db.getUserById(u.userId).subscriptionExpiresAt).toBeNull();
  });

  it('A09: a rollback delivers removal records to extensions', async () => {
    const u = await account();
    const b = bookmark({ ...u, sessionId: 'audit-session' }, 'rollback-me');
    db.rollbackSession('audit-session', u.userId);
    const r = await pull(u);
    expect(r.body.data.changes.deletes.bookmarks.map((row: any) => row.masterId)).toContain(b.masterId);
  });

  it('A10: an editor cannot make a folder its own parent', async () => {
    const u = await account();
    const f = folder(u, 'cycle');
    const r = await edit(u, [{ type: 'move', itemType: 'folder', itemId: f.masterId, newParentId: f.masterId }]);
    expect(r.body.success).toBe(false);
    expect(db.getFoldersByCollection(u.collectionId, u.userId).find((row: any) => row.masterId === f.masterId)?.masterParentId).toBeNull();
  });

  it('A11: editor requests cannot mutate an item in a different collection', async () => {
    const u = await account();
    const c = await request(app).post('/api/v1/collections').set('Authorization', bearer(u.token)).send({ name: 'Separate' });
    const otherId = c.body.data.collection.id;
    const b = bookmark({ ...u, collectionId: otherId }, 'separate-item');
    await edit(u, [{ type: 'rename', itemType: 'bookmark', itemId: b.masterId, newTitle: 'Wrong collection' }]);
    expect(db.getBookmarksByCollection(otherId, u.userId).find((row: any) => row.masterId === b.masterId)?.title).toBe('separate-item');
  });

  it('A12: the server rejects short passwords without relying on website validation', async () => {
    const r = await request(app).post('/api/v1/auth/register').send({ email: `short-${Date.now()}@example.test`, password: 'x' });
    expect(r.status).toBe(400);
  });

  it('C01: authenticated master reads enforce account isolation', async () => {
    const owner = await account();
    const stranger = await account();
    const b = bookmark(owner, 'private-master');
    const r = await request(app).get('/api/v1/sync/master-collection').set('Authorization', bearer(stranger.token))
      .set('X-Device-ID', stranger.device.deviceId).set('X-Browser-Instance-ID', stranger.device.browserInstanceId);
    expect(r.status).toBe(200);
    expect(r.body.data.bookmarks.map((row: any) => row.masterId)).not.toContain(b.masterId);
  });

  it('A13: completed lifetime order capture grants the paying user lifetime access', async () => {
    const u = await registerUser();
    db.recordPayPalCheckout('audit-order', u.userId, 'lifetime', 4999, 'USD');
    const savedId = process.env.PAYPAL_CLIENT_ID;
    const savedSecret = process.env.PAYPAL_CLIENT_SECRET;
    process.env.PAYPAL_CLIENT_ID = 'audit-dummy-id';
    process.env.PAYPAL_CLIENT_SECRET = 'audit-dummy-secret';
    vi.stubGlobal('fetch', vi.fn(async (url: any) => ({ ok: true, json: async () => String(url).endsWith('/oauth2/token')
      ? { access_token: 'audit-dummy-token', expires_in: 3600 }
      : { id: 'audit-order', status: 'COMPLETED', purchase_units: [{ custom_id: u.userId,
        payments: { captures: [{ id: 'audit-capture', status: 'COMPLETED', amount: { currency_code: 'USD', value: '49.99' } }] } }] } })));
    try {
      const r = await request(app).post('/api/v1/checkout/capture').set('Authorization', bearer(u.token)).send({ orderID: 'audit-order' });
      expect(r.body.success).toBe(true);
      expect(db.getUserById(u.userId).subscriptionTier).toBe('premium');
      expect(db.getUserById(u.userId).subscriptionExpiresAt).toBeNull();
    } finally {
      vi.unstubAllGlobals();
      if (savedId === undefined) delete process.env.PAYPAL_CLIENT_ID; else process.env.PAYPAL_CLIENT_ID = savedId;
      if (savedSecret === undefined) delete process.env.PAYPAL_CLIENT_SECRET; else process.env.PAYPAL_CLIENT_SECRET = savedSecret;
    }
  });
});
