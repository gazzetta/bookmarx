import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../db/database';
import { getPlanConfig } from './paypal';
import { fulfillLifetimeOrder, paypalRequest, applySubscription } from '../utils/billing';
import type { AuthenticatedRequest } from '../middleware/premium';

const router = Router();
router.post('/create', async (req: AuthenticatedRequest, res) => {
    try {
        const user = req.user!;
        const plan = req.body?.plan;
        const config = typeof plan === 'string' ? getPlanConfig(plan) : null;
        if (!config || (plan !== 'lifetime' && !config.planId)) return res.status(400).json({ success: false, error: { message: 'Choose a configured monthly, yearly or lifetime plan' } });
        const baseUrl = process.env.PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';
        if (process.env.NODE_ENV === 'production' && !baseUrl.startsWith('https://')) throw new Error('HTTPS public checkout URL is required');
        const currency = db.getAppConfig().pricing.currency;
        const context = { brand_name: 'BookMarx', return_url: `${baseUrl}/settings/subscription?success=true&plan=${plan}`,
            cancel_url: `${baseUrl}/settings/subscription?cancelled=true`, user_action: plan === 'lifetime' ? 'PAY_NOW' : 'SUBSCRIBE_NOW', shipping_preference: 'NO_SHIPPING' };
        const result = await paypalRequest(plan === 'lifetime' ? '/v2/checkout/orders' : '/v1/billing/subscriptions', 'POST',
            plan === 'lifetime' ? { intent: 'CAPTURE', purchase_units: [{ amount: { currency_code: currency, value: (config.amount / 100).toFixed(2) },
                description: 'BookMarx Premium — Lifetime Access', custom_id: user.id }], application_context: context }
                : { plan_id: config.planId, custom_id: user.id, subscriber: { email_address: user.email }, application_context: context }, randomUUID());
        const link = result.links?.find((l: any) => l.rel === 'approve');
        if (!result.id || !link?.href || !/^https:\/\/(?:www\.)?(?:sandbox\.)?paypal\.com\//.test(link.href)) throw new Error('PayPal approval link is unavailable');
        db.recordPayPalCheckout(result.id, user.id, plan, config.amount, currency, config.planId);
        return res.json({ success: true, data: { checkoutUrl: link.href } });
    } catch (error) {
        console.error('Checkout creation failed:', error instanceof Error ? error.message : 'Unknown error');
        return res.status(503).json({ success: false, error: { message: 'Checkout is temporarily unavailable. Please try again.' } });
    }
});

router.post('/capture', async (req: AuthenticatedRequest, res) => {
    try {
        const id = req.body?.orderID;
        if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,128}$/.test(id)) return res.status(400).json({ success: false, error: { message: 'A valid orderID is required' } });
        const checkout = db.getPayPalCheckout(id);
        if (!checkout || checkout.userId !== req.user!.id || checkout.planType !== 'lifetime') return res.status(403).json({ success: false, error: { message: 'Order does not belong to this account' } });
        let order = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(id)}`);
        if (order.id !== id || order.purchase_units?.[0]?.custom_id !== req.user!.id) throw new Error('Order ownership does not match');
        if (order.status !== 'COMPLETED') order = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(id)}/capture`, 'POST', {}, `bookmarx-${id}`);
        fulfillLifetimeOrder(order, req.user!.id);
        return res.json({ success: true, data: { status: 'COMPLETED' } });
    } catch (error) {
        console.error('Payment capture failed:', error instanceof Error ? error.message : 'Unknown error');
        return res.status(503).json({ success: false, error: { message: 'Payment could not be confirmed. Please try again.' } });
    }
});

router.post('/confirm-subscription', async (req: AuthenticatedRequest, res) => {
    try {
        const id = req.body?.subscriptionID;
        const checkout = typeof id === 'string' && db.getPayPalCheckout(id);
        if (!checkout || checkout.userId !== req.user!.id || checkout.planType === 'lifetime') return res.status(403).json({ success: false, error: { message: 'Subscription does not belong to this account' } });
        const subscription = await paypalRequest(`/v1/billing/subscriptions/${encodeURIComponent(id)}`);
        const confirmed = db.transaction(() => applySubscription(subscription));
        if (!confirmed) return res.status(202).json({ success: false, error: { code: 'PAYMENT_PENDING', message: 'PayPal has not confirmed a completed payment yet. Please retry confirmation shortly.' } });
        return res.json({ success: true, data: { status: subscription.status } });
    } catch { return res.status(503).json({ success: false, error: { message: 'Subscription confirmation is pending. Please try again.' } }); }
});
export default router;
