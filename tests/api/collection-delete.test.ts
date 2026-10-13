// tests/api/collection-delete.test.ts
//
// Deleting a collection that has been synced into. Sync history, collection events and the browsers
// viewing it all reference the collection, and that used to fail the delete with
// "FOREIGN KEY constraint failed". Deleting a collection now clears those links and removes its items.

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import {
  app, baseUrl, bearer, registerUser, deviceInfo, syncMetadata, makeBookmark,
  dbReady, db,
} from '../helpers';

beforeAll(async () => { await dbReady; });

describe('deleting a synced collection', () => {
  it('removes the collection and its bookmarks, even after a sync wrote history for it', async () => {
    const u = await registerUser();
    db.updateUserSubscription(u.userId, { subscriptionTier: 'premium' });
    const device = deviceInfo();

    const created = await request(app)
      .post(`${baseUrl}/collections`)
      .set('Authorization', bearer(u.token))
      .send({ name: 'Scratch for delete' });
    expect(created.status).toBe(201);
    const collectionId: string = created.body.data.collection.id;

    // Sync into the new collection. This writes sync_history rows that reference it.
    const pushed = await request(app)
      .post(`${baseUrl}/sync`)
      .set('Authorization', bearer(u.token))
      .set('x-device-id', device.deviceId)
      .set('x-collection-id', collectionId)
      .send({
        changes: [{
          type: 'CREATE',
          data: { type: 'bookmark', ...makeBookmark({ id: 'cd-1', url: 'https://example.com/collection-delete', title: 'In scratch' }) },
          metadata: syncMetadata(device),
          timestamp: Date.now(),
        }],
        deviceId: device.deviceId,
        metadata: syncMetadata(device),
      });
    expect(pushed.status).toBe(200);
    expect(pushed.body.success).toBe(true);

    const deleted = await request(app)
      .delete(`${baseUrl}/collections/${collectionId}`)
      .set('Authorization', bearer(u.token));
    expect(deleted.status, JSON.stringify(deleted.body)).toBe(200);
    expect(deleted.body.success).toBe(true);

    const listed = await request(app)
      .get(`${baseUrl}/collections`)
      .set('Authorization', bearer(u.token));
    const ids = (listed.body.data.collections as Array<{ id: string }>).map((c) => c.id);
    expect(ids).not.toContain(collectionId);
  });
});
