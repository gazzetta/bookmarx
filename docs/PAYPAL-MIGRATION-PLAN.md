# BookMarx — PayPal Advanced Payments Migration Plan

> Migrating payment processing from Polar to PayPal Advanced Payments (PayPal Complete Payments / PayPal Commerce Platform).

## Current State (Polar)

| Component | File | What it does |
|---|---|---|
| Checkout API | `src/website/backend/api/checkout.ts` | Server-side Polar SDK call to create a checkout session, returns `checkoutUrl` |
| Webhook handler | `src/website/backend/api/webhooks/polar.ts` | Handles `subscription.created/updated/canceled/revoked` + `order.created` (lifetime). Verifies HMAC-SHA256 signature, upgrades/downgrades users, creates subscription records |
| Server wiring | `src/website/backend/server.ts:17,831-835` | Imports + mounts checkout router at `/api/v1/checkout` and webhook router at `/api/webhooks/polar` |
| Frontend subscription page | `src/website/app/settings/subscription/page.tsx` | Calls `api.createCheckout(token, plan)`, opens checkout URL in new tab, "Billing Portal" button links to Polar portal |
| Frontend API client | `src/website/lib/api.ts:339-343` | `createCheckout()` → `POST /api/v1/checkout/create` |
| Database | `src/website/backend/db/database.ts` | `users.polarCustomerId` column, `subscriptions` table with `paymentProvider` defaulting to `'polar'` |
| Premium middleware | `src/website/backend/middleware/premium.ts` | Checks `subscriptionTier`, `subscriptionExpiresAt`, returns upgrade URLs |
| Landing page | `src/website/app/page.tsx:598` | "Secure payments powered by Polar" text |
| Env vars | `.env.local`, `.env.production` | `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET` |
| Product IDs | Hardcoded in `checkout.ts` + `polar.ts` | Monthly `c81d...`, Yearly `1243...`, Lifetime `ec66...` |

## Target State (PayPal Advanced Payments)

PayPal Advanced Payments allows:
- Hosted checkout fields (PayPal-hosted smart buttons + card fields)
- Server-side order creation via PayPal Orders API v2
- Webhooks for subscription/billing events
- Subscription billing via PayPal Subscriptions API
- One-time payments for lifetime plan

## Migration Steps

### Phase 1: PayPal Business Setup (Human — before any code changes)

- [ ] **1.1** Create a PayPal Business account (or use existing BookMarx one)
- [ ] **1.2** Enable PayPal Advanced Payments / PayPal Commerce Platform on the account
- [ ] **1.3** Create a REST app in PayPal Developer Dashboard → get `Client ID` + `Client Secret`
- [ ] **1.4** Set up sandbox credentials (separate `Client ID` + `Client Secret` for testing)
- [ ] **1.5** Create subscription plans in PayPal:
  - Monthly: $2.49/mo (no trial — billed immediately)
  - Yearly: $24.99/yr
  - Lifetime: $49.99 one-time (use Orders API, not Subscriptions)
- [ ] **1.6** Note the PayPal plan IDs for monthly + yearly, and product ID for lifetime
- [ ] **1.7** Configure webhook URL: `https://www.bookmarx.cc/api/webhooks/paypal`
- [ ] **1.8** Subscribe to webhook events:
  - `BILLING.SUBSCRIPTION.ACTIVATED`
  - `BILLING.SUBSCRIPTION.UPDATED`
  - `BILLING.SUBSCRIPTION.CANCELLED`
  - `BILLING.SUBSCRIPTION.EXPIRED`
  - `PAYMENT.SALE.COMPLETED` (for lifetime one-time payments)
  - `PAYMENT.SALE.REFUNDED` (optional)
- [ ] **1.9** Note the webhook ID (PayPal assigns one when you subscribe to events)

### Phase 2: Environment Variables

- [ ] **2.1** Add to `.env.local` (dev/sandbox):
  ```
  PAYPAL_CLIENT_ID=<sandbox client id>
  PAYPAL_CLIENT_SECRET=<sandbox client secret>
  PAYPAL_WEBHOOK_ID=<sandbox webhook id>
  PAYPAL_ENVIRONMENT=sandbox
  PAYPAL_MONTHLY_PLAN_ID=<sandbox monthly plan id>
  PAYPAL_YEARLY_PLAN_ID=<sandbox yearly plan id>
  PAYPAL_LIFETIME_PRODUCT_ID=<sandbox lifetime product id>
  ```
- [ ] **2.2** Add to `.env.production` (live):
  ```
  PAYPAL_CLIENT_ID=<live client id>
  PAYPAL_CLIENT_SECRET=<live client secret>
  PAYPAL_WEBHOOK_ID=<live webhook id>
  PAYPAL_ENVIRONMENT=live
  PAYPAL_MONTHLY_PLAN_ID=<live monthly plan id>
  PAYPAL_YEARLY_PLAN_ID=<live yearly plan id>
  PAYPAL_LIFETIME_PRODUCT_ID=<live lifetime product id>
  ```
- [ ] **2.3** Keep `POLAR_*` env vars in place during transition (allows rollback)

### Phase 3: Install PayPal SDK

- [ ] **3.1** Install `@paypal/checkout-server-sdk` or use raw REST API calls via `fetch`/`axios` (recommended — the official SDK is deprecated, raw REST is the current approach)
- [ ] **3.2** Add PayPal API base URL helper:
  - Sandbox: `https://api-m.sandbox.paypal.com`
  - Live: `https://api-m.paypal.com`

### Phase 4: Backend — Checkout API (`src/website/backend/api/checkout.ts`)

- [ ] **4.1** Replace Polar SDK import with PayPal REST calls
- [ ] **4.2** Add PayPal OAuth2 token caching (PayPal access tokens expire after ~9 hours; cache and refresh)
- [ ] **4.3** Rewrite `POST /create` handler:
  - For `monthly` / `yearly`: call PayPal Subscriptions API `POST /v1/billing/subscriptions` with the plan ID, return `approveUrl` (PayPal returns `links[].rel == "approve"`)
  - For `lifetime`: call PayPal Orders API `POST /v2/checkout/orders` with amount $49.99, return `approveUrl`
- [ ] **4.4** Response shape stays the same: `{ success: true, data: { checkoutUrl: string } }` — frontend doesn't need to change
- [ ] **4.5** Add a new endpoint `POST /api/v1/checkout/capture` for capturing one-time (lifetime) payments after user returns from PayPal approval

### Phase 5: Backend — Webhook Handler (`src/website/backend/api/webhooks/paypal.ts`)

- [ ] **5.1** Create new file `src/website/backend/api/webhooks/paypal.ts`
- [ ] **5.2** Implement PayPal webhook signature verification:
  - `POST /v1/notifications/verify-webhook-signature` with webhook ID, headers, and body
  - Verify status is `SUCCESS`
- [ ] **5.3** Handle events:
  - `BILLING.SUBSCRIPTION.ACTIVATED` → upgrade user to premium, create subscription record
  - `BILLING.SUBSCRIPTION.UPDATED` → update subscription record (plan change, renewal)
  - `BILLING.SUBSCRIPTION.CANCELLED` → mark subscription as cancelled, keep premium until period end
  - `BILLING.SUBSCRIPTION.EXPIRED` → downgrade user to free
  - `PAYMENT.SALE.COMPLETED` → for lifetime: upgrade user to premium (null expiration), create subscription record
- [ ] **5.4** Map PayPal customer IDs to users: use `custom_id` field in subscription creation to store our `userId`
- [ ] **5.5** Keep `polarCustomerId` column in DB but rename usage to `externalCustomerId` in new code (or add `paypalCustomerId` column — see Phase 7)

### Phase 6: Server Wiring (`src/website/backend/server.ts`)

- [ ] **6.1** Import `paypalWebhookRouter` from `./api/webhooks/paypal`
- [ ] **6.2** Mount: `app.use('/api/webhooks/paypal', paypalWebhookRouter)`
- [ ] **6.3** Keep Polar webhook mounted during transition (existing subscriptions still fire Polar events)
- [ ] **6.4** After all Polar subscriptions are migrated/expired, remove Polar webhook + checkout router

### Phase 7: Database Migration

- [ ] **7.1** Add migration: rename `users.polarCustomerId` → keep column but add `users.paypalCustomerId TEXT`
- [ ] **7.2** Update `subscriptions` table: change `paymentProvider` default from `'polar'` to `'paypal'`
- [ ] **7.3** Update `db.updateUserSubscription()` to accept `paypalCustomerId` instead of/in addition to `polarCustomerId`
- [ ] **7.4** Add `db.getUserByPaypalCustomerId()` method
- [ ] **7.5** Update `db.createSubscription()` to accept `paymentProvider: 'paypal'`

### Phase 8: Frontend — Subscription Page (`src/website/app/settings/subscription/page.tsx`)

- [ ] **8.1** Update `handleManageSubscription`: replace Polar portal URL with PayPal manage subscription URL (or remove if PayPal doesn't offer a customer portal — users may need to cancel from within their PayPal account)
- [ ] **8.2** Update FAQ section: replace "Polar" mentions with "PayPal"
- [ ] **8.3** Update accepted payment methods text to mention PayPal, credit/debit cards

### Phase 9: Frontend — Landing Page (`src/website/app/page.tsx`)

- [ ] **9.1** Update line ~598: change "Secure payments powered by Polar" → "Secure payments powered by PayPal"

### Phase 10: Premium Middleware (`src/website/backend/middleware/premium.ts`)

- [ ] **10.1** No functional changes needed — middleware checks `subscriptionTier` and `subscriptionExpiresAt`, which are provider-agnostic
- [ ] **10.2** Optionally rename `polarCustomerId` in the `PremiumUser` interface to `externalCustomerId` (breaking change — update all consumers)

### Phase 11: Testing

- [ ] **11.1** Create `tests/website/subscription.spec.ts` (deferred in TESTING-REGIME.md as HUMAN ACTION 10):
  - Test checkout URL creation for each plan
  - Test webhook handler with mock PayPal events
  - Test subscription activation → premium upgrade
  - Test subscription cancellation → premium maintained until expiry
  - Test subscription expiry → downgrade to free
  - Test lifetime purchase → permanent premium
- [ ] **11.2** Manual end-to-end test with PayPal sandbox buyer account:
  - Complete a monthly subscription checkout
  - Verify premium activated in DB
  - Cancel subscription in PayPal sandbox
  - Verify downgrade after period end
  - Complete a lifetime purchase
  - Verify permanent premium
- [ ] **11.3** Update `docs/TESTING-REGIME.md` HUMAN ACTION 10 — mark PayPal as wired

### Phase 12: Cleanup (after migration confirmed stable)

- [ ] **12.1** Remove `@polar-sh/sdk` from `package.json`
- [ ] **12.2** Delete `src/website/backend/api/webhooks/polar.ts`
- [ ] **12.3** Remove Polar env vars from `.env.local` and `.env.production`
- [ ] **12.4** Remove Polar webhook route from `server.ts`
- [ ] **12.5** Remove `polarCustomerId` column (or leave for historical reference)

## Key Decisions to Make

1. **PayPal SDK vs raw REST**: Raw REST via `fetch` is recommended — `@paypal/checkout-server-sdk` is deprecated. PayPal's current REST API v2 is well-documented and straightforward.

2. **Subscription plan IDs**: PayPal requires creating plans in their dashboard (or via API). Plans should have no trial configured — billing starts immediately. Plan IDs will differ between sandbox and live.

3. **Customer portal**: Polar had a built-in customer portal. PayPal doesn't have an equivalent for subscriptions — users cancel from their PayPal account settings, or we build a cancel endpoint ourselves.

4. **Existing Polar subscribers**: Need a migration strategy for users currently paying via Polar. Options:
   - Let existing subscriptions run on Polar until they expire, then require PayPal re-subscription
   - Force-migrate by cancelling Polar subscriptions and offering PayPal re-subscription with a grace period
   - Grandfather existing lifetime purchasers (no action needed — they're already permanent)

5. **Webhook URL change**: The production webhook URL changes from `/api/webhooks/polar` to `/api/webhooks/paypal`. Both can run simultaneously during transition.

## File Change Summary

| File | Action |
|---|---|
| `src/website/backend/api/checkout.ts` | **Rewrite** — Polar SDK → PayPal REST |
| `src/website/backend/api/webhooks/paypal.ts` | **New file** — PayPal webhook handler |
| `src/website/backend/api/webhooks/polar.ts` | **Keep during transition**, delete in Phase 12 |
| `src/website/backend/server.ts` | **Edit** — add PayPal webhook import + mount |
| `src/website/backend/db/database.ts` | **Edit** — add `paypalCustomerId`, update methods |
| `src/website/backend/middleware/premium.ts` | **Minor edit** — rename `polarCustomerId` ref (optional) |
| `src/website/app/settings/subscription/page.tsx` | **Edit** — update portal URL, FAQ text |
| `src/website/app/page.tsx` | **Edit** — update "powered by" text |
| `src/website/lib/api.ts` | **No change** — API shape stays the same |
| `.env.local` / `.env.production` | **Edit** — add PayPal vars |
| `tests/website/subscription.spec.ts` | **New file** — subscription E2E tests |
| `docs/TESTING-REGIME.md` | **Edit** — update HUMAN ACTION 10 |

## Estimated Effort

| Phase | Effort | Who |
|---|---|---|
| Phase 1 (PayPal setup) | 1-2 hours | Human |
| Phase 2 (Env vars) | 15 min | Human |
| Phase 3 (SDK/dep) | 30 min | Agent |
| Phase 4 (Checkout API) | 2-3 hours | Agent |
| Phase 5 (Webhook handler) | 2-3 hours | Agent |
| Phase 6 (Server wiring) | 15 min | Agent |
| Phase 7 (DB migration) | 1 hour | Agent |
| Phase 8-9 (Frontend) | 1 hour | Agent |
| Phase 10 (Middleware) | 30 min | Agent |
| Phase 11 (Testing) | 2-3 hours | Agent + Human |
| Phase 12 (Cleanup) | 30 min | Agent |
| **Total** | **~11-14 hours** | |
