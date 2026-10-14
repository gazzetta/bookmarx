import { test, expect } from '@playwright/test';
import { registerFreeUser } from './_fixtures';
import { getStorage, inBackground, launchPeer, retirePeer, seedAuth, sendFromPopup, waitFor, type Peer } from './_peers';

test('account changes wait for an in-flight sync to finish', async () => {
  test.setTimeout(60000);
  const firstAccount = await registerFreeUser();
  const nextAccount = await registerFreeUser();
  let peer: Peer | null = null;
  let syncPromise: Promise<any> | null = null;
  const workerLogs: string[] = [];
  try {
    peer = await launchPeer('account-transition');
    let initializedResolve!: () => void;
    const initialized = new Promise<void>(resolve => { initializedResolve = resolve; });
    const watchWorker = (worker: any) => worker.on('console', (message: any) => {
      const line = message.text();
      workerLogs.push(line);
      if (line.includes('BookMarx background service initialized')) initializedResolve();
    });
    peer.context.on('serviceworker', watchWorker);
    for (const worker of peer.context.serviceWorkers()) watchWorker(worker);
    await Promise.race([
      initialized,
      new Promise<void>((_, reject) => setTimeout(() => reject(new Error('Background initialization timed out')), 10000)),
    ]);

    await seedAuth(peer, firstAccount);
    await inBackground(peer, () => {
      const originalFetch = globalThis.fetch.bind(globalThis);
      (globalThis as any).__bookmarxOriginalFetch = originalFetch;
      let blocked = false;
      const control = (globalThis as any).__bookmarxSyncBarrier = { entered: false, finished: false, release: undefined as (() => void) | undefined };
      globalThis.fetch = async (input: any, init?: RequestInit) => {
        const url = String(input);
        const headers = (init?.headers || {}) as Record<string, string>;
        const isSyncManagerStatus = Object.keys(headers).some(key => key.toLowerCase() === 'x-device-id');
        if (!blocked && url.includes('/api/v1/sync/status') && isSyncManagerStatus) {
          blocked = true;
          control.entered = true;
          await new Promise<void>(resolve => { control.release = resolve; });
        }
        const response = await originalFetch(input, init);
        if (isSyncManagerStatus) control.finished = true;
        return response;
      };
    });

    syncPromise = sendFromPopup<any>(peer, { action: 'syncNow' });
    await waitFor(() => inBackground(peer!, () => Boolean((globalThis as any).__bookmarxSyncBarrier?.entered)), entered => entered, 10000);
    let accountChangeFinished = false;
    const accountChange = sendFromPopup<any>(peer, { action: 'setAuth', data: {
      token: nextAccount.token,
      user: { id: nextAccount.userId, email: nextAccount.email, displayName: null, isPremium: false, subscriptionTier: 'free' }
    } }).then(result => { accountChangeFinished = true; return result; });

    await new Promise(resolve => setTimeout(resolve, 150));
    const barrierState = await inBackground(peer, () => {
      const { entered, finished } = (globalThis as any).__bookmarxSyncBarrier;
      return { entered, finished };
    });
    expect(barrierState, workerLogs.join('\n')).toMatchObject({ entered: true, finished: false });
    expect(accountChangeFinished, workerLogs.join('\n')).toBe(false);
    expect((await getStorage(peer)).userId).toBe(firstAccount.userId);

    await inBackground(peer, () => (globalThis as any).__bookmarxSyncBarrier?.release?.());
    expect(await syncPromise).toMatchObject({ success: true });
    expect(await accountChange).toMatchObject({ success: true });
    expect((await getStorage(peer)).userId).toBe(nextAccount.userId);
  } finally {
    if (peer) {
      await inBackground(peer, () => (globalThis as any).__bookmarxSyncBarrier?.release?.()).catch(() => {});
      await syncPromise?.catch(() => {});
      await inBackground(peer, () => {
        const originalFetch = (globalThis as any).__bookmarxOriginalFetch;
        if (originalFetch) globalThis.fetch = originalFetch;
        delete (globalThis as any).__bookmarxOriginalFetch;
        delete (globalThis as any).__bookmarxSyncBarrier;
      }).catch(() => {});
    }
    await retirePeer(peer, firstAccount);
  }
});

declare const chrome: any;
