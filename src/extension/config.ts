// ─────────────────────────────────────────────────────────────────────────────
// BookMarx Extension – Central URL Configuration
//
// To switch between local dev and the live server:
//   1. Comment out the LOCAL block below and uncomment the PRODUCTION block.
//   2. In manifest.json → "host_permissions", replace:
//        "http://localhost:*/*"  and  "http://127.0.0.1:*/*"
//      with:
//        "https://bookmarx.gasdigital.co.uk/*"
//   3. Rebuild the extension:  npm run build
// ─────────────────────────────────────────────────────────────────────────────

// ── LOCAL DEVELOPMENT (currently active) ─────────────────────────────────────
export const API_BASE_URL     = 'http://localhost:3005';
export const WEBSITE_BASE_URL = 'http://localhost:3005';

// ── PRODUCTION – uncomment this block (and comment out LOCAL above) ───────────
// export const API_BASE_URL     = 'https://bookmarx.gasdigital.co.uk';
// export const WEBSITE_BASE_URL = 'https://bookmarx.gasdigital.co.uk';
