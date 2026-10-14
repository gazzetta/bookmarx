# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: contact.spec.ts >> contact form preserves a failed message, then confirms only successful delivery
- Location: tests\website\contact.spec.ts:3:5

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: getByRole('alert')
Expected substring: "Delivery unavailable"
Error: strict mode violation: getByRole('alert') resolved to 2 elements:
    1) <p role="alert" class="text-red-700 dark:text-red-300">Delivery unavailable. Please try again.</p> aka getByText('Delivery unavailable. Please')
    2) <div role="alert" aria-live="assertive" id="__next-route-announcer__"></div> aka locator('[id="__next-route-announcer__"]')

Call log:
  - Expect "toContainText" with timeout 5000ms
  - waiting for getByRole('alert')

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - navigation "Legal page navigation" [ref=e3]:
      - generic [ref=e4]:
        - link "BookMarx" [ref=e5] [cursor=pointer]:
          - /url: /
        - link "My account" [ref=e6] [cursor=pointer]:
          - /url: /dashboard
    - main [ref=e7]:
      - heading "Contact BookMarx" [level=1] [ref=e8]
      - paragraph [ref=e9]: "Last updated: 14 October 2026"
      - generic [ref=e10]:
        - generic [ref=e11]:
          - heading "How can we help?" [level=2] [ref=e12]
          - paragraph [ref=e13]: Use this form for support, sales, privacy requests, cancellation, refunds or complaints. Include your account email where relevant. Do not send passwords, payment card details or sensitive bookmark contents.
          - generic [ref=e14]:
            - generic [ref=e15]:
              - text: Your email address
              - textbox "Your email address" [ref=e16]: customer@example.test
            - generic [ref=e17]:
              - generic [ref=e18]: Topic
              - combobox "Topic" [ref=e19]:
                - option "Support"
                - option "Sales"
                - option "Privacy request" [selected]
                - option "Cancellation or refund"
                - option "Complaint"
            - generic [ref=e20]:
              - text: Message
              - textbox "Message" [ref=e21]: Please provide my account information.
            - paragraph [ref=e22]:
              - text: We use these details to respond to your request. See our
              - link "Privacy Policy" [ref=e23] [cursor=pointer]:
                - /url: /privacy
              - text: . This form does not subscribe you to marketing.
            - alert [ref=e24]: Delivery unavailable. Please try again.
            - button "Send message" [ref=e25] [cursor=pointer]
        - generic [ref=e26]:
          - heading "Postal and service address" [level=2] [ref=e27]
          - paragraph [ref=e28]: GasDigital Ltd, 82 Wandsworth Bridge Rd, London, SW6 2TF, United Kingdom
          - paragraph [ref=e29]: If online delivery is unavailable, you can send your request to this address.
          - paragraph [ref=e30]:
            - text: To stop a PayPal subscription renewing, you can also use
            - link "PayPal’s automatic-payment controls" [ref=e31] [cursor=pointer]:
              - /url: https://www.paypal.com/myaccount/autopay/
            - text: .
    - contentinfo [ref=e32]:
      - generic [ref=e34]:
        - generic [ref=e35]:
          - generic [ref=e36]:
            - link "BookMarx" [ref=e37] [cursor=pointer]:
              - /url: /
              - img [ref=e39]
              - generic [ref=e41]: BookMarx
            - paragraph [ref=e42]: The unified bookmark sync solution for professionals who work across multiple browsers, devices, and accounts.
            - generic [ref=e44]:
              - img "Chrome logo" [ref=e45]
              - img "Firefox logo" [ref=e46]
              - img "Microsoft Edge logo" [ref=e47]
              - img "Brave logo" [ref=e48]
          - generic [ref=e49]:
            - heading "Product" [level=4] [ref=e50]
            - list [ref=e51]:
              - listitem [ref=e52]:
                - link "Features" [ref=e53] [cursor=pointer]:
                  - /url: /#features
              - listitem [ref=e54]:
                - link "Pricing" [ref=e55] [cursor=pointer]:
                  - /url: /#pricing
              - listitem [ref=e56]:
                - link "How It Works" [ref=e57] [cursor=pointer]:
                  - /url: /#how-it-works
              - listitem [ref=e58]:
                - link "FAQ" [ref=e59] [cursor=pointer]:
                  - /url: /#faq
          - generic [ref=e60]:
            - heading "Support" [level=4] [ref=e61]
            - list [ref=e62]:
              - listitem [ref=e63]:
                - link "Sign In" [ref=e64] [cursor=pointer]:
                  - /url: /login
              - listitem [ref=e65]:
                - link "Register" [ref=e66] [cursor=pointer]:
                  - /url: /register
              - listitem [ref=e67]:
                - link "Help & requests" [ref=e68] [cursor=pointer]:
                  - /url: /contact
          - generic [ref=e69]:
            - heading "Legal" [level=4] [ref=e70]
            - list [ref=e71]:
              - listitem [ref=e72]:
                - link "Privacy Policy" [ref=e73] [cursor=pointer]:
                  - /url: /privacy
              - listitem [ref=e74]:
                - link "Terms of Service" [ref=e75] [cursor=pointer]:
                  - /url: /terms
              - listitem [ref=e76]:
                - link "Cookies & local storage" [ref=e77] [cursor=pointer]:
                  - /url: /cookies
        - generic [ref=e78]:
          - paragraph [ref=e79]: © 2026 BookMarx. All rights reserved.
          - link "Made by BookMarx" [ref=e80] [cursor=pointer]:
            - /url: https://www.bookmarx.cc/
  - button "Open Next.js Dev Tools" [ref=e86] [cursor=pointer]:
    - img [ref=e87]
  - alert [ref=e90]
  - button "Cookie settings" [ref=e91] [cursor=pointer]
```

# Test source

```ts
  1  | import { test, expect } from './_fixtures';
  2  | 
  3  | test('contact form preserves a failed message, then confirms only successful delivery', async ({ page }) => {
  4  |   let success = false;
  5  |   const requests: any[] = [];
  6  |   await page.route('**/api/v1/contact', async route => {
  7  |     requests.push(route.request().postDataJSON());
  8  |     await route.fulfill({ status: success ? 200 : 503, json: success ? { success: true } : { success: false, error: { message: 'Delivery unavailable. Please try again.' } } });
  9  |   });
  10 |   await page.goto('/contact');
  11 |   await page.getByLabel('Your email address').fill('customer@example.test');
  12 |   await page.getByLabel('Topic', { exact: true }).selectOption('Privacy request');
  13 |   const message = 'Please provide my account information.';
  14 |   await page.getByLabel('Message', { exact: true }).fill(message);
  15 |   await page.getByRole('button', { name: 'Send message', exact: true }).click();
> 16 |   await expect(page.getByRole('alert')).toContainText('Delivery unavailable');
     |                                         ^ Error: expect(locator).toContainText(expected) failed
  17 |   await expect(page.getByLabel('Message', { exact: true })).toHaveValue(message);
  18 |   success = true;
  19 |   await page.getByRole('button', { name: 'Send message', exact: true }).click();
  20 |   await expect(page.getByRole('status')).toContainText('delivered to our support inbox');
  21 |   expect(requests).toHaveLength(2);
  22 |   expect(requests[1]).toMatchObject({ email: 'customer@example.test', topic: 'Privacy request', message });
  23 |   await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
  24 | });
  25 | 
```