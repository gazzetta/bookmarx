import { test, expect } from '@playwright/test';
import { launchPeer, inBackground, sendFromPopup, retirePeer, type Peer } from './_peers';

test('new notification episodes use fresh IDs and retire only older alerts of the same kind', async () => {
    let peer: Peer | null = null;
    try {
        peer = await launchPeer('notification-replay');
        await inBackground(peer, () => {
            const state = (globalThis as any).__notificationReplay = {
                active: { 'bookmarx-test': {}, 'bookmarx-remote-pending:unrelated': {} } as Record<string, any>,
                created: [] as string[], cleared: [] as string[], suppressed: [] as string[]
            };
            chrome.notifications.getPermissionLevel = callback => callback('granted');
            chrome.notifications.getAll = callback => callback({ ...state.active });
            chrome.notifications.create = ((id: string, options: any, callback: any) => {
                if (state.active[id]) state.suppressed.push(id);
                state.created.push(id);
                state.active[id] = options;
                callback(id);
            }) as any;
            chrome.notifications.clear = (id, callback) => {
                state.cleared.push(id);
                const existed = Boolean(state.active[id]);
                delete state.active[id];
                callback?.(existed);
            };
        });
        expect(await sendFromPopup(peer, { action: 'testNotification' })).toMatchObject({ success: true });
        expect(await sendFromPopup(peer, { action: 'testNotification' })).toMatchObject({ success: true });
        const state = await inBackground(peer, () => (globalThis as any).__notificationReplay);
        expect(state.created).toHaveLength(2);
        expect(new Set(state.created).size).toBe(2);
        expect(state.suppressed).toEqual([]);
        expect(state.cleared).toEqual(['bookmarx-test', state.created[0]]);
        expect(Object.keys(state.active).sort()).toEqual(['bookmarx-remote-pending:unrelated', state.created[1]].sort());
    } finally {
        await retirePeer(peer, null);
    }
});
