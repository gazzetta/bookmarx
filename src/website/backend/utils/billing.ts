import { db } from '../db/database';
import { getAccessToken, getPayPalApiBase, getPlanConfig } from '../api/paypal';

export async function paypalRequest(resource: string, method = 'GET', body?: unknown, requestId?: string): Promise<any> {
    const token = await getAccessToken();
    const response = await fetch(`${getPayPalApiBase()}${resource}`, {
        method, signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
            ...(requestId ? { 'PayPal-Request-Id': requestId } : {}) },
        ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error(`PayPal request failed (${response.status})`);
    return response.json();
}

export function fulfillLifetimeOrder(order: any, userId: string): void {
    const checkout = db.getPayPalCheckout(order.id);
    if (!checkout || checkout.userId !== userId || checkout.planType !== 'lifetime') throw new Error('Order does not belong to this account');
    const units = order.purchase_units;
    if (order.status !== 'COMPLETED' || !Array.isArray(units) || units.length !== 1 || units[0].custom_id !== userId) throw new Error('Payment has not completed for this account');
    const captures = units[0].payments?.captures;
    if (!Array.isArray(captures) || captures.length !== 1) throw new Error('Invalid payment capture');
    const capture = captures[0];
    if (!capture.id || capture.status !== 'COMPLETED' || capture.amount?.currency_code !== checkout.currency ||
        Math.round(Number(capture.amount?.value) * 100) !== checkout.amount) throw new Error('Payment amount or currency does not match');
    db.processPaymentEvent(`capture:${capture.id}`, () => {
        db.createSubscription({ userId, planType: 'lifetime', status: 'active', amount: checkout.amount,
            currency: checkout.currency, startsAt: Math.floor(Date.now() / 1000), paymentProvider: 'paypal', externalSubscriptionId: capture.id });
        db.recomputeEntitlement(userId);
    });
}

export function applySubscription(subscription: any): boolean {
    const checkout = db.getPayPalCheckout(subscription.id);
    if (!checkout || checkout.planType === 'lifetime' || subscription.custom_id !== checkout.userId) throw new Error('Unknown subscription');
    const plan = getPlanConfig(checkout.planType);
    const expectedPlanId = checkout.providerPlanId || plan?.planId;
    if (!expectedPlanId || subscription.plan_id !== expectedPlanId) throw new Error('Unrecognised subscription plan');
    const end = Math.floor(Date.parse(subscription.billing_info?.next_billing_time || '') / 1000);
    const existing = db.getSubscriptionByExternalId(subscription.id);
    const now = Math.floor(Date.now() / 1000);
    const paid = subscription.billing_info?.last_payment;
    const validPayment = paid && paid.amount?.currency_code === checkout.currency && Math.round(Number(paid.amount?.value) * 100) === checkout.amount;
    let status = 'expired';
    if (subscription.status === 'ACTIVE' && validPayment && Number.isFinite(end) && end > now) {
        // A stale ACTIVE notification must not restore a refunded billing period.
        if (existing?.status === 'refunded' && !(Math.floor(Date.parse(paid.time || '') / 1000) > (existing.endsAt || now))) return false;
        status = 'active';
    }
    else if (subscription.status === 'CANCELLED' && existing) status = 'cancelled';
    else if (!['SUSPENDED', 'EXPIRED'].includes(subscription.status)) return false;
    if (!existing && status !== 'active') return false;
    if (existing) db.updateSubscription(existing.id, { status, ...(status === 'active' ? { endsAt: end } : {}), ...(status === 'cancelled' ? { cancelledAt: now } : {}) });
    else db.createSubscription({ userId: checkout.userId, planType: checkout.planType, status, amount: checkout.amount,
        currency: checkout.currency, startsAt: now, endsAt: end, paymentProvider: 'paypal', externalSubscriptionId: subscription.id });
    db.recomputeEntitlement(checkout.userId);
    return status === 'active';
}

export async function applyProviderRefund(event: any): Promise<void> {
    const capture = event.event_type.startsWith('PAYMENT.CAPTURE.');
    const resource = event.resource;
    let paymentId = resource.supplementary_data?.related_ids?.capture_id || resource.sale_id || resource.id;
    // Refund IDs differ from capture IDs. Follow only the identifier in a recognised resource
    // path, then query our configured PayPal API; never fetch a webhook-supplied URL directly.
    const up = resource.links?.find((link: any) => link.rel === 'up')?.href;
    if (up) {
        const pathname = new URL(up).pathname;
        const match = pathname.match(capture ? /^\/v2\/payments\/captures\/([a-zA-Z0-9-]+)$/ : /^\/v1\/payments\/sale\/([a-zA-Z0-9-]+)$/);
        if (match) paymentId = match[1];
    }
    if (typeof paymentId !== 'string' || !/^[a-zA-Z0-9-]{1,128}$/.test(paymentId)) throw new Error('Refund payment identifier is missing');
    const payment = await paypalRequest(capture ? `/v2/payments/captures/${paymentId}` : `/v1/payments/sale/${paymentId}`);
    if (payment.id !== paymentId) throw new Error('Refund payment identity does not match');
    const status = String(payment.status || payment.state).toUpperCase();
    if (status === 'PARTIALLY_REFUNDED') { db.processPaymentEvent(event.id, () => {}); return; }
    if (!['REFUNDED', 'REVERSED', 'DECLINED', 'DENIED'].includes(status)) throw new Error('PayPal has not confirmed the refund or reversal');
    const entitlementId = capture ? payment.id : payment.billing_agreement_id;
    const entitlement = entitlementId && db.getSubscriptionByExternalId(entitlementId);
    if (!entitlement) throw new Error('Refunded payment entitlement not found');
    if (!capture) {
        const current = await paypalRequest(`/v1/billing/subscriptions/${encodeURIComponent(entitlementId)}`);
        const latestPayment = Date.parse(current.billing_info?.last_payment?.time || '');
        const refundedPayment = Date.parse(payment.create_time || '');
        if (Number.isFinite(latestPayment) && Number.isFinite(refundedPayment) && latestPayment > refundedPayment + 60000) {
            db.processPaymentEvent(event.id, () => {});
            return; // A refund of an older period must not revoke a newer paid period.
        }
    }
    db.processPaymentEvent(event.id, () => {
        db.updateSubscription(entitlement.id, { status: 'refunded', endsAt: Math.floor(Date.now() / 1000) });
        db.recomputeEntitlement(entitlement.userId);
    });
}
