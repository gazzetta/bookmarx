// tests/extension/cross-browser-sync.spec.ts
//
// Multi-peer sync: real extension in separate browser profiles, real server.
// Each peer = one isolated profile (its own deviceId / browserInstanceId).
//
// Asserts on BOTH sides of every hop:
//   - server truth via GET /sync/master-collection
//   - local truth via chrome.bookmarks in each peer's service worker
//
// Free accounts are used throughout (2-browser cap). The premium 3-browser
// happy path needs BOOKMARX_PREMIUM_PASSWORD and is not in this file yet.

import { test, expect } from '@playwright/test';
import { registerFreeUser } from './_fixtures';
import {
  launchPeer, seedAuth, sendFromPopup, getStorage, createBookmark, inBackground,
  findLocalByUrl, removeLocalByUrl, serverUrls, waitFor, retirePeer, type Peer,
} from './_peers';

const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
const url = (tag: string) => `https://example.com/xsync-${runId}-${tag}`;

const syncUp = (p: Peer) => sendFromPopup<any>(p, { action: 'syncNow' });
const syncDown = (p: Peer) => sendFromPopup<any>(p, { action: 'syncDown' });

test.describe('cross-browser sync — one account, two browsers', () => {
  test('A adds → server → B; B adds → A; A deletes → B', async () => {
    test.setTimeout(240000);
    const account = await registerFreeUser();
    let a: Peer | null = null;
    let b: Peer | null = null;
    try {
      a = await launchPeer('a', 'chromium');
      b = await launchPeer('b', 'msedge');
      await seedAuth(a, account);
      await seedAuth(b, account);
      const aDev = (await getStorage(a)).deviceId;
      const bDev = (await getStorage(b)).deviceId;

      // Hop 1: A adds, syncs up → server has it → B syncs down → B has it once.
      const u1 = url('a1');
      await createBookmark(a, '1', `XSYNC A1 ${runId}`, u1);
      const up1 = await syncUp(a);
      expect(up1, JSON.stringify(up1)).toMatchObject({ success: true });
      expect(await serverUrls(account, aDev)).toContain(u1);

      await syncDown(b);
      const bHas = await waitFor(() => findLocalByUrl(b!, u1), (r) => r.length > 0);
      expect(bHas, 'B should receive A\'s bookmark on Sync Down').toHaveLength(1);

      // Hop 2: B adds, syncs up → A syncs down. A's u1 must not be duplicated.
      const u2 = url('b1');
      await createBookmark(b, '1', `XSYNC B1 ${runId}`, u2);
      const up2 = await syncUp(b);
      expect(up2, JSON.stringify(up2)).toMatchObject({ success: true });
      const serverMid = await serverUrls(account, bDev);
      expect(serverMid.filter((u) => u === u1)).toHaveLength(1);
      expect(serverMid.filter((u) => u === u2)).toHaveLength(1);

      await syncDown(a);
      const aHas2 = await waitFor(() => findLocalByUrl(a!, u2), (r) => r.length > 0);
      expect(aHas2, 'A should receive B\'s bookmark on Sync Down').toHaveLength(1);
      expect(await findLocalByUrl(a, u1), 'A must not gain a duplicate of its own u1').toHaveLength(1);

      // Hop 3: A deletes u1, syncs up → server drops it → B syncs down → B drops it.
      await removeLocalByUrl(a, u1);
      const up3 = await syncUp(a);
      expect(up3, JSON.stringify(up3)).toMatchObject({ success: true });
      expect(await serverUrls(account, aDev)).not.toContain(u1);

      // Regression guard. A deleted bookmark is no longer in the master collection, so the
      // masterId map can't resolve it. syncDown falls back to the URL on the delete record
      // (SyncManager.syncDown delete loop). Previously this was skipped silently.
      await syncDown(b);
      const bGone = await waitFor(() => findLocalByUrl(b!, u1), (r) => r.length === 0);
      expect(bGone, 'B should drop u1 after A\'s delete propagates').toHaveLength(0);
    } finally {
      await retirePeer(a, null);
      await retirePeer(b, account);
    }
  });

  test('separate accounts are isolated: B never sees A\'s bookmarks', async () => {
    test.setTimeout(240000);
    const userA = await registerFreeUser();
    const userB = await registerFreeUser();
    let pa: Peer | null = null;
    let pb: Peer | null = null;
    try {
      pa = await launchPeer('iso-a', 'chromium');
      pb = await launchPeer('iso-b', 'msedge');
      await seedAuth(pa, userA);
      await seedAuth(pb, userB);
      const bDev = (await getStorage(pb)).deviceId;

      const uA = url('iso-a');
      const uB = url('iso-b');
      await createBookmark(pa, '1', `XSYNC ISO-A ${runId}`, uA);
      expect(await syncUp(pa)).toMatchObject({ success: true });

      await createBookmark(pb, '1', `XSYNC ISO-B ${runId}`, uB);
      expect(await syncUp(pb)).toMatchObject({ success: true });
      await syncDown(pb);

      // Prove B's sync actually ran (its own bookmark is present) before asserting absence.
      expect(await waitFor(() => findLocalByUrl(pb!, uB), (r) => r.length > 0)).toHaveLength(1);
      expect(await findLocalByUrl(pb, uA), 'user A\'s bookmark leaked to user B locally').toHaveLength(0);
      expect(await serverUrls(userB, bDev), 'user A\'s bookmark leaked to user B on server').not.toContain(uA);
    } finally {
      await retirePeer(pa, userA);
      await retirePeer(pb, userB);
    }
  });

  test('free tier: third browser is refused with BROWSER_LIMIT_REACHED', async () => {
    test.setTimeout(240000);
    const account = await registerFreeUser();
    let p1: Peer | null = null;
    let p2: Peer | null = null;
    let p3: Peer | null = null;
    try {
      // Three distinct fingerprints (browser|os|osVersion). Two plain Chromium
      // profiles would collide, and the server auto-replaces a same-fingerprint
      // browser instead of refusing it (premium.ts checkBrowserLimit).
      p1 = await launchPeer('cap-1', 'chromium');
      p2 = await launchPeer('cap-2', 'msedge');
      p3 = await launchPeer('cap-3', 'chromium', 'opera');
      for (const p of [p1, p2, p3]) await seedAuth(p, account);

      // Guard: the Opera UA override must reach the service worker, or this test is vacuous.
      const p3Ua = await inBackground<string>(p3, () => navigator.userAgent);
      expect(p3Ua).toContain('OPR/');

      const u1 = url('cap-1');
      const u2 = url('cap-2');
      const u3 = url('cap-3');
      await createBookmark(p1, '1', `XSYNC CAP-1 ${runId}`, u1);
      await createBookmark(p2, '1', `XSYNC CAP-2 ${runId}`, u2);
      await createBookmark(p3, '1', `XSYNC CAP-3 ${runId}`, u3);

      expect(await syncUp(p1)).toMatchObject({ success: true });
      expect(await syncUp(p2)).toMatchObject({ success: true });

      // Regression guard. The server returns 403 with BROWSER_LIMIT_REACHED. The delta path
      // must keep that code and upgradeUrl, not collapse it to "Server returned 403".
      const third = await syncUp(p3);
      expect(third, JSON.stringify(third)).toMatchObject({ success: false });
      expect(third.error?.code).toBe('BROWSER_LIMIT_REACHED');
      expect(third.error?.upgradeUrl ?? '').toContain('/upgrade');

      const d1 = (await getStorage(p1)).deviceId;
      expect(await serverUrls(account, d1), 'refused browser\'s bookmark must not reach the server').not.toContain(u3);
    } finally {
      await retirePeer(p3, null);
      await retirePeer(p2, null);
      await retirePeer(p1, account);
    }
  });
});
