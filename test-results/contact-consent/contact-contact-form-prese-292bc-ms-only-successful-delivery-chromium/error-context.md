# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: contact.spec.ts >> contact form preserves a failed message, then confirms only successful delivery
- Location: tests\website\contact.spec.ts:3:5

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.selectOption: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByLabel('Topic', { exact: true })

```

# Page snapshot

```yaml
- generic [ref=e1]:
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
              - textbox "Your email address" [active] [ref=e16]: customer@example.test
            - generic [ref=e17]:
              - text: Topic
              - combobox "Topic" [ref=e18]:
                - option "Support" [selected]
                - option "Sales"
                - option "Privacy request"
                - option "Cancellation or refund"
                - option "Complaint"
            - generic [ref=e19]:
              - text: Message
              - textbox "Message" [ref=e20]
            - paragraph [ref=e21]:
              - text: We use these details to respond to your request. See our
              - link "Privacy Policy" [ref=e22] [cursor=pointer]:
                - /url: /privacy
              - text: . This form does not subscribe you to marketing.
            - button "Send message" [ref=e23] [cursor=pointer]
        - generic [ref=e24]:
          - heading "Postal and service address" [level=2] [ref=e25]
          - paragraph [ref=e26]: GasDigital Ltd, 82 Wandsworth Bridge Rd, London, SW6 2TF, United Kingdom
          - paragraph [ref=e27]: If online delivery is unavailable, you can send your request to this address.
          - paragraph [ref=e28]:
            - text: To stop a PayPal subscription renewing, you can also use
            - link "PayPal’s automatic-payment controls" [ref=e29] [cursor=pointer]:
              - /url: https://www.paypal.com/myaccount/autopay/
            - text: .
    - contentinfo [ref=e30]:
      - generic [ref=e32]:
        - generic [ref=e33]:
          - generic [ref=e34]:
            - link "BookMarx" [ref=e35] [cursor=pointer]:
              - /url: /
              - img [ref=e37]
              - generic [ref=e39]: BookMarx
            - paragraph [ref=e40]: The unified bookmark sync solution for professionals who work across multiple browsers, devices, and accounts.
            - generic [ref=e42]:
              - img "Chrome logo" [ref=e43]
              - img "Firefox logo" [ref=e44]
              - img "Microsoft Edge logo" [ref=e45]
              - img "Brave logo" [ref=e46]
          - generic [ref=e47]:
            - heading "Product" [level=4] [ref=e48]
            - list [ref=e49]:
              - listitem [ref=e50]:
                - link "Features" [ref=e51] [cursor=pointer]:
                  - /url: /#features
              - listitem [ref=e52]:
                - link "Pricing" [ref=e53] [cursor=pointer]:
                  - /url: /#pricing
              - listitem [ref=e54]:
                - link "How It Works" [ref=e55] [cursor=pointer]:
                  - /url: /#how-it-works
              - listitem [ref=e56]:
                - link "FAQ" [ref=e57] [cursor=pointer]:
                  - /url: /#faq
          - generic [ref=e58]:
            - heading "Support" [level=4] [ref=e59]
            - list [ref=e60]:
              - listitem [ref=e61]:
                - link "Sign In" [ref=e62] [cursor=pointer]:
                  - /url: /login
              - listitem [ref=e63]:
                - link "Register" [ref=e64] [cursor=pointer]:
                  - /url: /register
              - listitem [ref=e65]:
                - link "Help & requests" [ref=e66] [cursor=pointer]:
                  - /url: /contact
          - generic [ref=e67]:
            - heading "Legal" [level=4] [ref=e68]
            - list [ref=e69]:
              - listitem [ref=e70]:
                - link "Privacy Policy" [ref=e71] [cursor=pointer]:
                  - /url: /privacy
              - listitem [ref=e72]:
                - link "Terms of Service" [ref=e73] [cursor=pointer]:
                  - /url: /terms
              - listitem [ref=e74]:
                - link "Cookies & local storage" [ref=e75] [cursor=pointer]:
                  - /url: /cookies
        - generic [ref=e76]:
          - paragraph [ref=e77]: © 2026 BookMarx. All rights reserved.
          - link "Made by BookMarx" [ref=e78] [cursor=pointer]:
            - /url: https://www.bookmarx.cc/
  - button "Open Next.js Dev Tools" [ref=e84] [cursor=pointer]:
    - img [ref=e85]
  - alert [ref=e88]
  - button "Cookie settings" [ref=e89] [cursor=pointer]
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
> 12 |   await page.getByLabel('Topic', { exact: true }).selectOption('Privacy request');
     |                                                   ^ Error: locator.selectOption: Test timeout of 30000ms exceeded.
  13 |   const message = 'Please provide my account information.';
  14 |   await page.getByLabel('Message', { exact: true }).fill(message);
  15 |   await page.getByRole('button', { name: 'Send message', exact: true }).click();
  16 |   await expect(page.getByRole('alert')).toContainText('Delivery unavailable');
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