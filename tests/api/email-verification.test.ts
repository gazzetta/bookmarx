import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createHash, randomUUID } from 'crypto';
import { app, db, dbReady, registerUser, bearer, deviceInfo } from '../helpers';
import { OAuth2Client } from '../../src/website/node_modules/google-auth-library/build/src/index.js';

const delivery = vi.hoisted(() => ({ sent: [] as Array<{ email: string; token: string }>, succeeds: true, google: null as any }));
vi.mock('../../src/website/backend/utils/email', async original => ({
  ...await original<any>(),
  sendEmailVerificationEmail: vi.fn(async (email: string, token: string) => {
    delivery.sent.push({ email, token }); return delivery.succeeds;
  })
}));
beforeAll(async () => { await dbReady; });
beforeEach(() => {
  vi.restoreAllMocks(); delivery.sent = []; delivery.succeeds = true; process.env.GOOGLE_CLIENT_ID = 'verification-test-google';
  vi.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockImplementation(async () => ({ getPayload: () => delivery.google }) as any);
  vi.spyOn(OAuth2Client.prototype, 'getTokenInfo').mockRejectedValue(new Error('Invalid access token'));
});
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const raw = () => (db as any).db;
const pending = () => registerUser({ verifyEmail: false });
const confirm = (token: string) => request(app).post('/api/v1/auth/verify-email').send({ token });
const resend = (token: string) => request(app).post('/api/v1/auth/resend-verification').set('Authorization', bearer(token));
const removeCooldown = (userId: string) => raw().prepare('UPDATE email_verification_tokens SET createdAt = 0 WHERE userId = ?').run(userId);

describe('email verification boundary', () => {
  it('creates an unverified account, warns at login, and blocks all bookmark APIs without side effects', async () => {
    const u = await pending();
    const login = await request(app).post('/api/v1/auth/login').send({ email: u.email, password: u.password });
    expect(login.body.data.user.emailVerified).toBe(false);
    expect(db.getUserById(u.userId).passwordHash).not.toBe(u.password);
    const collectionId = db.getDefaultCollection(u.userId)!.id;
    const revision = db.getCollectionRevision(u.userId, collectionId);
    const paths: Array<['get' | 'post', string]> = [
      ['get', '/sync/status'], ['get', '/sync/master-summary'], ['get', '/sync/master-collection'], ['get', '/sync/pending'],
      ['post', '/sync'], ['post', '/sync/initial'], ['post', '/sync/merge'], ['post', '/sync/pending/ack'],
      ['get', '/collections'], ['post', `/collections/${collectionId}/import`], ['get', `/collections/${collectionId}/export`],
      ['post', `/collections/${collectionId}/changes`], ['get', `/bookmarks/tree/${u.userId}`],
      ['post', '/sessions/anything/rollback'], ['post', '/capture'], ['get', '/user/browsers']
    ];
    for (const [method, path] of paths) {
      const response = await request(app)[method](`/api/v1${path}`).set('Authorization', bearer(u.token));
      expect(response.status, path).toBe(403);
      expect(response.body.error.code, path).toBe('EMAIL_NOT_VERIFIED');
    }
    expect(db.getCollectionRevision(u.userId, collectionId)).toBe(revision);
    expect(db.getBookmarksByCollection(collectionId, u.userId)).toHaveLength(0);
    expect((await request(app).get('/api/v1/auth/me').set('Authorization', bearer(u.token))).status).toBe(200);
  });

  it('stores only a token hash and unlocks an existing session immediately after confirmation', async () => {
    const u = await pending(); const token = delivery.sent.at(-1)!.token;
    const stored = raw().prepare('SELECT * FROM email_verification_tokens WHERE userId = ?').get(u.userId);
    expect(stored.tokenHash).toBe(tokenHash(token));
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(await confirm(token).then(r => r.status)).toBe(200);
    expect((await request(app).get('/api/v1/auth/me').set('Authorization', bearer(u.token))).body.data.emailVerified).toBe(true);
    const device = deviceInfo();
    expect((await request(app).get('/api/v1/sync/status').set('Authorization', bearer(u.token))
      .set('X-Browser-Instance-ID', device.browserInstanceId)).status).toBe(200);
    expect(await confirm(token).then(r => r.status)).toBe(400);
  });

  it('rejects invalid and expired links without validating the account', async () => {
    const u = await pending(); const token = delivery.sent.at(-1)!.token;
    expect(await confirm('bad').then(r => r.status)).toBe(400);
    expect(await confirm('0'.repeat(64)).then(r => r.status)).toBe(400);
    raw().prepare('UPDATE email_verification_tokens SET expiresAt = 0 WHERE userId = ?').run(u.userId);
    expect(await confirm(token).then(r => r.status)).toBe(400);
    expect(db.getUserById(u.userId).emailVerifiedAt).toBeNull();
  });

  it('rate-limits resends per account, rotates tokens, and allows only one concurrent resend', async () => {
    const u = await pending(); const old = delivery.sent.at(-1)!.token;
    const limited = await resend(u.token);
    expect(limited.status).toBe(429); expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    removeCooldown(u.userId);
    const attempts = await Promise.all([resend(u.token), resend(u.token)]);
    expect(attempts.map(r => r.status).sort()).toEqual([200, 429]);
    const newest = delivery.sent.at(-1)!.token;
    expect(newest).not.toBe(old);
    expect(await confirm(old).then(r => r.status)).toBe(400);
    expect(await confirm(newest).then(r => r.status)).toBe(200);
    expect((await resend(u.token)).body.data.emailVerified).toBe(true);
  });

  it('consumes a link exactly once under concurrent confirmation', async () => {
    await pending(); const token = delivery.sent.at(-1)!.token;
    expect((await Promise.all([confirm(token), confirm(token)])).map(r => r.status).sort()).toEqual([200, 400]);
  });

  it('binds verification to the issued email and account rather than the current login', async () => {
    const a = await pending(); const token = delivery.sent.at(-1)!.token; const b = await pending();
    const response = await request(app).post('/api/v1/auth/verify-email').set('Authorization', bearer(b.token)).send({ token, userId: b.userId });
    expect(response.status).toBe(200);
    expect(db.getUserById(a.userId).emailVerifiedAt).toBeTruthy(); expect(db.getUserById(b.userId).emailVerifiedAt).toBeNull();
    const bToken = delivery.sent.at(-1)!.token;
    raw().prepare('UPDATE users SET email = ? WHERE id = ?').run('changed@example.test', b.userId);
    expect(await confirm(bToken).then(r => r.status)).toBe(400);
  });

  it('keeps signup saved and locked when delivery fails, without falsely claiming mail was sent', async () => {
    delivery.succeeds = false;
    const response = await request(app).post('/api/v1/auth/register').send({ email: `${randomUUID()}@example.test`, password: 'Verification-test123!' });
    expect(response.status).toBe(200);
    expect(response.body.data.verificationEmailSent).toBe(false); expect(response.body.data.user.emailVerified).toBe(false);
    removeCooldown(response.body.data.user.id);
    expect((await resend(response.body.data.token)).status).toBe(503);
    expect(db.getUserById(response.body.data.user.id).emailVerifiedAt).toBeNull();
  });

  it('does not let a GET or email-link scanner consume the token', async () => {
    const u = await pending(); const token = delivery.sent.at(-1)!.token;
    await request(app).get(`/api/v1/auth/verify-email?token=${token}`);
    expect(db.getUserById(u.userId).emailVerifiedAt).toBeNull();
    expect(await confirm(token).then(r => r.status)).toBe(200);
  });

  it('accepts authoritative Gmail proof but still emails a third-party Google account', async () => {
    delivery.google = { sub: randomUUID(), email: `${randomUUID()}@gmail.com`, email_verified: true };
    const gmail = await request(app).post('/api/v1/auth/google').send({ accessToken: 'verified-provider-token' });
    expect(gmail.body.data.user.emailVerified).toBe(true);
    delivery.google = { sub: randomUUID(), email: `${randomUUID()}@outlook.com`, email_verified: true };
    const thirdParty = await request(app).post('/api/v1/auth/google').send({ accessToken: 'verified-provider-token' });
    expect(thirdParty.body.data.user.emailVerified).toBe(false);
    expect(delivery.sent.at(-1)?.email).toBe(delivery.google.email);
  });

  it('does not validate a password account by linking a different verified Google email', async () => {
    const u = await pending();
    delivery.google = { sub: randomUUID(), email: `${randomUUID()}@gmail.com`, email_verified: true };
    const link = await request(app).post('/api/v1/auth/google/link').set('Authorization', bearer(u.token))
      .send({ accessToken: 'verified-provider-token', password: u.password });
    expect(link.status).toBe(200); expect(link.body.data.user.emailVerified).toBe(false);
  });
});
