import { Router, Request, Response } from 'express';
import * as crypto from 'crypto';
import { db } from '../../db/database';

const router = Router();

// Premium tier limits
const PREMIUM_LIMITS = {
    bookmarkLimit: 10000,
    browserLimit: 999,  // Effectively unlimited
    collectionLimit: 999  // Effectively unlimited
};

const FREE_LIMITS = {
    bookmarkLimit: 250,
    browserLimit: 2,
    collectionLimit: 1
};

// Polar plan IDs (configure these in your Polar dashboard)
const POLAR_PLANS: Record<string, { planType: string; amount: number }> = {
    'c81d9749-64d8-4d66-b0c7-ff355b9c73ef': { planType: 'monthly', amount: 249 },    // $2.49
    '12435426-7250-4d9a-b7eb-e709337b3acb': { planType: 'yearly', amount: 2499 },   // $24.99
    'ec664e38-46b1-4e6f-b125-8251286c8980': { planType: 'lifetime', amount: 4999 }  // $49.99
};

/**
 * Verify Polar webhook signature
 */
function verifyPolarSignature(payload: string, signature: string, secret: string): boolean {
    if (!secret) {
        console.warn('POLAR_WEBHOOK_SECRET not configured, skipping signature verification');
        return true; // Skip verification in development
    }
    
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');
    
    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    
    if (sigBuffer.length !== expectedBuffer.length) {
        return false;
    }
    
    return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}

/**
 * Find user by email or Polar customer ID
 */
function findUser(polarCustomerId: string, email?: string): any {
    // First try by Polar customer ID
    let user = db.getUserByPolarCustomerId(polarCustomerId);
    if (user) return user;

    // Try by email
    if (email) {
        user = db.getUserByEmail(email);
        if (user) {
            // Link Polar customer ID to this user
            db.updateUserSubscription(user.id, { polarCustomerId });
            return user;
        }
    }

    return null;
}

/**
 * Upgrade user to premium
 */
function upgradeToPremium(userId: string, subscriptionExpiresAt: number | null) {
    db.updateUserSubscription(userId, {
        subscriptionTier: 'premium',
        subscriptionExpiresAt,
        ...PREMIUM_LIMITS
    });
    console.log(`User ${userId} upgraded to premium`);
}

/**
 * Downgrade user to free
 */
function downgradeToFree(userId: string) {
    db.updateUserSubscription(userId, {
        subscriptionTier: 'free',
        subscriptionExpiresAt: null,
        ...FREE_LIMITS
    });
    console.log(`User ${userId} downgraded to free`);
}

/**
 * POST /api/webhooks/polar
 * Handle Polar webhook events
 * 
 * Events:
 * - checkout.created: User started checkout
 * - subscription.created: New subscription activated
 * - subscription.updated: Subscription renewed or changed
 * - subscription.canceled: User canceled (still active until period end)
 * - subscription.revoked: Subscription ended (payment failed, period ended)
 * - order.created: One-time purchase (lifetime)
 */
router.post('/', async (req: Request, res: Response) => {
    try {
        const signature = req.headers['polar-signature'] as string || '';
        const webhookSecret = process.env.POLAR_WEBHOOK_SECRET || '';

        // Verify signature
        const rawBody = JSON.stringify(req.body);
        if (webhookSecret && !verifyPolarSignature(rawBody, signature, webhookSecret)) {
            console.error('Invalid Polar webhook signature');
            return res.status(401).json({ error: 'Invalid signature' });
        }

        const event = req.body;
        const eventType = event.type;
        const data = event.data;

        console.log(`Polar webhook received: ${eventType}`);
        console.log('Event data:', JSON.stringify(data, null, 2));

        switch (eventType) {
            case 'checkout.created':
                // User started checkout - no action needed
                console.log(`Checkout started for ${data.customer_email}`);
                break;

            case 'subscription.created':
            case 'subscription.updated': {
                const customerId = data.customer_id;
                const customerEmail = data.customer_email;
                const productId = data.product_id;
                const status = data.status;
                const externalSubscriptionId = data.id;
                const currentPeriodEnd = data.current_period_end 
                    ? Math.floor(new Date(data.current_period_end).getTime() / 1000)
                    : null;

                const user = findUser(customerId, customerEmail);
                if (!user) {
                    console.error(`User not found for Polar customer ${customerId} (${customerEmail})`);
                    // Still return 200 to acknowledge receipt
                    return res.json({ received: true, warning: 'User not found' });
                }

                // Get plan info
                const planInfo = POLAR_PLANS[productId] || { planType: 'unknown', amount: 0 };

                if (status === 'active' || status === 'trialing') {
                    // Create or update subscription record
                    const existingSub = db.getSubscriptionByExternalId(externalSubscriptionId);
                    
                    if (existingSub) {
                        db.updateSubscription(existingSub.id, {
                            status: 'active',
                            endsAt: currentPeriodEnd || undefined
                        });
                    } else {
                        db.createSubscription({
                            userId: user.id,
                            planType: planInfo.planType,
                            status: 'active',
                            amount: planInfo.amount,
                            startsAt: Math.floor(Date.now() / 1000),
                            endsAt: currentPeriodEnd || undefined,
                            paymentProvider: 'polar',
                            externalSubscriptionId,
                            externalCustomerId: customerId
                        });
                    }

                    // Upgrade user
                    upgradeToPremium(user.id, currentPeriodEnd);
                }
                break;
            }

            case 'subscription.canceled': {
                const customerId = data.customer_id;
                const externalSubscriptionId = data.id;
                const currentPeriodEnd = data.current_period_end 
                    ? Math.floor(new Date(data.current_period_end).getTime() / 1000)
                    : null;

                const user = findUser(customerId);
                if (!user) {
                    console.error(`User not found for Polar customer ${customerId}`);
                    return res.json({ received: true, warning: 'User not found' });
                }

                // Update subscription record
                const existingSub = db.getSubscriptionByExternalId(externalSubscriptionId);
                if (existingSub) {
                    db.updateSubscription(existingSub.id, {
                        status: 'cancelled',
                        cancelledAt: Math.floor(Date.now() / 1000)
                    });
                }

                // User keeps premium until period ends
                // They'll be downgraded when subscription.revoked is received
                // or by a cron job checking expirations
                console.log(`Subscription canceled for user ${user.id}, expires at ${currentPeriodEnd}`);
                break;
            }

            case 'subscription.revoked': {
                const customerId = data.customer_id;
                const externalSubscriptionId = data.id;

                const user = findUser(customerId);
                if (!user) {
                    console.error(`User not found for Polar customer ${customerId}`);
                    return res.json({ received: true, warning: 'User not found' });
                }

                // Update subscription record
                const existingSub = db.getSubscriptionByExternalId(externalSubscriptionId);
                if (existingSub) {
                    db.updateSubscription(existingSub.id, {
                        status: 'expired'
                    });
                }

                // Downgrade user
                downgradeToFree(user.id);
                break;
            }

            case 'order.created': {
                // One-time purchase (lifetime)
                const customerId = data.customer_id;
                const customerEmail = data.customer_email;
                const productId = data.product_id;
                const orderId = data.id;

                // Only handle lifetime purchases
                if (productId !== 'ec664e38-46b1-4e6f-b125-8251286c8980') {
                    console.log(`Order ${orderId} is not a lifetime purchase, skipping`);
                    break;
                }

                const user = findUser(customerId, customerEmail);
                if (!user) {
                    console.error(`User not found for Polar customer ${customerId} (${customerEmail})`);
                    return res.json({ received: true, warning: 'User not found' });
                }

                // Create subscription record for lifetime
                db.createSubscription({
                    userId: user.id,
                    planType: 'lifetime',
                    status: 'active',
                    amount: 4999, // $49.99
                    startsAt: Math.floor(Date.now() / 1000),
                    endsAt: undefined, // Never expires
                    paymentProvider: 'polar',
                    externalSubscriptionId: orderId,
                    externalCustomerId: customerId
                });

                // Upgrade user (null expiration = lifetime)
                upgradeToPremium(user.id, null);
                break;
            }

            default:
                console.log(`Unhandled Polar event type: ${eventType}`);
        }

        res.json({ received: true });
    } catch (err) {
        const error = err as Error;
        console.error('Polar webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

export default router;
