import { test, expect } from '@playwright/test';
import { apiBase } from './_fixtures';
import { issueLocalTestVerificationToken } from '../local-entitlements';
import { launchPeer, seedAuth, createBookmark, sendFromPopup, getStorage, retirePeer, type Peer } from './_peers';

test('unverified signup locks the popup and API; the website confirmation unlocks the same session and preserves queued edits', async () => {
    test.setTimeout(120000);
    const base = apiBase().replace(/\/api\/v1$/, '');
    const email = `free-l3-verification-${Date.now()}@bookmarx.test`;
    const password = 'Verification-test123!';
    const registration = await (await fetch(`${apiBase()}/auth/register`, { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).json();
    expect(registration.data.user.emailVerified).toBe(false);
    const auth = { email, password, token: registration.data.token, userId: registration.data.user.id, isPremium: false };
    let peer: Peer | null = null;
    try {
        peer = await launchPeer('email-verification');
        await seedAuth(peer, auth);
        await createBookmark(peer, '1', 'Kept while verifying', 'https://example.com/verification-kept');
        const popup = await peer.context.newPage();
        await popup.goto(`chrome-extension://${peer.extId}/popup/index.html`);
        await expect(popup.locator('#emailVerificationNotice')).toBeVisible();
        await expect(popup.locator('#syncUp')).toBeDisabled();
        await expect(popup.locator('#overwriteFromMaster')).toBeDisabled();
        await expect(popup.locator('#openManager')).toBeDisabled();
        const blocked: any = await sendFromPopup(peer, { action: 'syncNow' });
        expect(blocked.success).toBe(false);
        expect((await getStorage(peer)).changes).toHaveLength(1);
        const token = issueLocalTestVerificationToken(base, auth.userId, email);
        const website = await peer.context.newPage();
        const requests: string[] = [];
        let confirmations = 0;
        website.on('request', req => {
            requests.push(req.url());
            if (req.method() === 'POST' && req.url().endsWith('/auth/verify-email')) confirmations++;
        });
        await website.goto(`${base}/verify-email#token=${token}`);
        const confirm = website.getByRole('button', { name: 'Verify email address', exact: true });
        await expect(confirm).toBeVisible({ timeout: 30000 });
        expect(confirmations).toBe(0);
        expect(requests.some(url => url.includes(token))).toBe(false);
        await confirm.click();
        await expect(website.getByRole('heading', { name: 'Email verified', exact: true })).toBeVisible();
        expect(confirmations).toBe(1);
        await popup.locator('#refreshVerification').click();
        await expect(popup.locator('#emailVerificationNotice')).toBeHidden();
        await expect(popup.locator('#syncUp')).toBeEnabled();
        expect((await getStorage(peer)).changes).toHaveLength(1);
        expect((await getStorage(peer)).auth.token).toBe(auth.token);
        expect(await sendFromPopup(peer, { action: 'syncNow' })).toMatchObject({ success: true });
        const storage = await getStorage(peer);
        const master = await (await fetch(`${apiBase()}/sync/master-collection`, { headers: {
            Authorization: `Bearer ${auth.token}`, 'X-Browser-Instance-ID': storage.browserInstanceId, 'X-Device-ID': storage.deviceId
        } })).json();
        expect(master.success, JSON.stringify(master)).toBe(true);
        expect(master.data.bookmarks).toHaveLength(1);
        expect(master.data.bookmarks[0].url).toBe('https://example.com/verification-kept');
    } finally { await retirePeer(peer, auth); }
});
