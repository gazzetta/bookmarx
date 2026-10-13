/**
 * PayPal REST API helper — token caching + base URL resolution.
 * Used by checkout.ts and webhooks/paypal.ts.
 */

import { db } from '../db/database';
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

export function getPayPalApiBase(): string {
    return process.env.PAYPAL_API_BASE || 
        (process.env.PAYPAL_ENVIRONMENT === 'live' 
            ? 'https://api-m.paypal.com' 
            : 'https://api-m.sandbox.paypal.com');
}

export async function getAccessToken(): Promise<string> {
    // Return cached token if still valid (with 60s buffer)
    if (cachedToken && Date.now() < tokenExpiresAt - 60000) {
        return cachedToken;
    }

    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    const base = getPayPalApiBase();

    if (!clientId || !clientSecret) {
        throw new Error('PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be configured');
    }

    const response = await fetch(`${base}/v1/oauth2/token`, {
        signal: AbortSignal.timeout(15000),
        method: 'POST',
        headers: {
            Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`PayPal auth failed: ${response.status} ${text}`);
    }

    const data = await response.json() as { access_token: string; expires_in: number };
    cachedToken = data.access_token;
    tokenExpiresAt = Date.now() + data.expires_in * 1000;
    return cachedToken;
}

export interface PayPalPlanConfig {
    planId: string;
    amount: number;
    planType: 'monthly' | 'yearly' | 'lifetime';
}

export function getPlanConfig(plan: string): PayPalPlanConfig | null {
    const prices = db.getAppConfig().pricing;
    switch (plan) {
        case 'monthly':
            return {
                planId: process.env.PAYPAL_MONTHLY_PLAN_ID || '',
                amount: prices.monthly,
                planType: 'monthly',
            };
        case 'yearly':
            return {
                planId: process.env.PAYPAL_YEARLY_PLAN_ID || '',
                amount: prices.yearly,
                planType: 'yearly',
            };
        case 'lifetime':
            return {
                planId: process.env.PAYPAL_LIFETIME_PRODUCT_ID || '',
                amount: prices.lifetime,
                planType: 'lifetime',
            };
        default:
            return null;
    }
}
