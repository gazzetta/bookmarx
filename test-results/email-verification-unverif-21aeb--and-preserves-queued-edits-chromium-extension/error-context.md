# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: email-verification.spec.ts >> unverified signup locks the popup and API; the website confirmation unlocks the same session and preserves queued edits
- Location: tests\extension\email-verification.spec.ts:6:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: 'Verify email address', exact: true })
Expected: visible
Timeout: 30000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 30000ms
  - waiting for getByRole('button', { name: 'Verify email address', exact: true })

```

```yaml
- main:
  - link "BookMarx":
    - /url: /
  - heading "Verify your email" [level=1]
  - paragraph: Open the link in your confirmation email, or sign in to request another email.
  - link "Sign in":
    - /url: /login
- alert
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { apiBase } from './_fixtures';
  3  | import { issueLocalTestVerificationToken } from '../local-entitlements';
  4  | import { launchPeer, seedAuth, createBookmark, sendFromPopup, getStorage, retirePeer, type Peer } from './_peers';
  5  | 
  6  | test('unverified signup locks the popup and API; the website confirmation unlocks the same session and preserves queued edits', async () => {
  7  |     test.setTimeout(120000);
  8  |     const base = apiBase().replace(/\/api\/v1$/, '');
  9  |     const email = `free-l3-verification-${Date.now()}@bookmarx.test`;
  10 |     const password = 'Verification-test123!';
  11 |     const registration = await (await fetch(`${apiBase()}/auth/register`, { method: 'POST',
  12 |         headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).json();
  13 |     expect(registration.data.user.emailVerified).toBe(false);
  14 |     const auth = { email, password, token: registration.data.token, userId: registration.data.user.id, isPremium: false };
  15 |     let peer: Peer | null = null;
  16 |     try {
  17 |         peer = await launchPeer('email-verification');
  18 |         await seedAuth(peer, auth);
  19 |         await createBookmark(peer, '1', 'Kept while verifying', 'https://example.com/verification-kept');
  20 |         const popup = await peer.context.newPage();
  21 |         await popup.goto(`chrome-extension://${peer.extId}/popup/index.html`);
  22 |         await expect(popup.locator('#emailVerificationNotice')).toBeVisible();
  23 |         await expect(popup.locator('#syncUp')).toBeDisabled();
  24 |         await expect(popup.locator('#overwriteFromMaster')).toBeDisabled();
  25 |         await expect(popup.locator('#openManager')).toBeDisabled();
  26 |         const blocked: any = await sendFromPopup(peer, { action: 'syncNow' });
  27 |         expect(blocked.success).toBe(false);
  28 |         expect((await getStorage(peer)).changes).toHaveLength(1);
  29 |         const token = issueLocalTestVerificationToken(base, auth.userId, email);
  30 |         const website = await peer.context.newPage();
  31 |         const requests: string[] = [];
  32 |         let confirmations = 0;
  33 |         website.on('request', req => {
  34 |             requests.push(req.url());
  35 |             if (req.method() === 'POST' && req.url().endsWith('/auth/verify-email')) confirmations++;
  36 |         });
  37 |         await website.goto(`${base}/verify-email#token=${token}`);
  38 |         const confirm = website.getByRole('button', { name: 'Verify email address', exact: true });
> 39 |         await expect(confirm).toBeVisible({ timeout: 30000 });
     |                               ^ Error: expect(locator).toBeVisible() failed
  40 |         expect(confirmations).toBe(0);
  41 |         expect(requests.some(url => url.includes(token))).toBe(false);
  42 |         await confirm.click();
  43 |         await expect(website.getByRole('heading', { name: 'Email verified', exact: true })).toBeVisible();
  44 |         expect(confirmations).toBe(1);
  45 |         await popup.locator('#refreshVerification').click();
  46 |         await expect(popup.locator('#emailVerificationNotice')).toBeHidden();
  47 |         await expect(popup.locator('#syncUp')).toBeEnabled();
  48 |         expect((await getStorage(peer)).changes).toHaveLength(1);
  49 |         expect((await getStorage(peer)).auth.token).toBe(auth.token);
  50 |         expect(await sendFromPopup(peer, { action: 'syncNow' })).toMatchObject({ success: true });
  51 |         const master = await (await fetch(`${apiBase()}/sync/master-collection`, { headers: {
  52 |             Authorization: `Bearer ${auth.token}`, 'X-Browser-Instance-ID': (await getStorage(peer)).browserInstanceId
  53 |         } })).json();
  54 |         expect(master.data.bookmarks).toHaveLength(1);
  55 |         expect(master.data.bookmarks[0].url).toBe('https://example.com/verification-kept');
  56 |     } finally { await retirePeer(peer, auth); }
  57 | });
  58 | 
```