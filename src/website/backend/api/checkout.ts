import { Router, Request, Response } from 'express';
import { Polar } from '@polar-sh/sdk';

const router = Router();

// Product IDs mapped to plan names
const PRODUCT_IDS: Record<string, string> = {
    monthly: 'c81d9749-64d8-4d66-b0c7-ff355b9c73ef',
    yearly: '12435426-7250-4d9a-b7eb-e709337b3acb',
    lifetime: 'ec664e38-46b1-4e6f-b125-8251286c8980'
};

function getPolarClient(): Polar | null {
    const token = process.env.POLAR_ACCESS_TOKEN;
    if (!token) {
        console.error('POLAR_ACCESS_TOKEN not configured');
        return null;
    }
    return new Polar({ accessToken: token });
}

/**
 * POST /api/v1/checkout/create
 * Body: { plan: 'monthly' | 'yearly' | 'lifetime' }
 * Requires authentication
 * Returns: { success: true, data: { checkoutUrl: string } }
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
        if (!plan || !PRODUCT_IDS[plan]) {
            return res.status(400).json({
                success: false,
                error: { message: 'Invalid plan. Must be: monthly, yearly, or lifetime' }
            });
        }

        const polar = getPolarClient();
        if (!polar) {
            return res.status(500).json({
                success: false,
                error: { message: 'Payment service not configured' }
            });
        }

        const productId = PRODUCT_IDS[plan];

        const checkout = await polar.checkouts.create({
            products: [productId],
            customerEmail: authUser.email,
            successUrl: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005'}/settings/subscription?success=true`,
        });

        return res.json({
            success: true,
            data: { checkoutUrl: checkout.url }
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

export default router;
