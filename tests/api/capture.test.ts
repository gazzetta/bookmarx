// tests/api/capture.test.ts
//
// Covers POST /api/v1/capture — the Stage 2 quick-URL-capture endpoint used by
// the iOS Share Extension (ShareViewController.swift:103) and Android Share
// Intent (ShareReceiverActivity.kt:82). This is the entry point for the mobile
// share-sheet flows that are currently blocked behind device QA
// (PROGRESS.md:130-148); an API-level regression test here protects that
// contract even before physical-device testing is wired up.
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app, baseUrl, bearer, registerUser, deviceInfo, syncMetadata, dbReady } from '../helpers';

beforeAll(async () => { await dbReady; });

// /api/v1/capture hard-codes the created bookmark's `browserInstanceId` to
// `mobile-app` (server.ts:1690). `bookmarks.browserInstanceId` has a FK to
// `browsers.browserInstanceId` (schema.sql:130). So the mobile-app "browser"
// must be pre-registered for the user — which exactly mirrors the real mobile
// app's flow: the app signs in and runs a no-op /sync/initial first to register
// the device, THEN the share sheet can /capture against that registered row.
async function registerMobileAppBrowser(token: string) {
  const device = deviceInfo({
    browserInstanceId: 'mobile-app',
    browser: 'BookMarx Mobile',
    deviceId: 'mobile-device-test',
  });
  const res = await request(app)
    .post(`${baseUrl}/sync/initial`)
    .set('Authorization', bearer(token))
    .set('x-device-id', device.deviceId)
    .send({
      bookmarks: [],
      folders: [],
      deviceId: device.deviceId,
      metadata: syncMetadata(device),
    });
  if (res.status !== 200) {
    throw new Error(`registerMobileAppBrowser failed: ${res.status} ${res.text}`);
  }
}

function capture(token: string, body: Record<string, unknown>) {
  return request(app)
    .post(`${baseUrl}/capture`)
    .set('Authorization', bearer(token))
    .set('x-device-id', 'mobile-device-test')
    .send(body);
}

describe('POST /api/v1/capture (mobile share sheet)', () => {
  it('captures a bare URL into the user\'s default collection', async () => {
    const u = await registerUser();
    await registerMobileAppBrowser(u.token);
    const res = await capture(u.token, { url: 'https://example.com/mobile-shared' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.masterId).toBeTypeOf('string');
    expect(res.body.data.url).toBe('https://example.com/mobile-shared');
    // Without a title, server falls back to the URL (server.ts:1681).
    expect(res.body.data.title).toBe('https://example.com/mobile-shared');

    // The captured bookmark must be visible in the user's master-collection
    // so the desktop extension picks it up on next sync.
    const mc = await request(app)
      .get(`${baseUrl}/sync/master-collection`)
      .set('Authorization', bearer(u.token))
      .set('x-device-id', 'mobile-device-test')
      .set('x-browser-instance-id', 'mobile-app');
    expect(mc.status).toBe(200);
    const urls = mc.body.data.bookmarks.map((b: any) => b.url);
    expect(urls).toContain('https://example.com/mobile-shared');
  });

  it('uses the supplied title when provided', async () => {
    const u = await registerUser();
    await registerMobileAppBrowser(u.token);
    const res = await capture(u.token, {
      url: 'https://news.example.com/article',
      title: 'Cool Article',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Cool Article');
  });

  it('rejects a missing url (400)', async () => {
    const u = await registerUser();
    const res = await capture(u.token, { title: 'no url here' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('requires authentication (401)', async () => {
    const res = await request(app)
      .post(`${baseUrl}/capture`)
      .send({ url: 'https://example.com/unauth' });
    expect(res.status).toBe(401);
  });
});