import { test, expect } from '@playwright/test';
import { registerFreeUser } from './_fixtures';
import { launchPeer, seedAuth, sendFromPopup, createBookmark, removeLocalByUrl, findLocalByUrl,
    createFolder, getStorage, inBackground, waitFor, retirePeer, type Peer } from './_peers';

test('a clean Brave baselines an empty master without offering historical deletes, then receives later edits', async () => {
    test.setTimeout(120000);
    const account = await registerFreeUser();
    let a: Peer | null = null;
    let b: Peer | null = null;
    try {
        a = await launchPeer('empty-baseline-source');
        await seedAuth(a, account);
        const oldUrl = 'https://example.com/baseline-deleted';
        await createBookmark(a, '2', 'Previously deleted', oldUrl);
        expect(await sendFromPopup(a, { action: 'syncNow' })).toMatchObject({ success: true });
        await removeLocalByUrl(a, oldUrl);
        expect(await sendFromPopup(a, { action: 'syncNow' })).toMatchObject({ success: true });

        b = await launchPeer('empty-baseline-brave', 'brave');
        await seedAuth(b, account);
        expect(await sendFromPopup(b, { action: 'baselineEmptyCollection' })).toMatchObject({ success: true });
        const status: any = await sendFromPopup(b, { action: 'getSyncStatus' });
        expect(Object.values(status.data.remote).every(count => count === 0)).toBe(true);
        expect(await findLocalByUrl(b, oldUrl)).toHaveLength(0);
        expect((await getStorage(b)).lastSync).toBeGreaterThan(0);

        const newUrl = 'https://example.com/baseline-new';
        await createBookmark(a, '1', 'After baseline', newUrl);
        expect(await sendFromPopup(a, { action: 'syncNow' })).toMatchObject({ success: true });
        expect(await sendFromPopup(b, { action: 'getSyncStatus' })).toMatchObject({ data: { remote: { adds: 1 } } });
        expect(await sendFromPopup(b, { action: 'syncDown' })).toMatchObject({ success: true });
        expect(await findLocalByUrl(b, newUrl)).toHaveLength(1);
        await removeLocalByUrl(a, newUrl);
        expect(await sendFromPopup(a, { action: 'syncNow' })).toMatchObject({ success: true });
        // This deletion affects a real local bookmark and must not be auto-baselined.
        expect(await sendFromPopup(b, { action: 'baselineEmptyCollection' })).toMatchObject({ data: { baselined: false } });
        expect(await findLocalByUrl(b, newUrl)).toHaveLength(1);
        expect(await sendFromPopup(b, { action: 'getSyncStatus' })).toMatchObject({ data: { remote: { deletes: 1 } } });
        expect(await sendFromPopup(b, { action: 'syncDown' })).toMatchObject({ success: true });
        expect(await findLocalByUrl(b, newUrl)).toHaveLength(0);

        // Pause AFTER an empty snapshot has been captured, then commit a remote addition.
        // Acknowledging the captured cursor must leave that newer addition pending.
        const retiredUrl = 'https://example.com/baseline-retired';
        await createBookmark(a, '1', 'Retired before next baseline', retiredUrl);
        expect(await sendFromPopup(a, { action: 'syncNow' })).toMatchObject({ success: true });
        await removeLocalByUrl(a, retiredUrl);
        expect(await sendFromPopup(a, { action: 'syncNow' })).toMatchObject({ success: true });
        await inBackground(b, () => {
            const originalFetch = globalThis.fetch.bind(globalThis);
            let captured = false;
            const barrier = (globalThis as any).__emptyBaselineBarrier = { entered: false, release: undefined as (() => void) | undefined };
            globalThis.fetch = async (input: any, init?: RequestInit) => {
                const response = await originalFetch(input, init);
                if (!captured && String(input).endsWith('/sync/master-collection')) {
                    captured = true;
                    barrier.entered = true;
                    await new Promise<void>(resolve => { barrier.release = resolve; });
                    globalThis.fetch = originalFetch;
                }
                return response;
            };
        });
        const baseline = sendFromPopup(b, { action: 'baselineEmptyCollection' });
        await waitFor(() => inBackground(b!, () => Boolean((globalThis as any).__emptyBaselineBarrier?.entered)), entered => entered, 10000);
        const raceUrl = 'https://example.com/baseline-arrived-after-snapshot';
        await createBookmark(a, '1', 'Arrived after snapshot', raceUrl);
        expect(await sendFromPopup(a, { action: 'syncNow' })).toMatchObject({ success: true });
        await inBackground(b, () => (globalThis as any).__emptyBaselineBarrier.release());
        expect(await baseline).toMatchObject({ success: true });
        expect(await sendFromPopup(b, { action: 'getSyncStatus' })).toMatchObject({ data: { remote: { adds: 1 } } });
        expect(await findLocalByUrl(b, raceUrl)).toHaveLength(0);
        expect(await sendFromPopup(b, { action: 'syncDown' })).toMatchObject({ success: true });
        expect(await findLocalByUrl(b, raceUrl)).toHaveLength(1);
    } finally {
        if (b) await inBackground(b, () => (globalThis as any).__emptyBaselineBarrier?.release?.()).catch(() => {});
        await retirePeer(a, null);
        await retirePeer(b, account);
    }
});

test('an empty user folder is not mistaken for an empty master baseline', async () => {
    test.setTimeout(60000);
    const account = await registerFreeUser();
    let a: Peer | null = null;
    let b: Peer | null = null;
    try {
        a = await launchPeer('folder-baseline-source');
        await seedAuth(a, account);
        await createFolder(a, '1', 'Other Bookmarks');
        expect(await sendFromPopup(a, { action: 'syncNow' })).toMatchObject({ success: true });
        b = await launchPeer('folder-baseline-brave', 'brave');
        await seedAuth(b, account);
        expect(await sendFromPopup(b, { action: 'baselineEmptyCollection' })).toMatchObject({ data: { baselined: false } });
        const status: any = await sendFromPopup(b, { action: 'getSyncStatus' });
        expect(status.data.remote.addsFolders).toBeGreaterThan(0);
        expect((await getStorage(b)).lastSync || 0).toBe(0);
    } finally {
        await retirePeer(a, null);
        await retirePeer(b, account);
    }
});
