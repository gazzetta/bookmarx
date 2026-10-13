/// <reference path="../../src/extension/node_modules/@types/chrome/index.d.ts" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageManager } from '../../src/extension/background/StorageManager';
import { SyncManager } from '../../src/extension/background/SyncManager';
import { BookmarkManager } from '../../src/extension/background/BookmarkManager';

// Deterministic failure injection, not a substitute for real-browser acceptance.
let data: any;
let storage: StorageManager;
let sync: any;
let tree: any;
let chromeMock: any;
const pending = (overrides: any = {}) => ({
  needsInitialSync: false, cursor: 100, since: 1, summary: { total: 1 },
  changes: { creates: { folders: [], bookmarks: [] }, updates: { folders: [], bookmarks: [] }, deletes: { folders: [], bookmarks: [] }, ...overrides },
});
beforeEach(async () => {
  data = { changes: [], userId: 'user-a', deviceId: 'device', browserInstanceId: 'instance',
    auth: { token: 'token', user: { id: 'user-a', email: 'a@example.test', displayName: null } }, settings: { autoSync: false } };
  tree = { id: '0', title: '', children: [{ id: '1', title: 'Bookmarks bar', children: [] }, { id: '2', title: 'Other bookmarks', children: [] }] };
  chromeMock = { runtime: {}, storage: { local: {
    get: (_keys: any, cb: any) => cb(structuredClone(data)),
    set: (items: any, cb: any) => { Object.assign(data, structuredClone(items)); cb(); },
  } }, bookmarks: {
    getTree: (cb: any) => cb([tree]),
    getChildren: (id: string, cb: any) => {
      const find = (node: any): any => node.id === id ? node : node.children?.map(find).find(Boolean);
      cb(find(tree)?.children || []);
    },
    get: (_id: string, cb: any) => cb([{ id: _id }]),
    update: vi.fn((_id: string, _changes: any, cb: any) => cb({ id: _id })),
    move: vi.fn((_id: string, _changes: any, cb: any) => cb({ id: _id })),
  } };
  vi.stubGlobal('chrome', chromeMock);
  vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/140.0.0.0' });
  storage = new StorageManager();
  sync = new SyncManager(storage);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('extension launch gates: deterministic concurrency and failure injection', () => {
  it('E01: a bookmark queued during an in-flight push is retained for the next push', async () => {
    await storage.queueChange({ type: 'CREATE', data: { type: 'bookmark', browserId: 'sent' } });
    sync.getSyncStatus = async () => ({ success: true, data: { needsInitialSync: false } });
    sync.refreshMasterIdMap = async () => {};
    sync.sendChangesToServer = async () => {
      await storage.queueChange({ type: 'CREATE', data: { type: 'bookmark', browserId: 'new-during-request' } });
      return { success: true };
    };
    expect(await sync.sync()).toBe(true);
    expect((await storage.getQueuedChanges()).map((c: any) => c.data.browserId)).toContain('new-during-request');
  });

  it('E02: pushed edits carry the persisted master ID', async () => {
    await storage.setMasterIdMap({ master: { kind: 'bookmark', localId: 'local' } });
    let body: any;
    vi.stubGlobal('fetch', vi.fn(async (_url: any, options: any) => {
      body = JSON.parse(options.body);
      return { ok: true, json: async () => ({ success: true }) };
    }));
    await sync.sendChangesToServer([{ type: 'UPDATE', data: { type: 'bookmark', browserId: 'local', masterId: 'master', title: 'Updated' } }]);
    expect(body.changes[0].data.masterId).toBe('master');
  });

  it('E03: remote updates apply the new parent and position', async () => {
    sync.buildLocalIdMaps = async () => ({ localFolderMap: new Map([['parent', 'local-parent']]), localBookmarkMap: new Map([['bookmark', 'local-bm']]), masterUrls: new Set() });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ success: true, data: pending({ updates: {
      folders: [], bookmarks: [{ masterId: 'bookmark', title: 'Moved', url: 'https://example.test/', masterParentId: 'parent', position: 2 }],
    } }) }) })));
    expect((await sync.syncDown()).success).toBe(true);
    expect(chromeMock.bookmarks.move).toHaveBeenCalledWith('local-bm', { parentId: 'local-parent', index: 2 }, expect.any(Function));
  });

  it('E04: repeated apply failures never acknowledge and discard unapplied changes', async () => {
    sync.buildLocalIdMaps = async () => ({ localFolderMap: new Map(), localBookmarkMap: new Map(), masterUrls: new Set() });
    sync.createBookmarkNode = async () => { throw new Error('Injected unavailable browser API'); };
    const fetchMock = vi.fn(async (_url: any, _options?: any) => ({ ok: true, json: async () => ({ success: true, data: pending({ creates: {
      folders: [], bookmarks: [{ masterId: 'missing', title: 'Must survive', url: 'https://example.test/', parentId: '1' }],
    } }) }) }));
    vi.stubGlobal('fetch', fetchMock);
    for (let i = 0; i < 5; i++) await sync.syncDown();
    expect(fetchMock.mock.calls.filter((call: any) => String(call[0]).endsWith('/pending/ack'))).toHaveLength(0);
  });

  it('E05: Firefox parent resolution uses actual local root IDs', async () => {
    tree = { id: 'root________', title: '', children: [{ id: 'toolbar_____', title: 'Bookmarks Toolbar', children: [] }, { id: 'unfiled_____', title: 'Other Bookmarks', children: [] }] };
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 Firefox/150.0' });
    expect(await sync.resolveParentIdForSync(null, '1', new Map(), {})).toBe('toolbar_____');
  });

  it('E06: distinct case-sensitive URLs remain distinct identities', () => {
    expect(sync.normalizeUrl('https://example.test/Account?token=AbC')).not.toBe(sync.normalizeUrl('https://example.test/account?token=abc'));
  });

  it('E07: signing into another account clears the previous account queue and collection', async () => {
    await storage.queueChange({ type: 'CREATE', data: { browserId: 'private-a', type: 'bookmark' } });
    await storage.setCollection('collection-a', 'A');
    await storage.setMasterIdMap({ private: { kind: 'bookmark', localId: 'local-a' } });
    await storage.clearAuth();
    await storage.setAuth({ token: 'b', user: { id: 'user-b', email: 'b@example.test', displayName: null } });
    expect(await storage.getQueuedChanges()).toEqual([]);
    expect(await storage.getCollectionId()).toBeNull();
    expect(await storage.getMasterIdMap()).toEqual({});
  });

  it('E08: reordering within the same folder queues a move', async () => {
    chromeMock.bookmarks.get = (_id: string, callback: (nodes: any[]) => void) => callback([{ id: 'local', url: 'https://example.test/' }]);
    const manager: any = new BookmarkManager(storage);
    await manager.handleBookmarkMoved('local', { parentId: '1', oldParentId: '1', index: 0, oldIndex: 3 });
    expect((await storage.getQueuedChanges()).some((c: any) => c.type === 'MOVE')).toBe(true);
  });

  it('E09: switching to an unavailable collection preserves the old queue and selection', async () => {
    await storage.setCollection('old', 'Old');
    await storage.queueChange({ type: 'CREATE', data: { browserId: 'unsent', type: 'bookmark' } });
    sync.fetchMasterCollection = async () => ({ success: false, error: 'offline' });
    expect((await sync.switchCollection('new', 'New')).success).toBe(false);
    expect(await storage.getCollectionId()).toBe('old');
    expect((await storage.getQueuedChanges()).length).toBe(1);
  });

  it('E10: pulling a create preserves its sibling position', async () => {
    tree.children[0].children = [0, 1, 2].map(index => ({ id: `existing-${index}`, title: 'Existing', index }));
    sync.buildLocalIdMaps = async () => ({ localFolderMap: new Map(), localBookmarkMap: new Map(), masterUrls: new Set() });
    sync.createBookmarkNode = vi.fn(async () => ({ id: 'new-local' }));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ success: true, data: pending({ creates: {
      folders: [], bookmarks: [{ masterId: 'new', title: 'First', url: 'https://example.test/', parentId: '1', position: 0 }],
    } }) }) })));
    expect((await sync.syncDown()).success).toBe(true);
    expect(sync.createBookmarkNode).toHaveBeenCalledWith(expect.objectContaining({ parentId: '1', index: 0 }));
  });

  it('E11: an update to a missing local item cannot silently succeed and be acknowledged', async () => {
    sync.buildLocalIdMaps = async () => ({ localFolderMap: new Map(), localBookmarkMap: new Map(), masterUrls: new Set() });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ success: true, data: pending({ updates: {
      folders: [], bookmarks: [{ masterId: 'missing', title: 'Missing update', url: 'https://example.test/' }],
    } }) }) })));
    expect((await sync.syncDown()).success).toBe(false);
  });

  it('C02: overlapping storage queue writes retain both changes', async () => {
    await Promise.all([
      storage.queueChange({ type: 'CREATE', data: { browserId: 'one' } }),
      storage.queueChange({ type: 'CREATE', data: { browserId: 'two' } }),
    ]);
    expect((await storage.getQueuedChanges()).map((c: any) => c.data.browserId)).toEqual(['one', 'two']);
  });

  it('E12: an Opera Other bookmarks root maps to its actual local root, not Imported Bookmarks', async () => {
    // Root IDs and titles captured by windows-probe.cjs from real Opera 136.
    tree = { id: '0', title: '', children: [
      { id: '1', title: 'Bookmarks bar', children: [] },
      { id: '2', title: 'Imported Bookmarks', children: [] },
      { id: '5', title: 'Other bookmarks', children: [] },
    ] };
    sync.buildLocalIdMaps = async () => ({ localFolderMap: new Map(), localBookmarkMap: new Map(), masterUrls: new Set() });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ success: true, data: pending({ creates: {
      bookmarks: [], folders: [{ masterId: 'opera-other', browserId: '5', title: 'Other bookmarks', parentId: '0', masterParentId: null }],
    } }) }) })));
    expect((await sync.syncDown()).success).toBe(true);
    expect((await storage.getMasterIdMap())['opera-other'].localId).toBe('5');
  });

  it('E13: clearing a localized bookmarks bar uses its identity rather than its English title', async () => {
    tree = { id: '0', title: '', children: [{ id: '1', title: 'Lesezeichenleiste', children: [{ id: 'child', title: 'Child', url: 'https://example.test/' }] }] };
    sync.removeBookmarkNode = vi.fn(async () => { tree.children[0].children = []; });
    await sync.clearLocalBookmarks();
    expect(sync.removeBookmarkNode).toHaveBeenCalledWith('child');
  });
});
