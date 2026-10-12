import { Router, Request, Response } from 'express';
import { db } from '../../db/database';
import { getAccessToken, getPayPalApiBase } from '../paypal';

const router = Router();

const PREMIUM_LIMITS = {
    bookmarkLimit: 10000,
    browserLimit: 999,
    collectionLimit: 999
};

const FREE_LIMITS = {
    bookmarkLimit: 250,
    browserLimit: 2,
    collectionLimit: 1
};

const PLAN_AMOUNTS: Record<string, number> = {
    monthly: 249,
    yearly: 2499,
    lifetime: 4999
};

/**
 * Verify PayPal webhook signature via PayPal's verify-webhook-signature API.
 */
async function verifyWebhookSignature(
    headers: Record<string, string>,
    body: any
): Promise<boolean> {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    if (!webhookId) {
        console.warn('PAYPAL_WEBHOOK_ID not configured, skipping signature verification');
        return true;
    }

    const token = await getAccessToken();
    const base = getPayPalApiBase();

    const verification = {
        auth_algo: headers['paypal-auth-algo'] || '',
        cert_url: headers['paypal-cert-url'] || '',
        transmission_id: headers['paypal-transmission-id'] || '',
        transmission_sig: headers['paypal-transmission-sig'] || '',
        transmission_time: headers['paypal-transmission-time'] || '',
        webhook_id: webhookId,
        webhook_event: body,
    };

    const response = await fetch(`${base}/v1/notifications/verify-webhook-signature`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(verification),
    });

    if (!response.ok) {
        const text = await response.text();
        console.error('PayPal webhook verification request failed:', text);
        return false;
    }

    const result = await response.json() as { verification_status: string };
    return result.verification_status === 'SUCCESS';
}

/**
 * Find user by custom_id (our userId stored in PayPal subscription/order)
 * or by subscriber email.
 */
function findUser(customId: string | undefined, email: string | undefined): any {
    if (customId) {
        const user = db.getUserById(customId);
        if (user) return user;
    }
    if (email) {
        const user = db.getUserByEmail(email);
        if (user) return user;
    }
    return null;
}

function upgradeToPremium(userId: string, subscriptionExpiresAt: number | null) {
    db.updateUserSubscription(userId, {
        subscriptionTier: 'premium',
        subscriptionExpiresAt,
        ...PREMIUM_LIMITS
    });
    console.log(`User ${userId} upgraded to premium (expires: ${subscriptionExpiresAt})`);
}

function downgradeToFree(userId: string) {
    db.updateUserSubscription(userId, {
        subscriptionTier: 'free',
        subscriptionExpiresAt: null,
        ...FREE_LIMITS
    });
    console.log(`User ${userId} downgraded to free`);
}

/**
 * Determine plan type from PayPal plan_id by checking our env-configured plan IDs.
 */
function getPlanTypeFromPlanId(planId: string): string {
    if (planId === process.env.PAYPAL_MONTHLY_PLAN_ID) return 'monthly';
    if (planId === process.env.PAYPAL_YEARLY_PLAN_ID) return 'yearly';
    return 'unknown';
}

/**
 * POST /api/webhooks/paypal
 * Handle PayPal webhook events.
 *
 * Events:
 * - BILLING.SUBSCRIPTION.ACTIVATED: New subscription activated
 * - BILLING.SUBSCRIPTION.UPDATED: Subscription renewed or changed
 * - BILLING.SUBSCRIPTION.CANCELLED: User cancelled (still active until period end)
 * - BILLING.SUBSCRIPTION.EXPIRED: Subscription ended
 * - PAYMENT.SALE.COMPLETED: One-time payment completed (lifetime)
 */
router.post('/', async (req: Request, res: Response) => {
    try {
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.headers)) {
            if (key.startsWith('paypal-') && typeof value === 'string') {
                headers[key] = value;
            }
        }

        const event = req.body;
        const eventType: string = event.event_type;
        const resource = event.resource;

        console.log(`PayPal webhook received: ${eventType}`);

        // Verify signature
        const isValid = await verifyWebhookSignature(headers, event);
        if (!isValid) {
            console.error('Invalid PayPal webhook signature');
            return res.status(401).json({ error: 'Invalid signature' });
        }

        switch (eventType) {
            case 'BILLING.SUBSCRIPTION.ACTIVATED':
            case 'BILLING.SUBSCRIPTION.UPDATED': {
                const subscriptionId: string = resource.id;
                const planId: string = resource.plan_id;
                const customId: string | undefined = resource.custom_id;
                const subscriberEmail: string | undefined = resource.subscriber?.email_address;
                const status: string = resource.status;
                const billingInfo = resource.billing_info;
                const nextBillingTime: string | undefined = billingInfo?.next_billing_time;

                const user = findUser(customId, subscriberEmail);
                if (!user) {
                    console.error(`User not found for PayPal subscription ${subscriptionId} (custom_id: ${customId}, email: ${subscriberEmail})`);
                    return res.json({ received: true, warning: 'User not found' });
                }

                const planType = getPlanTypeFromPlanId(planId);
                const amount = PLAN_AMOUNTS[planType] || 0;
                const currentPeriodEnd = nextBillingTime
                    ? Math.floor(new Date(nextBillingTime).getTime() / 1000)
                    : null;

                if (status === 'ACTIVE' || status === 'APPROVAL_PENDING') {
                    const existingSub = db.getSubscriptionByExternalId(subscriptionId);

                    if (existingSub) {
                        db.updateSubscription(existingSub.id, {
                            status: 'active',
                            endsAt: currentPeriodEnd || undefined
                        });
                    } else {
                        db.createSubscription({
                            userId: user.id,
                            planType,
                            status: 'active',
                            amount,
                            startsAt: Math.floor(Date.now() / 1000),
                            endsAt: currentPeriodEnd || undefined,
                            paymentProvider: 'paypal',
                            externalSubscriptionId: subscriptionId,
                            externalCustomerId: resource.subscriber?.payer_id || customId || ''
                        });
                    }

                    if (status === 'ACTIVE') {
                        upgradeToPremium(user.id, currentPeriodEnd);
                    }
                }
                break;
            }

            case 'BILLING.SUBSCRIPTION.CANCELLED': {
                const subscriptionId: string = resource.id;
                const customId: string | undefined = resource.custom_id;
                const subscriberEmail: string | undefined = resource.subscriber?.email_address;

                const user = findUser(customId, subscriberEmail);
                if (!user) {
                    console.error(`User not found for PayPal subscription ${subscriptionId}`);
                    return res.json({ received: true, warning: 'User not found' });
                }

                const existingSub = db.getSubscriptionByExternalId(subscriptionId);
                if (existingSub) {
                    db.updateSubscription(existingSub.id, {
                        status: 'cancelled',
                        cancelledAt: Math.floor(Date.now() / 1000)
                    });
                }

                // User keeps premium until period end — downgrade on EXPIRED
                console.log(`Subscription cancelled for user ${user.id}`);
                break;
            }

            case 'BILLING.SUBSCRIPTION.EXPIRED': {
                const subscriptionId: string = resource.id;
                const customId: string | undefined = resource.custom_id;
                const subscriberEmail: string | undefined = resource.subscriber?.email_address;

                const user = findUser(customId, subscriberEmail);
                if (!user) {
                    console.error(`User not found for PayPal subscription ${subscriptionId}`);
                    return res.json({ received: true, warning: 'User not found' });
                }

                const existingSub = db.getSubscriptionByExternalId(subscriptionId);
                if (existingSub) {
                    db.updateSubscription(existingSub.id, {
                        status: 'expired'
                    });
                }

                downgradeToFree(user.id);
                break;
            }

            case 'PAYMENT.SALE.COMPLETED': {
                // One-time payment (lifetime)
                const customId: string | undefined = resource.custom_id;
                const payerEmail: string | undefined = resource.payer?.email_address;
                const saleId: string = resource.id;

                const user = findUser(customId, payerEmail);
                if (!user) {
                    // Try to find from parent payment if custom_id not directly available
                    console.error(`User not found for PayPal sale ${saleId} (custom_id: ${customId}, email: ${payerEmail})`);
                    return res.json({ received: true, warning: 'User not found' });
                }

                const existingSub = db.getSubscriptionByExternalId(saleId);
                if (!existingSub) {
                    db.createSubscription({
                        userId: user.id,
                        planType: 'lifetime',
                        status: 'active',
                        amount: PLAN_AMOUNTS.lifetime,
                        startsAt: Math.floor(Date.now() / 1000),
                        endsAt: undefined,
                        paymentProvider: 'paypal',
                        externalSubscriptionId: saleId,
                        externalCustomerId: resource.payer?.payer_id || customId || ''
                    });
                }

                // Lifetime = null expiration = never expires
                upgradeToPremium(user.id, null);
                break;
            }

            default:
                console.log(`Unhandled PayPal event type: ${eventType}`);
        }

        res.json({ received: true });
    } catch (err) {
        const error = err as Error;
        console.error('PayPal webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

export default router;
