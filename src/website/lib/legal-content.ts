import { businessAddress, type LegalSection } from '@/components/LegalPage'

export const privacySections: LegalSection[] = [
  { heading: '1. Who is responsible for your information', paragraphs: [
    `BookMarx is operated by GasDigital Ltd, the controller responsible for the personal information described here. Our postal and service address is ${businessAddress}.`,
    'This notice covers the website and browser extensions. It does not describe a currently available mobile app. Send privacy requests or complaints through our contact form or to our address, marked “BookMarx privacy”.'
  ] },
  { heading: '2. Information we process', paragraphs: [
    'Accounts: email address, password hash for password accounts, optional display name, Google account identifiers where you choose Google sign-in, verification status, and expiring verification/reset records.',
    'Bookmarks: URLs, titles, folders, positions, dates and associated metadata you import or synchronise. URLs and titles may reveal sensitive information; avoid saving secrets or access tokens in them.',
    'Browsers and sync: browser/device identifiers, browser and operating-system versions, user agent, activity dates, collections, sync events and change records, including deleted-item records needed to propagate changes.',
    'Subscriptions: selected plan, payment/subscription identifiers, status, amounts and dates supplied by PayPal. Payment details entered into PayPal are handled by PayPal; we do not ask you to provide card numbers to BookMarx.',
    'Operations and correspondence: requests, errors, security activity and communications needed to operate the service. Hosting and service providers may receive IP addresses and technical connection information.',
    'Optional Analytics: when configured and you consent, Google Analytics receives technical visit information and events from selected public pages. Our integration does not intentionally send account emails, bookmark contents, private page paths, or URL query/fragment values.',
    'The extension synchronises bookmarks; it does not request permission to read your general browsing history or the contents of web pages you visit.'
  ] },
  { heading: '3. Purposes and lawful bases', paragraphs: [
    'Contract: creating and verifying accounts, storing and synchronising bookmarks, managing plans, and delivering requested account/payment communications.',
    'Legitimate interests: proportionate maintenance, troubleshooting, security, fraud and abuse prevention, and handling enquiries. Our interests are operating a reliable, secure service; you can object where this basis applies.',
    'Legal obligation: records and disclosures required by applicable tax, accounting or other legal requirements. Consent: optional Analytics and optional persistent website preferences. You can withdraw optional storage consent through Cookie settings without losing access to the core service.',
    'We do not sell bookmark contents or use them for personalised advertising. We do not use this integration to make decisions producing legal or similarly significant effects solely by automated processing.'
  ] },
  { heading: '4. Providers and disclosures', paragraphs: [
    'We use Contabo for EU server hosting, Resend for transactional email, Google for optional sign-in and optional Analytics, and PayPal for payments. Providers receive information needed for their role. Some act as processors on our instructions; payment and identity providers may also process information for their own purposes under their own notices.',
    'We may disclose information to advisers or authorities where necessary to comply with law, protect rights or investigate security incidents. A business transfer may require a lawful transfer of service records with appropriate safeguards and notice.',
    'Where a bookmark includes an external favicon image, displaying it can make a request to that host, which may receive your IP address and connection information. This is separate from optional Analytics.'
  ] },
  { heading: '5. Locations and international transfers', paragraphs: [
    'Production servers and database backups are hosted in the European Union; production servers are with Contabo. EU hosting does not mean every provider processes information only in the EU: Google, PayPal, email delivery and their subprocessors may process information in other countries.',
    'Transfers requiring additional protection under UK or EU data protection law must use an applicable adequacy decision or appropriate contractual safeguards, such as standard contractual clauses and the UK Addendum or IDTA where applicable. You can request information about safeguards relevant to your data at our postal address.'
  ] },
  { heading: '6. Retention and security', paragraphs: [
    'We retain account and bookmark records while providing your account and requested sync service. Sync/change records support delivery, recovery and troubleshooting. Email verification links are valid for 24 hours and single-use; replacement links invalidate earlier ones.',
    'Database backups are retained for six months. Retention beyond an account or individual item deletion depends on outstanding sync delivery, recovery needs, disputes, security investigations and legal record-keeping obligations. Deleting a bookmark from a collection does not delete all account, billing, log or backup records. You may request erasure; applicable legal exceptions can require some records to be retained.',
    'Password accounts use password hashing. Production connections use HTTPS/TLS. No online service can guarantee absolute security; keep independent backups of important bookmarks.'
  ] },
  { heading: '7. Your rights and complaints', paragraphs: [
    'Depending on the circumstances, you can request access, correction, erasure, restriction, portability or object to processing. You can withdraw consent where processing relies on it. These rights have legal conditions and exceptions.',
    `Send requests to ${businessAddress}, marked “BookMarx privacy”. Include enough information to identify your account, but do not send passwords. We may need to confirm your identity. We normally respond within one month, subject to lawful extensions.`,
    'You can complain to the UK Information Commissioner’s Office or the appropriate data protection authority in your country. We welcome the opportunity to address a concern first.'
  ] },
  { heading: '8. Children and changes', paragraphs: [
    'BookMarx is not directed at children under 18. If you believe a child has provided information, contact us so we can investigate.',
    'We update this notice when our practices change and provide additional notice where a material change or the law requires it.'
  ] }
]

export const termsSections: LegalSection[] = [
  { heading: '1. Operator and agreement', paragraphs: [
    `BookMarx is provided by ${businessAddress}. These terms apply to our website and browser extensions. By registering or purchasing a plan you agree to these terms. Accepting these terms is not consent to optional tracking.`,
    'You must be at least 18 and able to enter into a contract. For support, privacy requests, cancellation or refund enquiries, use our contact form or write to our postal/service address, identifying your account without including a password.'
  ] },
  { heading: '2. Accounts and bookmark service', paragraphs: [
    'BookMarx stores and synchronises bookmarks and folders between supported browser profiles and collections. Features and limits depend on your plan. Browser versions, permissions, connectivity and third-party changes can affect compatibility. Future features are not included until made available.',
    'Provide accurate account information, verify your email before using bookmark features, and protect your login details. Tell us promptly if you suspect unauthorised access. Keep independent backups before overwrites or large changes; you remain responsible for the information and changes you choose to upload, import or apply.'
  ] },
  { heading: '3. Plans, prices and payments', paragraphs: [
    'Free-plan limits and paid-plan features are shown on the website. Before you pay, checkout must show the selected plan, price, currency, billing interval, applicable taxes and whether payment renews automatically. PayPal processes payments under its own terms.',
    'Monthly and annual subscriptions renew at the disclosed interval until cancelled. A one-time lifetime plan does not renew: it gives access to the purchased BookMarx service for the operational lifetime of that service, not a guarantee that the company or service will operate forever.',
    'We will give at least 30 days’ advance notice of a subscription price increase affecting a future renewal, with an opportunity to cancel before it applies. We will not retrospectively increase a price already paid for the current term.'
  ] },
  { heading: '4. Cancellation and refunds', paragraphs: [
    'You can stop future subscription renewals through PayPal’s automatic-payment controls or by sending us a cancellation request. Cancellation of renewal normally leaves access for the remainder of the paid period. It does not itself erase account data.',
    'Consumers purchasing remotely generally have a statutory 14-day cancellation period from entering the service contract, subject to applicable exceptions. If you expressly request service during that period, any lawful charge for service supplied must be proportionate and explained before purchase. Merely signing up or using BookMarx does not automatically waive statutory rights.',
    'We will provide refunds where required by law, including applicable cancellation and service-quality remedies. Additional goodwill refunds may be considered individually. Nothing in these terms limits statutory cancellation, refund or other consumer rights.'
  ] },
  { heading: '5. Acceptable use and intellectual property', paragraphs: [
    'Do not use BookMarx unlawfully, access other users’ information without authorisation, attack or disrupt the service, or evade plan limits through abusive accounts. You must have the right to store and process information you upload.',
    'You retain rights in your bookmark data. You grant us the limited permission necessary to host, process and synchronise it for you. BookMarx software and branding belong to GasDigital Ltd or its licensors. Third-party browser names, logos and other materials belong to their owners; displaying them does not imply endorsement.'
  ] },
  { heading: '6. Service standards and liability', paragraphs: [
    'We will provide the service with reasonable care and skill. We cannot promise uninterrupted availability or perfect compatibility with every third-party browser version. We will take reasonable steps to address service problems.',
    'For consumers, we remain responsible for foreseeable loss caused by our breach of contract or failure to use reasonable care and skill. We do not exclude rights or remedies that cannot lawfully be excluded, or liability for fraud, fraudulent misrepresentation, or death or personal injury caused by negligence. Recommending backups does not remove our legal responsibilities.',
    'For business use, to the extent permitted by law we exclude indirect or consequential loss and loss of profit, and aggregate liability for ordinary contractual claims is limited to fees paid in the preceding 12 months. This does not apply to liabilities that cannot lawfully be limited.'
  ] },
  { heading: '7. Suspension, termination and changes', paragraphs: [
    'We may restrict an account where reasonably necessary to address a serious breach, security incident, fraud or legal requirement. Where practicable we will explain the reason and give you an opportunity to resolve it. Immediate action may be necessary to protect users or comply with law.',
    'If we discontinue a paid service for reasons other than your serious breach, we will give reasonable notice where practicable, allow an opportunity to export bookmarks, and provide an appropriate refund for paid service we will not supply, subject to your statutory rights.',
    'Material changes affecting a paid plan will be notified in advance using your account contact details where practicable. Changes will not remove accrued rights or override mandatory consumer protections. You may cancel renewal before an adverse change takes effect.'
  ] },
  { heading: '8. Law and disputes', paragraphs: [
    'These terms are governed by the laws of England and Wales. Consumers retain mandatory protections and court rights available under the law of their country of residence where applicable. This clause does not force consumers to give up those rights.',
    `Send complaints to ${businessAddress}, marked “BookMarx complaint”, so we can try to resolve them. If part of these terms is unenforceable, the remaining terms continue to apply to the extent lawful.`
  ] }
]
