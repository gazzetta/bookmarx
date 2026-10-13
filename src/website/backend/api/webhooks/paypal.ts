import { Router } from 'express';
import { db } from '../../db/database';
import { applyProviderRefund, applySubscription, fulfillLifetimeOrder, paypalRequest } from '../../utils/billing';

const router = Router();
router.post('/', async (req, res) => {
    try {
        const webhookId = process.env.PAYPAL_WEBHOOK_ID;
        if (!webhookId) return res.status(503).json({ error: 'Payment webhooks are not configured' });
        const event = req.body;
        if (!event?.id || !event.event_type || !event.resource) return res.status(400).json({ error: 'Invalid webhook event' });
        const names = ['auth-algo', 'cert-url', 'transmission-id', 'transmission-sig', 'transmission-time'];
        if (names.some(name => !req.get(`paypal-${name}`))) return res.status(401).json({ error: 'Missing webhook signature' });
        const verificationBody = {
            auth_algo: req.get('paypal-auth-algo'), cert_url: req.get('paypal-cert-url'),
            transmission_id: req.get('paypal-transmission-id'), transmission_sig: req.get('paypal-transmission-sig'),
            transmission_time: req.get('paypal-transmission-time'), webhook_id: webhookId,
        };
        const rawEvent = (req as any).rawBody;
        if (typeof rawEvent !== 'string') throw new Error('Original webhook payload is required');
        const verification = await paypalRequest('/v1/notifications/verify-webhook-signature', 'POST',
            `${JSON.stringify(verificationBody).slice(0, -1)},"webhook_event":${rawEvent}}`);
        if (verification.verification_status !== 'SUCCESS') return res.status(401).json({ error: 'Invalid signature' });
        if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
            const orderId = event.resource.supplementary_data?.related_ids?.order_id;
            const checkout = orderId && db.getPayPalCheckout(orderId);
            if (!checkout) throw new Error('Payment checkout not found; retry after checkout registration');
            const order = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
            fulfillLifetimeOrder(order, checkout.userId);
            db.processPaymentEvent(event.id, () => {});
        } else if (event.event_type.startsWith('BILLING.SUBSCRIPTION.') || event.event_type === 'PAYMENT.SALE.COMPLETED') {
            const subscriptionId = event.event_type === 'PAYMENT.SALE.COMPLETED' ? event.resource.billing_agreement_id : event.resource.id;
            if (!subscriptionId || !db.getPayPalCheckout(subscriptionId)) throw new Error('Subscription checkout not found');
            const subscription = await paypalRequest(`/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`);
            db.processPaymentEvent(event.id, () => applySubscription(subscription));
        } else if (['PAYMENT.CAPTURE.REFUNDED', 'PAYMENT.CAPTURE.REVERSED', 'PAYMENT.SALE.REFUNDED', 'PAYMENT.SALE.REVERSED'].includes(event.event_type)) {
            await applyProviderRefund(event);
        }
        return res.json({ received: true });
    } catch (error) {
        console.error('PayPal webhook processing failed:', error instanceof Error ? error.message : 'Unknown error');
        return res.status(503).json({ error: 'Payment processing failed; retry delivery' });
    }
});
export default router;
