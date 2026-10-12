import { Router, Request, Response } from 'express';
import { getAccessToken, getPlanConfig, getPayPalApiBase } from './paypal';

const router = Router();

/**
 * POST /api/v1/checkout/create
 * Body: { plan: 'monthly' | 'yearly' | 'lifetime' }
 * Requires authentication
 * Returns: { success: true, data: { checkoutUrl: string } }
 *
 * For monthly/yearly: creates a PayPal subscription via Subscriptions API
 * For lifetime: creates a PayPal order via Orders API (one-time payment)
 */
router.post('/create', async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string; email: string } }).user;
        if (!authUser) {
            return res.status(401).json({
                success: false,
                error: { message: 'Unauthorized' }
            });
        }

        const { plan } = req.body as { plan?: string };
        const planConfig = plan ? getPlanConfig(plan) : null;
        if (!planConfig || !planConfig.planId) {
            return res.status(400).json({
                success: false,
                error: { message: 'Invalid plan. Must be: monthly, yearly, or lifetime' }
            });
        }

        const token = await getAccessToken();
        const base = getPayPalApiBase();
        const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';

        let checkoutUrl: string;

        if (plan === 'lifetime') {
            // One-time payment via Orders API
            const orderResponse = await fetch(`${base}/v2/checkout/orders`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    intent: 'CAPTURE',
                    purchase_units: [
                        {
                            amount: {
                                currency_code: 'USD',
                                value: '49.99',
                            },
                            description: 'BookMarx Premium — Lifetime Access',
                            custom_id: authUser.id,
                        },
                    ],
                    application_context: {
                        brand_name: 'BookMarx',
                        return_url: `${baseUrl}/settings/subscription?success=true`,
                        cancel_url: `${baseUrl}/settings/subscription?cancelled=true`,
                        user_action: 'PAY_NOW',
                        shipping_preference: 'NO_SHIPPING',
                    },
                }),
            });

            if (!orderResponse.ok) {
                const text = await orderResponse.text();
                console.error('PayPal order creation failed:', text);
                return res.status(500).json({
                    success: false,
                    error: { message: 'Failed to create checkout session' }
                });
            }

            const order = await orderResponse.json() as {
                links: { rel: string; href: string }[];
            };
            const approveLink = order.links.find(l => l.rel === 'approve');
            if (!approveLink) {
                console.error('PayPal order missing approve link:', JSON.stringify(order));
                return res.status(500).json({
                    success: false,
                    error: { message: 'Failed to create checkout session' }
                });
            }
            checkoutUrl = approveLink.href;

        } else {
            // Subscription via Subscriptions API
            const subResponse = await fetch(`${base}/v1/billing/subscriptions`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    plan_id: planConfig.planId,
                    custom_id: authUser.id,
                    subscriber: {
                        email_address: authUser.email,
                    },
                    application_context: {
                        brand_name: 'BookMarx',
                        return_url: `${baseUrl}/settings/subscription?success=true`,
                        cancel_url: `${baseUrl}/settings/subscription?cancelled=true`,
                        user_action: 'SUBSCRIBE_NOW',
                        shipping_preference: 'NO_SHIPPING',
                    },
                }),
            });

            if (!subResponse.ok) {
                const text = await subResponse.text();
                console.error('PayPal subscription creation failed:', text);
                return res.status(500).json({
                    success: false,
                    error: { message: 'Failed to create checkout session' }
                });
            }

            const subscription = await subResponse.json() as {
                links: { rel: string; href: string }[];
            };
            const approveLink = subscription.links.find(l => l.rel === 'approve');
            if (!approveLink) {
                console.error('PayPal subscription missing approve link:', JSON.stringify(subscription));
                return res.status(500).json({
                    success: false,
                    error: { message: 'Failed to create checkout session' }
                });
            }
            checkoutUrl = approveLink.href;
        }

        return res.json({
            success: true,
            data: { checkoutUrl }
        });
    } catch (err) {
        const error = err as Error;
        console.error('Failed to create checkout session:', error);
        return res.status(500).json({
            success: false,
            error: { message: 'Failed to create checkout session' }
        });
    }
});

/**
 * POST /api/v1/checkout/capture
 * Body: { orderID: string }
 * Requires authentication
 * Captures a one-time (lifetime) PayPal order after user approval.
 * Returns: { success: true }
 */
router.post('/capture', async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string; email: string } }).user;
        if (!authUser) {
            return res.status(401).json({
                success: false,
                error: { message: 'Unauthorized' }
            });
        }

        const { orderID } = req.body as { orderID?: string };
        if (!orderID) {
            return res.status(400).json({
                success: false,
                error: { message: 'orderID is required' }
            });
        }

        const token = await getAccessToken();
        const base = getPayPalApiBase();

        const captureResponse = await fetch(`${base}/v2/checkout/orders/${orderID}/capture`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });

        if (!captureResponse.ok) {
            const text = await captureResponse.text();
            console.error('PayPal capture failed:', text);
            return res.status(500).json({
                success: false,
                error: { message: 'Failed to capture payment' }
            });
        }

        const capture = await captureResponse.json() as {
            status: string;
        };

        return res.json({
            success: true,
            data: { status: capture.status }
        });
    } catch (err) {
        const error = err as Error;
        console.error('Failed to capture payment:', error);
        return res.status(500).json({
            success: false,
            error: { message: 'Failed to capture payment' }
        });
    }
});

export default router;
