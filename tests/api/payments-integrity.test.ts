import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app, db, dbReady, registerUser, bearer } from '../helpers';
import { applyProviderRefund, applySubscription, fulfillLifetimeOrder } from '../../src/website/backend/utils/billing';

beforeAll(async () => { await dbReady; });
beforeEach(() => {
  vi.stubEnv('PAYPAL_MONTHLY_PLAN_ID', 'P-verified-monthly');
  vi.stubEnv('PAYPAL_CLIENT_ID', 'test-client');
  vi.stubEnv('PAYPAL_CLIENT_SECRET', 'test-secret');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
async function lifetime() {
  const user = await registerUser();
  const orderId = crypto.randomUUID(), captureId = crypto.randomUUID();
  db.recordPayPalCheckout(orderId, user.userId, 'lifetime', 4999, 'USD');
  const order = { id: orderId, status: 'COMPLETED', purchase_units: [{ custom_id: user.userId,
    payments: { captures: [{ id: captureId, status: 'COMPLETED', amount: { value: '49.99', currency_code: 'USD' } }] } }] };
  return { ...user, order, captureId };
}
async function monthly() {
  const user = await registerUser();
  const id = crypto.randomUUID();
  db.recordPayPalCheckout(id, user.userId, 'monthly', 249, 'USD', 'P-verified-monthly');
  const subscription = { id, plan_id: 'P-verified-monthly', custom_id: user.userId, status: 'ACTIVE', billing_info: {
    last_payment: { time: new Date().toISOString(), amount: { value: '2.49', currency_code: 'USD' } },
    next_billing_time: new Date(Date.now() + 30 * 86400000).toISOString(),
  } };
  return { ...user, subscription };
}
function provider(resources: Record<string, any>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => String(url).endsWith('/oauth2/token')
    ? { access_token: 'test-provider-token', expires_in: 3600 }
    : Object.entries(resources).find(([suffix]) => String(url).endsWith(suffix))?.[1] || {} })));
}

describe('verified billing and independent entitlements', () => {
  it('refuses another account capturing an order before making a provider request', async () => {
    const owner = await lifetime(), stranger = await registerUser();
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const response = await request(app).post('/api/v1/checkout/capture').set('Authorization', bearer(stranger.token)).send({ orderID: owner.order.id });
    expect(response.status).toBe(403); expect(fetchMock).not.toHaveBeenCalled();
    expect(db.getUserById(stranger.userId).subscriptionTier).toBe('free');
  });

  it('rejects completed captures with the wrong amount or currency', async () => {
    const user = await lifetime();
    user.order.purchase_units[0].payments.captures[0].amount.value = '0.01';
    expect(() => fulfillLifetimeOrder(user.order, user.userId)).toThrow(/amount/);
    user.order.purchase_units[0].payments.captures[0].amount = { value: '49.99', currency_code: 'GBP' };
    expect(() => fulfillLifetimeOrder(user.order, user.userId)).toThrow(/currency/);
    expect(db.getUserById(user.userId).subscriptionTier).toBe('free');
  });

  it('grants one lifetime entitlement for a repeated completed capture', async () => {
    const user = await lifetime();
    fulfillLifetimeOrder(user.order, user.userId); fulfillLifetimeOrder(user.order, user.userId);
    const active = db.getActiveSubscription(user.userId);
    expect(active.externalSubscriptionId).toBe(user.captureId);
    expect(db.getUserById(user.userId).subscriptionExpiresAt).toBeNull();
  });

  it('returns a retryable pending response when an ACTIVE subscription has no completed payment', async () => {
    const user = await monthly();
    const subscription: any = user.subscription; delete subscription.billing_info.last_payment;
    provider({ [`/v1/billing/subscriptions/${subscription.id}`]: subscription });
    const response = await request(app).post('/api/v1/checkout/confirm-subscription')
      .set('Authorization', bearer(user.token)).send({ subscriptionID: subscription.id });
    expect(response.status).toBe(202); expect(response.body.success).toBe(false);
    expect(db.getUserById(user.userId).subscriptionTier).toBe('free');
  });

  it('keeps the original provider plan and price valid after the current plan configuration changes', async () => {
    const user = await monthly(); vi.stubEnv('PAYPAL_MONTHLY_PLAN_ID', 'P-new-price-plan');
    expect(applySubscription(user.subscription)).toBe(true);
    expect(db.getUserById(user.userId).subscriptionTier).toBe('premium');
  });

  it('retains a cancelled plan until its paid period ends', async () => {
    const user = await monthly(); applySubscription(user.subscription);
    const originalEnd = db.getUserById(user.userId).subscriptionExpiresAt;
    applySubscription({ ...user.subscription, status: 'CANCELLED' });
    expect(db.getUserById(user.userId).subscriptionTier).toBe('premium');
    expect(db.getUserById(user.userId).subscriptionExpiresAt).toBe(originalEnd);
  });

  it('uses the capture referenced by a refund and does not revoke an independent valid plan', async () => {
    const user = await lifetime(); fulfillLifetimeOrder(user.order, user.userId);
    db.createSubscription({ userId: user.userId, planType: 'monthly', status: 'active', amount: 249, currency: 'USD',
      startsAt: Math.floor(Date.now() / 1000), endsAt: Math.floor(Date.now() / 1000) + 3600, paymentProvider: 'paypal', externalSubscriptionId: crypto.randomUUID() });
    provider({ [`/v2/payments/captures/${user.captureId}`]: { id: user.captureId, status: 'REFUNDED' } });
    const event = { id: crypto.randomUUID(), event_type: 'PAYMENT.CAPTURE.REFUNDED', resource: {
      id: 'a-different-refund-id', links: [{ rel: 'up', href: `https://api-m.sandbox.paypal.com/v2/payments/captures/${user.captureId}` }] } };
    await applyProviderRefund(event); await applyProviderRefund(event);
    expect(db.getSubscriptionByExternalId(user.captureId).status).toBe('refunded');
    expect(db.getUserById(user.userId).subscriptionTier).toBe('premium');
    expect(db.getUserById(user.userId).subscriptionExpiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('does not revoke access for a partial refund', async () => {
    const user = await lifetime(); fulfillLifetimeOrder(user.order, user.userId);
    provider({ [`/v2/payments/captures/${user.captureId}`]: { id: user.captureId, status: 'PARTIALLY_REFUNDED' } });
    await applyProviderRefund({ id: crypto.randomUUID(), event_type: 'PAYMENT.CAPTURE.REFUNDED', resource: { supplementary_data: { related_ids: { capture_id: user.captureId } } } });
    expect(db.getUserById(user.userId).subscriptionTier).toBe('premium');
    expect(db.getUserById(user.userId).subscriptionExpiresAt).toBeNull();
  });

  it('does not restore a refunded subscription from an older ACTIVE notification', async () => {
    const user = await monthly(); applySubscription(user.subscription);
    db.updateSubscription(db.getSubscriptionByExternalId(user.subscription.id).id, { status: 'refunded', endsAt: Math.floor(Date.now() / 1000) });
    db.recomputeEntitlement(user.userId);
    user.subscription.billing_info.last_payment.time = new Date(Date.now() - 10000).toISOString();
    expect(applySubscription(user.subscription)).toBe(false);
    expect(db.getUserById(user.userId).subscriptionTier).toBe('free');
  });
});
