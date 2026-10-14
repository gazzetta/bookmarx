/**
 * Setup script for BookMarx PayPal Subscriptions products and plans.
 * Run with: node --env-file=src/website/.env.local scripts/setup-paypal-plans.mjs
 *
 * Creates:
 *   - Product + Monthly Billing Plan (no trial — billed immediately)
 *   - Product + Yearly Billing Plan
 *   - Product for Lifetime (one-time payment, no billing plan)
 *
 * After running, the script prints the plan/product IDs to add to .env.local.
 */

import { readFileSync } from "node:fs";

const ENV = loadEnv();
const API_BASE = ENV.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com";

const PLANS = [
  {
    key: "monthly",
    name: "BookMarx Premium Monthly",
    description: "BookMarx Premium — monthly billing, no trial",
    frequency: "MONTH",
    price: "2.49",
    trialDays: 0,
  },
  {
    key: "yearly",
    name: "BookMarx Premium Yearly",
    description: "BookMarx Premium — annual billing, no trial",
    frequency: "YEAR",
    price: "24.99",
    trialDays: 0,
  },
];

const LIFETIME = {
  key: "lifetime",
  name: "BookMarx Premium Lifetime",
  description: "BookMarx Premium — one-time payment, lifetime access",
};

async function main() {
  const token = await getAccessToken();

  console.log("=== BookMarx PayPal Plan Setup ===\n");

  const results = {};

  for (const plan of PLANS) {
    console.log(`--- Creating ${plan.name} ---`);

    const product = await createProduct(token, plan.name, plan.description);
    console.log(`  Product ID: ${product.id}`);

    const billingPlan = await createBillingPlan(token, product.id, plan);
    console.log(`  Plan ID: ${billingPlan.id}`);

    results[plan.key] = {
      productId: product.id,
      planId: billingPlan.id,
    };

    console.log();
  }

  // Lifetime: just a product, no billing plan (uses Orders API for one-time payment)
  console.log(`--- Creating ${LIFETIME.name} ---`);
  const lifetimeProduct = await createProduct(token, LIFETIME.name, LIFETIME.description);
  console.log(`  Product ID: ${lifetimeProduct.id}`);
  results[LIFETIME.key] = {
    productId: lifetimeProduct.id,
  };

  console.log("\n=== DONE ===\n");
  console.log("Add these to your src/website/.env.local:\n");
  console.log(`PAYPAL_CLIENT_ID=${ENV.PAYPAL_CLIENT_ID}`);
  console.log(`PAYPAL_CLIENT_SECRET=${ENV.PAYPAL_CLIENT_SECRET}`);
  console.log(`PAYPAL_ENVIRONMENT=sandbox`);
  console.log(`PAYPAL_MONTHLY_PLAN_ID=${results.monthly.planId}`);
  console.log(`PAYPAL_YEARLY_PLAN_ID=${results.yearly.planId}`);
  console.log(`PAYPAL_LIFETIME_PRODUCT_ID=${results.lifetime.productId}`);
  console.log();
  console.log("Full env block for .env.local:");
  console.log("```");
  console.log(`PAYPAL_CLIENT_ID=${ENV.PAYPAL_CLIENT_ID}`);
  console.log(`PAYPAL_CLIENT_SECRET=${ENV.PAYPAL_CLIENT_SECRET}`);
  console.log(`PAYPAL_ENVIRONMENT=sandbox`);
  console.log(`PAYPAL_API_BASE=https://api-m.sandbox.paypal.com`);
  console.log(`PAYPAL_MONTHLY_PLAN_ID=${results.monthly.planId}`);
  console.log(`PAYPAL_YEARLY_PLAN_ID=${results.yearly.planId}`);
  console.log(`PAYPAL_LIFETIME_PRODUCT_ID=${results.lifetime.productId}`);
  console.log("```");
}

async function getAccessToken() {
  const response = await fetch(`${API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${ENV.PAYPAL_CLIENT_ID}:${ENV.PAYPAL_CLIENT_SECRET}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Auth failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function createProduct(token, name, description) {
  const response = await fetch(`${API_BASE}/v1/catalogs/products`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      description,
      type: "SERVICE",
      category: "SOFTWARE",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Product creation failed: ${response.status} ${text}`);
  }

  return response.json();
}

async function createBillingPlan(token, productId, plan) {
  const billingCycles = [];

  // Trial cycle (currently disabled — no trial on any plan)
  if (plan.trialDays > 0) {
    billingCycles.push({
      frequency: {
        interval_unit: "DAY",
        interval_count: plan.trialDays,
      },
      tenure_type: "TRIAL",
      sequence: 1,
      total_cycles: 1,
      pricing_scheme: {
        fixed_price: {
          value: "0",
          currency_code: "USD",
        },
      },
    });
  }

  // Regular cycle
  billingCycles.push({
    frequency: {
      interval_unit: plan.frequency,
      interval_count: 1,
    },
    tenure_type: "REGULAR",
    sequence: plan.trialDays > 0 ? 2 : 1,
    total_cycles: 0, // 0 = infinite (bills until cancelled)
    pricing_scheme: {
      fixed_price: {
        value: plan.price,
        currency_code: "USD",
      },
    },
  });

  const response = await fetch(`${API_BASE}/v1/billing/plans`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      product_id: productId,
      name: plan.name,
      description: plan.description,
      status: "ACTIVE",
      billing_cycles: billingCycles,
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee_failure_action: "CONTINUE",
        payment_failure_threshold: 3,
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Plan creation failed: ${response.status} ${text}`);
  }

  return response.json();
}

function loadEnv() {
  const env = {};

  for (const file of ["src/website/.env.local", "src/website/.env", ".env.local", ".env"]) {
    try {
      const content = readFileSync(file, "utf8");
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const [key, ...valueParts] = trimmed.split("=");
        if (!key) continue;
        const value = valueParts.join("=").trim().replace(/^["']|["']$/g, "");
        if (!(key in env)) env[key] = value;
      }
    } catch {
      // try next file
    }
  }

  // Allow process.env overrides (e.g. for running against live)
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("PAYPAL_")) {
      env[key] = process.env[key];
    }
  }

  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
    console.error("ERROR: PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set");
    console.error("Set them in src/website/.env.local or as process env vars");
    process.exit(1);
  }

  return env;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
