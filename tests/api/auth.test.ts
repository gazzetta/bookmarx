// tests/api/auth.test.ts
//
// Covers: /health, /api/v1/config, register / login / me / forgot-password /
// reset-password, plus the auth middleware's 401 paths. Each test file gets a
// fresh ephemeral SQLite (see tests/setup.ts) so users here cannot collide
// with users in tests/api/sync.test.ts.
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import {
  app, baseUrl, registerUser, bearer, uniqueEmail, dbReady,
} from '../helpers';

// Migrations run async inside the singleton's constructor; without this we
// race handlers against column add-ons (see DatabaseService.readyPromise).
beforeAll(async () => { await dbReady; });

describe('Health & config (unauthenticated)', () => {
  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body.timestamp).toBeTypeOf('number');
  });

  it('GET /api/v1/config returns free + premium limits', async () => {
    const res = await request(app).get(`${baseUrl}/config`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const cfg = res.body.data;
    expect(cfg.limits.free.bookmarks).toBeGreaterThan(0);
    expect(cfg.limits.premium.bookmarks).toBeGreaterThanOrEqual(cfg.limits.free.bookmarks);
    expect(cfg.branding.appName).toBeTypeOf('string');
  });
});

describe('Auth: register / login / me', () => {
  it('rejects missing email or password on register (400)', async () => {
    const res = await request(app).post(`${baseUrl}/auth/register`).send({ email: 'a@b.test' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('registers a new user and returns a bearer token', async () => {
    const email = uniqueEmail();
    const res = await request(app).post(`${baseUrl}/auth/register`).send({
      email, password: 'Sup3rSecret!123',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeTypeOf('string');
    expect(res.body.data.user.email).toBe(email);
    expect(res.body.data.user.subscriptionTier).toBe('free');
  });

  it('rejects duplicate email on register (409)', async () => {
    const u = await registerUser();
    const res = await request(app).post(`${baseUrl}/auth/register`).send({
      email: u.email, password: 'Sup3rSecret!123',
    });
    expect(res.status).toBe(409);
  });

  it('logs in with the registered password', async () => {
    const u = await registerUser();
    const res = await request(app).post(`${baseUrl}/auth/login`).send({
      email: u.email, password: u.password,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTypeOf('string');
    expect(res.body.data.user.id).toBe(u.userId);
  });

  it('rejects login with wrong password (401)', async () => {
    const u = await registerUser();
    const res = await request(app).post(`${baseUrl}/auth/login`).send({
      email: u.email, password: 'WRONG-password-!@#',
    });
    expect(res.status).toBe(401);
  });

  it('rejects login for unknown user (401)', async () => {
    const res = await request(app).post(`${baseUrl}/auth/login`).send({
      email: 'nonexistent@bookmarx.test', password: 'whatever',
    });
    expect(res.status).toBe(401);
  });

  it('GET /auth/me returns the authenticated user', async () => {
    const u = await registerUser();
    const res = await request(app)
      .get(`${baseUrl}/auth/me`)
      .set('Authorization', bearer(u.token));
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(u.email);
    expect(res.body.data.id).toBe(u.userId);
  });

  it('GET /auth/me rejects a missing bearer (401)', async () => {
    const res = await request(app).get(`${baseUrl}/auth/me`);
    expect(res.status).toBe(401);
  });

  it('GET /auth/me rejects a tampered token (401)', async () => {
    const res = await request(app)
      .get(`${baseUrl}/auth/me`)
      .set('Authorization', 'Bearer not-a-real-jwt');
    expect(res.status).toBe(401);
  });
});

describe('Auth: password reset flow', () => {
  it('forgot-password always returns 200 (no enumeration)', async () => {
    // Real email — but RESEND_API_KEY is unset in tests, so no email is sent.
    const u = await registerUser();
    const res1 = await request(app)
      .post(`${baseUrl}/auth/forgot-password`)
      .send({ email: u.email });
    expect(res1.status).toBe(200);

    // Non-existent email should ALSO return 200 (security: no enumeration).
    const res2 = await request(app)
      .post(`${baseUrl}/auth/forgot-password`)
      .send({ email: 'never-registered@bookmarx.test' });
    expect(res2.status).toBe(200);
  });

  it('forgot-password rejects missing email (400)', async () => {
    const res = await request(app)
      .post(`${baseUrl}/auth/forgot-password`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('reset-password rejects a bogus token (400)', async () => {
    const res = await request(app)
      .post(`${baseUrl}/auth/reset-password`)
      .send({ token: 'definitely-not-a-real-reset-token', password: 'NewPassword!123' });
    expect(res.status).toBe(400);
  });

  it('reset-password rejects a too-short new password (400)', async () => {
    const res = await request(app)
      .post(`${baseUrl}/auth/reset-password`)
      .send({ token: 'whatever', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});