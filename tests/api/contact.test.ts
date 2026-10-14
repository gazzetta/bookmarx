import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app, dbReady } from '../helpers';

const delivery = vi.hoisted(() => ({ succeeds: true, sent: [] as unknown[] }));
vi.mock('../../src/website/backend/utils/email', async original => ({ ...await original<any>(),
  sendContactEmail: vi.fn(async contact => { delivery.sent.push(contact); return delivery.succeeds; })
}));
let clock = 1791980000000;
beforeAll(async () => { await dbReady; });
beforeEach(() => { clock += 16 * 60 * 1000; vi.spyOn(Date, 'now').mockReturnValue(clock); delivery.succeeds = true; delivery.sent = []; });
afterEach(() => vi.restoreAllMocks());
const valid = { email: 'customer@example.test', topic: 'Privacy request', message: 'Please provide my account information.', website: '' };
const submit = (data: unknown = valid) => request(app).post('/api/v1/contact').set('Origin', 'http://localhost:3005').send(data);

describe('contact form API', () => {
  it('allows anonymous support requests and passes validated text to delivery', async () => {
    const response = await submit();
    expect(response.status).toBe(200);
    expect(delivery.sent).toEqual([{ email: valid.email, topic: valid.topic, message: valid.message }]);
  });
  it('rejects cross-origin submissions without delivering mail', async () => {
    expect((await request(app).post('/api/v1/contact').set('Origin', 'https://attacker.test').send(valid)).status).toBe(403);
    expect(delivery.sent).toEqual([]);
  });
  it('validates fields and refuses header injection and oversized messages', async () => {
    expect((await submit({ ...valid, email: 'customer@example.test\r\nBcc:other@example.test' })).status).toBe(400);
    expect((await submit({ ...valid, message: 'x'.repeat(5001) })).status).toBe(400);
    expect((await submit({ ...valid, topic: 'Unknown' })).status).toBe(400);
    expect(delivery.sent).toEqual([]);
  });
  it('silently ignores honeypot submissions and does not email the supplied address', async () => {
    expect((await submit({ ...valid, website: 'spam.test' })).status).toBe(200);
    expect(delivery.sent).toEqual([]);
  });
  it('reports real delivery failures instead of claiming success', async () => {
    delivery.succeeds = false;
    const response = await submit();
    expect(response.status).toBe(503);
    expect(response.body.success).toBe(false);
  });
  it('limits repeated submissions and supplies a retry interval', async () => {
    for (let index = 0; index < 5; index++) expect((await submit()).status).toBe(200);
    const refused = await submit();
    expect(refused.status).toBe(429);
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
    expect(delivery.sent).toHaveLength(5);
  });
});
