# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: transfer.spec.ts >> paste, preview, cancel, import duplicates, and export a lossless backup
- Location: tests\website\transfer.spec.ts:3:5

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Preview import', exact: true })
    - locator resolved to <button type="button" class="rounded-lg bg-primary-600 px-4 py-2 text-white disabled:opacity-50">Preview import</button>
  - attempting click action
    - waiting for element to be visible, enabled and stable
  - element was detached from the DOM, retrying

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - button "Open Next.js Dev Tools" [ref=e7] [cursor=pointer]:
    - img [ref=e8]
  - alert [ref=e11]
  - generic [ref=e12]:
    - banner [ref=e13]:
      - generic [ref=e15]:
        - link "BookMarx" [ref=e16] [cursor=pointer]:
          - /url: /
          - img [ref=e18]
          - generic [ref=e20]: BookMarx
        - navigation [ref=e21]:
          - link "My Dashboard" [ref=e22] [cursor=pointer]:
            - /url: /dashboard
          - link "My Collections" [ref=e23] [cursor=pointer]:
            - /url: /collections
          - link "My Subscription" [ref=e24] [cursor=pointer]:
            - /url: /settings/subscription
          - link "Account settings" [ref=e25] [cursor=pointer]:
            - /url: /settings/account
          - link "Manage Browsers" [ref=e26] [cursor=pointer]:
            - /url: /settings/browsers
        - generic [ref=e27]:
          - button "Switch to dark mode" [ref=e28] [cursor=pointer]:
            - img
            - img [ref=e29]
          - link "Upgrade" [ref=e31] [cursor=pointer]:
            - /url: /settings/subscription
          - button "f" [ref=e33] [cursor=pointer]:
            - generic [ref=e34]: f
            - img [ref=e35]
    - main [ref=e37]:
      - generic [ref=e38]:
        - group [ref=e39]:
          - generic "Import, export & paste bookmarks" [ref=e40] [cursor=pointer]
        - generic [ref=e41]:
          - generic [ref=e42]:
            - link [ref=e43] [cursor=pointer]:
              - /url: /collections
              - img [ref=e44]
            - generic [ref=e46]:
              - heading "Master Collection" [level=1] [ref=e47]
              - paragraph [ref=e48]: Your main bookmark collection
              - generic [ref=e49]:
                - generic [ref=e50]: Master Collection
                - generic [ref=e51]: 2 saved items
          - link "⭐ Upgrade to Edit" [ref=e53] [cursor=pointer]:
            - /url: /settings/subscription
            - generic [ref=e54]: ⭐
            - text: Upgrade to Edit
        - generic [ref=e55]:
          - generic [ref=e56]:
            - generic [ref=e57]: Folders
            - generic [ref=e58]: "2"
          - generic [ref=e59]:
            - generic [ref=e60]: Bookmarks
            - generic [ref=e61]: "0"
          - generic [ref=e62]:
            - generic [ref=e63]: Restore Points
            - generic [ref=e64]: "0"
            - link "View Restore Points" [ref=e65] [cursor=pointer]:
              - /url: "#restore-points"
              - text: View Restore Points
              - img [ref=e66]
          - generic [ref=e68]:
            - generic [ref=e69]: Latest Activity
            - generic [ref=e70]: No activity yet
            - generic [ref=e71]: Your next import or edit will appear here
        - generic [ref=e73]:
          - generic [ref=e74]:
            - generic:
              - img
            - textbox "Search titles, folders, or URLs..." [ref=e75]
          - generic [ref=e76]:
            - button "Expand all" [ref=e77] [cursor=pointer]
            - button "Collapse all" [ref=e78] [cursor=pointer]
            - generic [ref=e79]: 2 visible
        - generic [ref=e81]:
          - generic [ref=e82]:
            - generic [ref=e83]:
              - generic [ref=e84]: Structure & Content
              - generic [ref=e85]: Action
            - generic [ref=e86]: Browse your saved folders and links in browser order.
          - generic [ref=e87]:
            - button "📁 Bookmarks Bar 0 items" [ref=e89] [cursor=pointer]:
              - img [ref=e91]
              - generic [ref=e93]: 📁
              - generic [ref=e94]: Bookmarks Bar
              - generic [ref=e96]: 0 items
            - button "📁 Other Bookmarks 0 items" [ref=e98] [cursor=pointer]:
              - img [ref=e100]
              - generic [ref=e102]: 📁
              - generic [ref=e103]: Other Bookmarks
              - generic [ref=e105]: 0 items
    - contentinfo [ref=e106]:
      - generic [ref=e108]:
        - generic [ref=e109]:
          - generic [ref=e110]:
            - link "BookMarx" [ref=e111] [cursor=pointer]:
              - /url: /
              - img [ref=e113]
              - generic [ref=e115]: BookMarx
            - paragraph [ref=e116]: The unified bookmark sync solution for professionals who work across multiple browsers, devices, and accounts.
            - generic [ref=e118]:
              - img [ref=e119]
              - img [ref=e125]
              - img [ref=e128]
              - img [ref=e131]
          - generic [ref=e134]:
            - heading "Product" [level=4] [ref=e135]
            - list [ref=e136]:
              - listitem [ref=e137]:
                - link "Features" [ref=e138] [cursor=pointer]:
                  - /url: /#features
              - listitem [ref=e139]:
                - link "Pricing" [ref=e140] [cursor=pointer]:
                  - /url: /#pricing
              - listitem [ref=e141]:
                - link "How It Works" [ref=e142] [cursor=pointer]:
                  - /url: /#how-it-works
              - listitem [ref=e143]:
                - link "FAQ" [ref=e144] [cursor=pointer]:
                  - /url: /#faq
          - generic [ref=e145]:
            - heading "Support" [level=4] [ref=e146]
            - list [ref=e147]:
              - listitem [ref=e148]:
                - link "Dashboard" [ref=e149] [cursor=pointer]:
                  - /url: /dashboard
              - listitem [ref=e150]:
                - link "Manage Browsers" [ref=e151] [cursor=pointer]:
                  - /url: /settings/browsers
              - listitem [ref=e152]:
                - link "Subscription" [ref=e153] [cursor=pointer]:
                  - /url: /settings/subscription
              - listitem [ref=e154]:
                - link "Contact Us" [ref=e155] [cursor=pointer]:
                  - /url: mailto:support@bookmarks.cc
          - generic [ref=e156]:
            - heading "Legal" [level=4] [ref=e157]
            - list [ref=e158]:
              - listitem [ref=e159]:
                - link "Privacy Policy" [ref=e160] [cursor=pointer]:
                  - /url: /privacy
              - listitem [ref=e161]:
                - link "Terms of Service" [ref=e162] [cursor=pointer]:
                  - /url: /terms
            - generic [ref=e163]:
              - paragraph [ref=e164]: Trusted by over
              - paragraph [ref=e165]: 50,000+
              - paragraph [ref=e166]: active users worldwide
        - generic [ref=e167]:
          - paragraph [ref=e168]: © 2026 BookMarx. All rights reserved.
          - link "Made by BookMarx" [ref=e169] [cursor=pointer]:
            - /url: https://bookmarx.cc
```

# Test source

```ts
  1  | import { test, expect, loginAs, apiBase } from './_fixtures';
  2  | 
  3  | test('paste, preview, cancel, import duplicates, and export a lossless backup', async ({ page, freeAccount }) => {
  4  |   await loginAs(page, freeAccount);
  5  |   await page.goto('/collections/default');
  6  |   await page.getByText('Import, export & paste bookmarks', { exact: true }).click();
  7  |   const content = 'Über & <safe>\thttps://example.test/Case?A=B\nDuplicate\thttps://example.test/Case?A=B';
  8  |   await page.getByLabel('Paste bookmarks').fill(content);
  9  |   await page.getByRole('button', { name: 'Preview import', exact: true }).click();
  10 |   await expect(page.getByText('2 bookmarks and 0 folders will be added.')).toBeVisible();
  11 |   await page.getByRole('button', { name: 'Cancel preview' }).click();
  12 |   const headers = { Authorization: `Bearer ${freeAccount.token}` };
  13 |   const before = await page.request.get(`${apiBase()}/collections/default/export`, { headers });
  14 |   expect(JSON.stringify((await before.json()).items)).not.toContain('example.test/Case');
> 15 |   await page.getByRole('button', { name: 'Preview import', exact: true }).click();
     |                                                                           ^ Error: locator.click: Test timeout of 30000ms exceeded.
  16 |   await page.getByRole('button', { name: 'Import bookmarks', exact: true }).click();
  17 |   await expect(page.getByRole('status')).toContainText('Imported 2 bookmarks and 0 folders.');
  18 |   const downloaded = page.waitForEvent('download');
  19 |   await page.getByRole('button', { name: 'Export JSON backup' }).click();
  20 |   const download = await downloaded;
  21 |   expect(download.suggestedFilename()).toBe('bookmarx-bookmarks.json');
  22 |   const stream = await download.createReadStream();
  23 |   const chunks = []; for await (const chunk of stream!) chunks.push(chunk);
  24 |   const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  25 |   const bookmarks: any[] = [];
  26 |   const visit = (items: any[]) => items.forEach(item => item.type === 'bookmark' ? bookmarks.push(item) : visit(item.children));
  27 |   visit(data.items);
  28 |   expect(bookmarks.map(b => [b.title, b.url])).toEqual([
  29 |     ['Über & <safe>', 'https://example.test/Case?A=B'], ['Duplicate', 'https://example.test/Case?A=B'],
  30 |   ]);
  31 |   await page.getByLabel('Paste bookmarks').fill('https://valid.test/\nnot a URL');
  32 |   await page.getByRole('button', { name: 'Preview import', exact: true }).click();
  33 |   await expect(page.locator('details').getByRole('alert')).toContainText('Invalid bookmark URL');
  34 |   const after = await page.request.get(`${apiBase()}/collections/default/export`, { headers });
  35 |   expect(JSON.stringify((await after.json()).items)).not.toContain('valid.test');
  36 | });
  37 | 
  38 | test('file upload preserves an empty folder and rejects a malformed backup', async ({ page, freeAccount }) => {
  39 |   await loginAs(page, freeAccount);
  40 |   await page.goto('/collections/default');
  41 |   await page.getByText('Import, export & paste bookmarks', { exact: true }).click();
  42 |   await page.getByLabel('Bookmark file').setInputFiles({ name: 'bookmarks.html', mimeType: 'text/html',
  43 |     buffer: Buffer.from('<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p><DT><H3>Empty ü</H3><DL><p></DL><p></DL><p>') });
  44 |   await page.getByRole('button', { name: 'Preview import', exact: true }).click();
  45 |   await expect(page.getByText('0 bookmarks and 1 folders will be added.')).toBeVisible();
  46 |   await page.getByRole('button', { name: 'Import bookmarks', exact: true }).click();
  47 |   await expect(page.getByRole('status')).toContainText('Imported 0 bookmarks and 1 folders.');
  48 |   await page.getByLabel('Bookmark file').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{') });
  49 |   await page.getByRole('button', { name: 'Preview import', exact: true }).click();
  50 |   await expect(page.locator('details').getByRole('alert')).toBeVisible();
  51 | });
  52 | 
```