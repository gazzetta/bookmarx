# Privacy and consumer terms: implementation and remaining launch checks

Business details supplied by the owner: GasDigital Ltd, 82 Wandsworth Bridge Rd, London, SW6 2TF, United Kingdom. Contabo production hosting is in the EU. Exact server country, backup location/expiry and company registration number still need confirmation. No production changes have been deployed.

## Implemented

- Replaced privacy/terms drafts with business identity, processing categories, lawful bases, provider disclosures, international-transfer safeguards, rights, complaints and consumer protections. Removed unsupported blanket no-sharing/no-liability and 30-day deletion/anonymisation assertions. Terms distinguish consumer and business liability and preserve mandatory rights. No direct email links on legal pages; postal contact is available pending the owner's online support-route decision.
- Website-wide consent controls offer equally accessible accept/reject, granular Analytics/theme choices, a persistent Cookie settings control, versioned choices expiring after 180 days, and a storage inventory at `/cookies`. Rejecting optional storage does not block the service. Existing stored themes are removed unless preference persistence is accepted.
- Google Analytics is optional and disabled without a valid public `GOOGLE_ANALYTICS_ID` (or `NEXT_PUBLIC_GOOGLE_ANALYTICS_ID`) server setting. `/api/v1/config` exposes only the public measurement ID. No API secret is involved.
- Basic consent implementation: no Analytics script or measurements before acceptance. Advertising consent remains denied. Only `/`, `/privacy`, `/terms` and `/cookies` generate our manual page views, with fixed title and query/fragment removal. Auth/bookmark/account pages do not initialise Analytics. Withdrawal clears first-party GA cookies and reloads to remove running vendor code; other tabs reload when choices change.
- Self-hosted Outfit/Fraunces fonts (with OFL licences) replace external font requests from website and extension. Email templates use system-font fallbacks without fetching Google Fonts.
- Removed the unsupported footer claim of 50,000 active users.

## Before enabling a real Analytics property

1. Supply the public G- measurement ID and configure the server setting. Tests use a fake ID and intercept the Google script; no test traffic is sent to Google.
2. In the GA4 web stream, turn off Enhanced Measurement (including automatic history-change page views, form interactions and outbound clicks). The app deliberately sends manual public-page events; Google property settings must not add automatic collection of private routes, URLs or form inputs. Keep Google Signals, ads personalisation and user-provided-data collection off.
3. Select the shortest suitable GA event-data retention setting (normally 2 months) and review data-sharing settings and Google's processing terms. App cookie expiry is 180 days; Google backend retention is a separate property setting.
4. Verify the real production network with no choice, rejection, acceptance, withdrawal, SPA navigation and reload. Confirm no private paths, bookmark URLs, account data or tokens reach Analytics. Code-only/fake-tag tests do not certify the real vendor configuration.

## Operational/legal work still required

- Confirm company number and registration jurisdiction for statutory company disclosures. The supplied legal identity has not been independently certified.
- Confirm backup countries and retention, adopt a record-retention/deletion schedule, and document how erasure is applied to logs, sync tombstones, provider records and restored backups. A privacy notice does not implement a deletion workflow.
- Review Contabo/Resend/Google provider agreements, processor terms, subprocessors and actual transfer mechanisms. EU server hosting alone does not keep all processing in the EU.
- Choose a practical online contact route (owner has been asked whether to add a contact form). Postal contact is a temporary disclosed route, not a completed online complaints/support system. Homepage/subscription Contact Sales email links still need routing to the chosen alternative.
- Check the paid checkout's required disclosures, durable confirmation, immediate-service request during cooling-off, cancellation/refund handling and service discontinuation against the revised terms. Check PayPal automatic-payment controls and entitlement expiration with a real sandbox buyer.
- Have a qualified adviser review the final consumer contract, lifetime-plan meaning, child-age policy, international consumer protections and any EU representative obligations before worldwide paid launch. UK subscription-contract reforms are anticipated for spring 2027 per the government's April 2026 response; check commencement at launch rather than treating future rules as already active.
- Update browser-store privacy declarations to match actual extension permissions and processing. Check externally supplied favicon requests separately from Analytics.

## References checked

- ICO storage/access guidance and exceptions: https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-the-exceptions/
- ICO privacy disclosures: https://ico.org.uk/media/for-organisations/guide-to-the-general-data-protection-regulation-gdpr/individual-rights/right-to-be-informed-1-0.pdf
- Google basic versus advanced consent: https://developers.google.com/tag-platform/security/concepts/consent-mode
- UK fair contract terms: https://www.gov.uk/guidance/writing-a-fair-contract-for-customers
- UK distance selling: https://www.gov.uk/online-and-distance-selling-for-businesses
- Subscription regime response: https://www.gov.uk/government/consultations/consultation-on-the-implementation-of-the-new-subscription-contracts-regime/outcome/government-response-to-consultation-on-the-implementation-of-the-new-subscription-contracts-regime-web-accessible-version

## Verification evidence

`tests/website/cookie-consent.spec.ts` tests the actual script-loading boundary, no pre-consent/rejected requests, preference-only choice, expiry, sanitised events, private-page exclusion and withdrawal with necessary storage preservation. Fake vendor scripts are intercepted to avoid contacting Google. Routine account/bookmark fixtures explicitly model a visitor rejecting optional storage; consent tests use fresh contexts.
