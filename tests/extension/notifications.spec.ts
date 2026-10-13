// tests/extension/notifications.spec.ts
//
// L3 — Remote-change notification, across two real browser profiles:
//   - Peer B baselines with a Sync Down, then its notification state is reset.
//   - Peer A pushes a new bookmark (Sync Up).
//   - B runs a status check and records notificationState.remoteCount > 0.
//
// The status check is triggered with the getSyncStatus message rather than by
// waiting for the chrome.alarms cycle. Both paths call maybeNotifySyncStatus with
// the server's remote counts (background/index.ts getSyncStatus handler and
// checkSyncStatusAndNotify). Waiting on the 30s alarm made this test flaky: two of
// three runs saw no notification within 75s. Alarm wiring is covered by install.spec.ts.
//
// Asserts on notificationState, the source of truth for the notification.
// The OS notification itself can't be read from an MV3 extension.

import { test, expect } from '@playwright/test';
import { registerFreeUser } from './_fixtures';
import {
  launchPeer, seedAuth, sendFromPopup, getStorage, createBookmark, waitFor, inBackground,
  retirePeer, type Peer,
} from './_peers';

const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

test.describe('Notifications', () => {
  test('a change pushed by one browser raises a remote-pending notification in another', async () => {
    test.setTimeout(180000);
    const account = await registerFreeUser();
    let a: Peer | null = null;
    let b: Peer | null = null;
    try {
      a = await launchPeer('notif-a', 'chromium');
      b = await launchPeer('notif-b', 'msedge');
      await seedAuth(a, account);
      await seedAuth(b, account);

      // Baseline: A publishes one bookmark, B pulls it, so B's watermark is current.
      await createBookmark(a, '1', `XNOTIFY BASE ${runId}`, `https://example.com/xnotify-base-${runId}`);
      expect(await sendFromPopup(a, { action: 'syncNow' })).toMatchObject({ success: true });
      expect(await sendFromPopup(b, { action: 'syncDown' })).toMatchObject({ success: true });

      // B's startup status check counted the baseline bookmark as remote, and that count
      // isn't cleared until a later check finds zero. Reset it, so only A's push can raise it.
      await sendFromPopup(b, { action: 'resetNotificationState' });
      expect((await getStorage(b)).notificationState?.remoteCount ?? 0).toBe(0);

      // A pushes a change that B hasn't pulled.
      await createBookmark(a, '1', `XNOTIFY NEW ${runId}`, `https://example.com/xnotify-new-${runId}`);
      expect(await sendFromPopup(a, { action: 'syncNow' })).toMatchObject({ success: true });

      // B checks the server. The check records the remote count as a notification.
      await sendFromPopup(b, { action: 'getSyncStatus' });
      const remoteCount = await waitFor(
        async () => (await getStorage(b!)).notificationState?.remoteCount ?? 0,
        (n) => n > 0,
        10000,
      );
      expect(remoteCount, 'B should record a remote-pending notification after A\'s push').toBeGreaterThan(0);
    } finally {
      await retirePeer(a, null);
      await retirePeer(b, account);
    }
  });
});

// Same scenario as above, but nothing triggers the status check. Only the 30s alarm can record the notification.
test.describe('Remote notification via the alarm alone', () => {
  test('B is notified by its own alarm cycle after A pushes', async () => {
    test.setTimeout(180000);
    const account = await registerFreeUser();
    let a: Peer | null = null;
    let b: Peer | null = null;
    try {
      a = await launchPeer('alarm-notif-a', 'chromium');
      b = await launchPeer('alarm-notif-b', 'msedge');
      await seedAuth(a, account);
      await seedAuth(b, account);

      await createBookmark(a, '1', `XNOTIFY ABASE ${runId}`, `https://example.com/xnotify-abase-${runId}`);
      expect(await sendFromPopup(a, { action: 'syncNow' })).toMatchObject({ success: true });
      expect(await sendFromPopup(b, { action: 'syncDown' })).toMatchObject({ success: true });
      await sendFromPopup(b, { action: 'resetNotificationState' });

      await createBookmark(a, '1', `XNOTIFY ANEW ${runId}`, `https://example.com/xnotify-anew-${runId}`);
      expect(await sendFromPopup(a, { action: 'syncNow' })).toMatchObject({ success: true });

      const remoteCount = await waitFor(
        async () => (await getStorage(b!)).notificationState?.remoteCount ?? 0,
        (n) => n > 0,
        75000,
      );
      expect(remoteCount, "the alarm cycle should record B's remote-pending notification").toBeGreaterThan(0);
    } finally {
      await retirePeer(a, null);
      await retirePeer(b, account);
    }
  });
});

// The periodic status alarm runs on its own. A periodic alarm's scheduledTime advances each time it
// fires. Reading that avoids depending on a listener, which a restarted service worker would lose.
test.describe('Status alarm', () => {
  test('the sync-status alarm fires on its own within one cycle', async () => {
    test.setTimeout(120000);
    const account = await registerFreeUser();
    let b: Peer | null = null;
    try {
      b = await launchPeer('alarm-b', 'chromium');
      await seedAuth(b, account);

      const scheduledAt = () => inBackground<number | null>(b!, () => new Promise((resolve) => {
        chrome.alarms.get('sync-status-check', (alarm: any) => resolve(alarm ? alarm.scheduledTime : null));
      }));

      // The alarm is created during service-worker initialisation, after a few awaited steps. Wait for it.
      const first = await waitFor(scheduledAt, (t) => t !== null, 20000);
      expect(first, 'the sync-status alarm should be registered').not.toBeNull();
      const advanced = await waitFor(scheduledAt, (t) => t !== null && t > (first as number), 75000);
      expect(advanced, 'the alarm should fire and reschedule within one cycle (30s)').toBeGreaterThan(first as number);
    } finally {
      await retirePeer(b, account);
    }
  });
});
