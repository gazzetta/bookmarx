import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';

const native = vi.hoisted(() => ({
  disk: new Map<string, string>(), secure: new Map<string, string>(), sequence: 0,
  setItem: vi.fn(), getItem: vi.fn(), fetch: vi.fn(),
}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: native.getItem, setItem: native.setItem } }));
vi.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => native.secure.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { native.secure.set(key, value); },
  deleteItemAsync: async (key: string) => { native.secure.delete(key); },
}));
vi.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++native.sequence}` }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));

const user = (id = 'A', premium = true) => ({ id, email: `${id}@example.com`, displayName: id, emailVerified: true, emailVerifiedAt: 1, subscriptionTier: premium ? 'premium' as const : 'free' as const, isPremium: premium, bookmarkLimit: 100, browserLimit: 3, collectionLimit: 2 });
const counts = { bookmarkCount: 2, browserCount: 1, collectionCount: 1 };
const bookmark = (masterId: string, title = masterId) => ({ id: 1, masterId, browserId: 'browser', userId: 'A', title, url: 'https://example.com', parentId: '', masterParentId: null, position: 0, dateAdded: 1, status: 'active' as const, syncVersion: 0, createdAt: 1, updatedAt: 1 });
const success = <T>(data: T) => ({ success: true, data });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
async function tick() { for (let i = 0; i < 15; i++) await Promise.resolve(); }

async function setup(online = false) {
  const session = await import('../../src/mobile/services/session');
  const { api } = await import('../../src/mobile/services/api');
  const { useBookmarkStore: bookmarks } = await import('../../src/mobile/store/bookmarkStore');
  const { useSyncQueue: queue } = await import('../../src/mobile/store/syncQueue');
  session.setSessionUser('A');
  queue.getState().setOnline(false);
  await bookmarks.getState().hydrate();
  queue.getState().setEnabled(true);
  const apply = vi.spyOn(api, 'applyQueuedChange').mockImplementation(async change => success({ results: [{ masterId: `real-${change.queueId}` }] }));
  vi.spyOn(api, 'getMasterCollection').mockResolvedValue(success({ folders: [], bookmarks: [], timestamp: 1 }));
  if (online) queue.getState().setOnline(true);
  return { session, api, bookmarks, queue, apply };
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubGlobal('__DEV__', false);
  vi.stubGlobal('fetch', native.fetch);
  native.disk.clear(); native.secure.clear(); native.sequence = 0;
  native.getItem.mockReset().mockImplementation(async key => native.disk.get(key) ?? null);
  native.setItem.mockReset().mockImplementation(async (key, value) => { native.disk.set(key, value); });
  native.fetch.mockReset();
});
afterEach(async () => {
  const { setSessionUser } = await import('../../src/mobile/services/session');
  setSessionUser(null);
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

describe('durable sync', () => {
  it('keeps and applies a second save enqueued while a request is pending', async () => {
    const { queue, bookmarks, apply } = await setup(true);
    const first = deferred<any>();
    apply.mockImplementationOnce(() => first.promise);
    const saving = bookmarks.getState().addBookmark('https://one.example', 'One', null);
    await tick();
    const second = bookmarks.getState().addBookmark('https://two.example', 'Two', null);
    await tick();
    expect(queue.getState().queue).toHaveLength(2);
    first.resolve(success({ results: [{ masterId: 'one-real' }] }));
    expect((await saving).success).toBe(true);
    expect((await second).success).toBe(true);
    expect(apply).toHaveBeenCalledTimes(2);
    expect(queue.getState().queue).toHaveLength(0);
    expect(bookmarks.getState().bookmarks.map(b => b.title)).toEqual(['One', 'Two']);
    expect(JSON.parse(native.disk.get('account:A:sync_queue')!)).toEqual([]);
  });

  it('retains a network failure and retries without another connectivity event', async () => {
    const { queue, bookmarks, apply } = await setup(true);
    apply.mockResolvedValueOnce({ success: false, error: { code: 'NETWORK_ERROR', retryable: true, message: 'Offline' } });
    expect((await bookmarks.getState().addBookmark('https://one.example', 'One', null)).success).toBe(true);
    expect(queue.getState().queue).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(queue.getState().queue).toHaveLength(0);
    expect(bookmarks.getState().bookmarks[0].masterId).toMatch(/^real-/);
  });

  it('replaces temporary folder references before replaying its nested contents', async () => {
    const { queue, bookmarks, apply } = await setup();
    await bookmarks.getState().createFolder('Parent', null);
    const parent = bookmarks.getState().folders[0].masterId;
    await bookmarks.getState().createFolder('Nested', parent);
    const nested = bookmarks.getState().folders.find(f => f.title === 'Nested')!.masterId;
    await bookmarks.getState().addBookmark('https://child.example', 'Child', nested);
    queue.getState().setOnline(true);
    await queue.getState().replay();
    const calls = apply.mock.calls.map(([change]) => change);
    expect(calls[1].payload.masterParentId).toBe(`real-${calls[0].queueId}`);
    expect(calls[2].payload.masterParentId).toBe(`real-${calls[1].queueId}`);
    expect(bookmarks.getState().getBookmarksInFolder(nested)[0].title).toBe('Child');
    expect(bookmarks.getState().folders.every(f => !f.masterId.startsWith('temp-'))).toBe(true);
  });

  it('restores confirmed state when edits and deletes are rejected', async () => {
    const { bookmarks, api, apply } = await setup(true);
    vi.mocked(api.getMasterCollection).mockResolvedValue(success({ folders: [], bookmarks: [bookmark('existing', 'Original')], timestamp: 1 }));
    await bookmarks.getState().fetchMasterCollection(true);
    apply.mockResolvedValue({ success: false, error: { status: 403, message: 'Not allowed' } });
    expect((await bookmarks.getState().updateBookmark('existing', { title: 'Rejected' })).success).toBe(false);
    expect(bookmarks.getState().bookmarks[0].title).toBe('Original');
    expect((await bookmarks.getState().deleteBookmark('existing')).success).toBe(false);
    expect(bookmarks.getState().bookmarks).toHaveLength(1);
    expect((await bookmarks.getState().addBookmark('https://rejected.example', 'Phantom', null)).success).toBe(false);
    expect(bookmarks.getState().bookmarks).toHaveLength(1);
  });

  it('rejects dependent child saves if their new destination folder is rejected', async () => {
    const { queue, bookmarks, apply } = await setup();
    await bookmarks.getState().createFolder('Rejected folder', null);
    await bookmarks.getState().addBookmark('https://child.example', 'Child', bookmarks.getState().folders[0].masterId);
    apply.mockResolvedValue({ success: false, error: { status: 403, message: 'Limit reached' } });
    queue.getState().setOnline(true);
    await queue.getState().replay();
    expect(apply).toHaveBeenCalledTimes(1);
    expect(queue.getState().lastDroppedCount).toBe(2);
    expect(bookmarks.getState().folders).toEqual([]);
    expect(bookmarks.getState().bookmarks).toEqual([]);
  });

  it('does not report a successful save if local persistence fails', async () => {
    const { queue, bookmarks, apply } = await setup(true);
    native.setItem.mockRejectedValueOnce(new Error('Disk full'));
    expect((await bookmarks.getState().addBookmark('https://one.example', 'One', null)).success).toBe(false);
    expect(bookmarks.getState().bookmarks).toEqual([]);
    expect(queue.getState().queue).toEqual([]);
    expect(apply).not.toHaveBeenCalled();
  });

  it('rehydrates pending edits over the account cache after restarting', async () => {
    const { queue, bookmarks, session } = await setup();
    await bookmarks.getState().createFolder('Offline folder', null);
    await bookmarks.getState().addBookmark('https://child.example', 'Child', bookmarks.getState().folders[0].masterId);
    session.setSessionUser(null);
    session.setSessionUser('A');
    await bookmarks.getState().hydrate();
    expect(queue.getState().queue).toHaveLength(2);
    expect(bookmarks.getState().folders).toHaveLength(1);
    expect(bookmarks.getState().bookmarks).toHaveLength(1);
  });

  it('preserves the full cache when replaying an edit in an inactive collection', async () => {
    const { queue, bookmarks } = await setup();
    native.disk.set('account:A:collection_cache_other', JSON.stringify({ folders: [], bookmarks: [bookmark('already-saved')], timestamp: 1 }));
    await queue.getState().enqueue({ kind: 'createBookmark', payload: { url: 'https://new.example', title: 'New' }, collectionId: 'other', tempMasterId: 'temp-new' });
    queue.getState().setOnline(true);
    await queue.getState().replay();
    expect(JSON.parse(native.disk.get('account:A:collection_cache_other')!).bookmarks).toHaveLength(2);
    expect(bookmarks.getState().bookmarks).toEqual([]);
  });

  it('preserves a confirmed mutation for safe retry when the acknowledgement cannot be persisted', async () => {
    const { queue, bookmarks, apply } = await setup(true);
    apply.mockImplementationOnce(async change => {
      native.setItem.mockRejectedValueOnce(new Error('Disk temporarily unavailable'));
      return success({ results: [{ masterId: `real-${change.queueId}` }] });
    });
    await bookmarks.getState().addBookmark('https://one.example', 'One', null);
    const operationId = queue.getState().queue[0].queueId;
    expect(queue.getState().queue).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(apply.mock.calls[1][0].queueId).toBe(operationId);
    expect(queue.getState().queue).toEqual([]);
    expect(bookmarks.getState().bookmarks).toHaveLength(1);
  });

  it('does not overwrite an unreadable durable queue with newly enqueued changes', async () => {
    const { bookmarks, queue, session } = await setup();
    await bookmarks.getState().addBookmark('https://existing.example', 'Existing', null);
    const persisted = native.disk.get('account:A:sync_queue');
    session.setSessionUser(null);
    session.setSessionUser('A');
    native.getItem.mockRejectedValueOnce(new Error('Storage unavailable'));
    const result = await bookmarks.getState().addBookmark('https://new.example', 'New', null);
    expect(result.success).toBe(false);
    expect(queue.getState().hydrated).toBe(false);
    expect(native.disk.get('account:A:sync_queue')).toBe(persisted);
  });
});

describe('collection and account isolation', () => {
  it('ignores the previous collection response, including when it resolves last', async () => {
    const { bookmarks, api } = await setup();
    const old = deferred<any>();
    vi.mocked(api.getMasterCollection).mockImplementationOnce(() => old.promise)
      .mockResolvedValueOnce(success({ folders: [], bookmarks: [bookmark('B-item')], timestamp: 1 }));
    const loadingA = bookmarks.getState().fetchMasterCollection(true);
    await tick();
    await bookmarks.getState().setActiveCollection('B');
    old.resolve(success({ folders: [], bookmarks: [bookmark('A-item')], timestamp: 1 }));
    await loadingA;
    expect(bookmarks.getState().activeCollectionId).toBe('B');
    expect(bookmarks.getState().bookmarks.map(b => b.masterId)).toEqual(['B-item']);
  });

  it('does not load or replay another account cache or queue', async () => {
    const { bookmarks, queue, session, apply } = await setup();
    await bookmarks.getState().addBookmark('https://private.example', 'Private A', null);
    session.setSessionUser('B');
    expect(bookmarks.getState().bookmarks).toEqual([]);
    expect(queue.getState().queue).toEqual([]);
    await bookmarks.getState().hydrate();
    queue.getState().setEnabled(true);
    queue.getState().setOnline(true);
    await queue.getState().replay();
    expect(apply).not.toHaveBeenCalled();
    session.setSessionUser('A');
    queue.getState().setOnline(false);
    await bookmarks.getState().hydrate();
    expect(bookmarks.getState().bookmarks[0].title).toBe('Private A');
  });

  it('ignores unowned caches and queues from older app versions', async () => {
    native.disk.set('sync_queue', JSON.stringify([{ kind: 'deleteBookmark' }]));
    native.disk.set('collection_cache_default', JSON.stringify({ folders: [], bookmarks: [bookmark('private')], timestamp: 1 }));
    const { bookmarks, queue } = await setup();
    expect(bookmarks.getState().bookmarks).toEqual([]);
    expect(queue.getState().queue).toEqual([]);
  });

  it('discards a late read after signing out', async () => {
    const { bookmarks, api, session } = await setup();
    const old = deferred<any>();
    vi.mocked(api.getMasterCollection).mockImplementationOnce(() => old.promise);
    const loading = bookmarks.getState().fetchMasterCollection(true);
    await tick();
    session.setSessionUser(null);
    old.resolve(success({ folders: [], bookmarks: [bookmark('private')], timestamp: 1 }));
    await loading;
    expect(bookmarks.getState().bookmarks).toEqual([]);
    expect(bookmarks.getState().hydrated).toBe(false);
  });

  it('stops a pending replay after logout and keeps its durable operation for the original account', async () => {
    const { bookmarks, queue, session, apply } = await setup(true);
    const old = deferred<any>();
    apply.mockImplementationOnce(() => old.promise);
    const saving = bookmarks.getState().addBookmark('https://private.example', 'Private A', null);
    await tick();
    session.setSessionUser('B');
    await bookmarks.getState().hydrate();
    old.resolve(success({ results: [{ masterId: 'private-A' }] }));
    expect((await saving).success).toBe(false);
    expect(bookmarks.getState().bookmarks).toEqual([]);
    expect(queue.getState().queue).toEqual([]);
    expect(JSON.parse(native.disk.get('account:A:sync_queue')!)).toHaveLength(1);
  });

  it('ignores a read started before a successful mutation and fetches fresh server data', async () => {
    const { bookmarks, queue, api } = await setup();
    const old = deferred<any>();
    vi.mocked(api.getMasterCollection).mockImplementationOnce(() => old.promise)
      .mockResolvedValueOnce(success({ folders: [], bookmarks: [bookmark('server-item', 'New save')], timestamp: 1 }));
    const reading = bookmarks.getState().fetchMasterCollection(true);
    await tick();
    await bookmarks.getState().addBookmark('https://new.example', 'New save', null);
    queue.getState().setOnline(true);
    await queue.getState().replay();
    old.resolve(success({ folders: [], bookmarks: [], timestamp: 1 }));
    await reading;
    expect(bookmarks.getState().bookmarks[0].title).toBe('New save');
    expect(api.getMasterCollection).toHaveBeenCalledTimes(2);
  });
});

describe('premium and authentication', () => {
  async function authSetup() {
    const { api } = await import('../../src/mobile/services/api');
    const { authService } = await import('../../src/mobile/services/auth');
    const { useAuthStore: auth } = await import('../../src/mobile/store/authStore');
    vi.spyOn(api, 'getUserStats').mockResolvedValue(success(counts) as any);
    vi.spyOn(api, 'getMe').mockResolvedValue(success(user()));
    vi.spyOn(authService, 'login').mockResolvedValue({ success: true, user: user(), token: 'real-token' });
    return { api, authService, auth };
  }
  it('uses profile entitlements and limits when stats contains only counts', async () => {
    const { auth } = await authSetup();
    await auth.getState().login('A@example.com', 'password');
    expect(auth.getState().isPremium).toBe(true);
    expect(auth.getState().token).toBe('real-token');
    expect(auth.getState().stats?.limits.maxBookmarks).toBe(100);
    await auth.getState().refreshStats();
    expect(auth.getState().isPremium).toBe(true);
  });
  it('refreshes changed subscription status from the current profile', async () => {
    const { auth, api } = await authSetup();
    await auth.getState().login('A@example.com', 'password');
    vi.mocked(api.getMe).mockResolvedValue(success(user('A', false)));
    await auth.getState().refreshStats();
    expect(auth.getState().isPremium).toBe(false);
  });
  it('restores a saved session offline without deleting credentials', async () => {
    const { auth, authService, api } = await authSetup();
    native.secure.set('auth_token', 'saved-token');
    native.secure.set('user_data', JSON.stringify(user()));
    vi.mocked(api.getMe).mockResolvedValue({ success: false, error: { code: 'NETWORK_ERROR', retryable: true, message: 'Offline' } });
    vi.mocked(api.getUserStats).mockResolvedValue({ success: false, error: { code: 'NETWORK_ERROR', message: 'Offline' } });
    const logout = vi.spyOn(authService, 'logout');
    await auth.getState().checkAuth();
    expect(auth.getState().isAuthenticated).toBe(true);
    expect(auth.getState().isPremium).toBe(true);
    expect(logout).not.toHaveBeenCalled();
    expect(native.secure.get('auth_token')).toBe('saved-token');
  });
  it('clears visible state immediately on logout and ignores late profile responses', async () => {
    const { auth, api } = await authSetup();
    await auth.getState().login('A@example.com', 'password');
    const late = deferred<any>();
    vi.mocked(api.getMe).mockImplementationOnce(() => late.promise);
    const refresh = auth.getState().refreshStats();
    await auth.getState().logout();
    late.resolve(success(user()));
    await refresh;
    expect(auth.getState().isAuthenticated).toBe(false);
    expect(auth.getState().user).toBeNull();
  });

  it('does not save late login credentials after the user signed out', async () => {
    const { api } = await import('../../src/mobile/services/api');
    const { authService } = await import('../../src/mobile/services/auth');
    const late = deferred<any>();
    vi.spyOn(api, 'login').mockImplementationOnce(() => late.promise);
    const signingIn = authService.login('A@example.com', 'password');
    await authService.logout();
    late.resolve(success({ token: 'late-token', user: user() }));
    expect((await signingIn).success).toBe(false);
    expect(native.secure.has('auth_token')).toBe(false);
  });

  it('honors explicit revoked access and expired premium profiles', async () => {
    const { hasPremium } = await import('../../src/mobile/services/entitlements');
    expect(hasPremium({ ...user(), isPremium: false })).toBe(false);
    expect(hasPremium({ ...user(), subscriptionExpiresAt: (Date.now() - 10000) / 1000 })).toBe(false);
    expect(hasPremium({ ...user(), subscriptionTier: 'lifetime', isPremium: undefined })).toBe(true);
  });
});

describe('API retries and stale responses', () => {
  it('round-trips the actual mobile payload against the real backend and deduplicates retries', async () => {
    vi.useRealTimers();
    await import('../setup');
    // Keep the backend's Node typings out of the Expo/React Native typecheck.
    // The backend itself is checked by the existing root harness.
    const backendHelpers = '../helpers.ts';
    const { app, registerUser, dbReady, db } = await import(backendHelpers);
    const request = (await import('supertest')).default;
    await dbReady;
    const registered = await registerUser();
    const { setSessionUser } = await import('../../src/mobile/services/session');
    const { api } = await import('../../src/mobile/services/api');
    setSessionUser(registered.userId);
    native.secure.set('auth_token', registered.token);
    // Supertest handles requests in-process; no live service is contacted.
    native.fetch.mockImplementation(async (url, options) => {
      const pathname = new URL(url).pathname;
      const call = options.method === 'POST' ? request(app).post(pathname) : request(app).get(pathname);
      const response = await call.set(options.headers).send(options.body ? JSON.parse(options.body) : undefined);
      return { ok: response.status < 400, status: response.status, json: async () => response.body };
    });
    try {
      const folder = { kind: 'createFolder' as const, queueId: 'contract-folder', queuedAt: 123, collectionId: null, payload: { title: 'Mobile folder' } };
      const createdFolder = await api.applyQueuedChange(folder);
      expect(createdFolder.success).toBe(true);
      const parentId = createdFolder.data!.results[0].masterId;
      const child = { kind: 'createBookmark' as const, queueId: 'contract-child', queuedAt: 124, collectionId: null, payload: { title: 'Mobile save', url: 'https://example.com/mobile', masterParentId: parentId } };
      const first = await api.applyQueuedChange(child);
      const retried = await api.applyQueuedChange(child);
      expect(first.success, JSON.stringify(first)).toBe(true);
      expect(retried.data!.results[0].masterId).toBe(first.data!.results[0].masterId);
      const read = await api.getMasterCollection();
      expect(read.success).toBe(true);
      const matching = read.data!.bookmarks.filter(b => b.url === child.payload.url);
      expect(matching).toHaveLength(1);
      expect(matching[0].masterParentId).toBe(parentId);
    } finally {
      db.close();
    }
  });

  it('sends stable operation IDs and item data when retrying a queued create', async () => {
    const { setSessionUser } = await import('../../src/mobile/services/session');
    setSessionUser('A');
    const { api } = await import('../../src/mobile/services/api');
    native.fetch.mockResolvedValue({ ok: true, json: async () => success({ results: [{ masterId: 'real' }] }) });
    const change = { kind: 'createBookmark' as const, queueId: 'durable-op', queuedAt: 123, collectionId: 'collection', payload: { url: 'https://example.com' } };
    await api.applyQueuedChange(change);
    await api.applyQueuedChange(change);
    const bodies = native.fetch.mock.calls.map(([, options]) => JSON.parse(options.body));
    expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[0].changes[0].operationId).toBe('durable-op');
    expect(bodies[0].changes[0].data.browserId).toBe('mobile-durable-op');
    expect(bodies[0].metadata.deviceInfo.browserInstanceId).toBeTruthy();
  });
  it('marks server failures retryable instead of dropping pending mutations', async () => {
    const { api } = await import('../../src/mobile/services/api');
    native.fetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: { message: 'Unavailable' } }) });
    const response = await api.getMe();
    expect(response.error?.retryable).toBe(true);
    expect(response.error?.status).toBe(503);
  });

  it('uses one stable install identity for simultaneous first requests', async () => {
    const { setSessionUser } = await import('../../src/mobile/services/session');
    setSessionUser('A');
    const { api } = await import('../../src/mobile/services/api');
    native.fetch.mockResolvedValue({ ok: true, json: async () => success({ results: [{ masterId: 'real' }] }) });
    const change = { kind: 'createFolder' as const, queueId: 'op', queuedAt: 123, collectionId: null, payload: { title: 'Folder' } };
    await Promise.all([api.applyQueuedChange(change), api.applyQueuedChange({ ...change, queueId: 'second' })]);
    const identities = native.fetch.mock.calls.map(([, options]) => {
      const body = JSON.parse(options.body);
      expect(body.metadata.deviceInfo.browserInstanceId).toBe(options.headers['X-Browser-Instance-ID']);
      return body.metadata.deviceInfo.browserInstanceId;
    });
    expect(new Set(identities).size).toBe(1);
  });

  it('uses distinct browser registrations for different accounts on the same phone', async () => {
    const { setSessionUser } = await import('../../src/mobile/services/session');
    const { getBrowserInstanceId, getDeviceId } = await import('../../src/mobile/services/device');
    setSessionUser('A');
    const a = await getBrowserInstanceId();
    const deviceId = await getDeviceId();
    setSessionUser('B');
    expect(await getBrowserInstanceId()).not.toBe(a);
    expect(await getDeviceId()).toBe(deviceId);
    setSessionUser('A');
    expect(await getBrowserInstanceId()).toBe(a);
  });
  it('does not log out a new account when an old request returns 401', async () => {
    const { api } = await import('../../src/mobile/services/api');
    const { setSessionUser } = await import('../../src/mobile/services/session');
    setSessionUser('A');
    const late = deferred<any>();
    native.fetch.mockImplementationOnce(() => late.promise);
    const unauthorized = vi.fn();
    api.setUnauthorizedHandler(unauthorized);
    const request = api.getMe();
    await tick();
    setSessionUser('B');
    late.resolve({ ok: false, status: 401, json: async () => ({ error: { message: 'Expired' } }) });
    expect((await request).error?.code).toBe('SESSION_CHANGED');
    expect(unauthorized).not.toHaveBeenCalled();
  });
});

describe('access gating and verification', () => {
  async function authSetup() {
    const { api } = await import('../../src/mobile/services/api');
    const { authService } = await import('../../src/mobile/services/auth');
    const { useAuthStore: auth } = await import('../../src/mobile/store/authStore');
    const { useSyncQueue: queue } = await import('../../src/mobile/store/syncQueue');
    const { useBookmarkStore: bookmarks } = await import('../../src/mobile/store/bookmarkStore');
    vi.spyOn(api, 'getUserStats').mockResolvedValue(success(counts) as any);
    vi.spyOn(api, 'getMe').mockResolvedValue(success(user()));
    return { api, authService, auth, queue, bookmarks };
  }

  it('blocks unverified sign-ins from the library and the sync queue', async () => {
    const { api, authService, auth, queue, bookmarks } = await authSetup();
    vi.spyOn(authService, 'login').mockResolvedValue({ success: true, user: { ...user(), emailVerified: false }, token: 't' });
    const stats = vi.mocked(api.getUserStats);
    expect((await auth.getState().login('A@example.com', 'password')).success).toBe(true);
    expect(auth.getState().access).toBe('verify-email');
    expect(auth.getState().accessReason).toBe('unverified');
    expect(queue.getState().enabled).toBe(false);
    // A blocked sign-in must not fetch protected content or hydrate the library.
    expect(stats).not.toHaveBeenCalled();
    expect(bookmarks.getState().hydrated).toBe(false);
  });

  it('records a failed signup delivery instead of claiming the email was sent', async () => {
    const { authService, auth } = await authSetup();
    vi.spyOn(authService, 'register').mockResolvedValue({ success: true, user: { ...user(), emailVerified: false }, token: 't', verificationEmailSent: false });
    await auth.getState().register('A@example.com', 'password');
    expect(auth.getState().access).toBe('verify-email');
    expect(auth.getState().emailDeliveryFailed).toBe(true);
  });

  it('keeps a verified free account on the membership screen', async () => {
    const { authService, auth, queue } = await authSetup();
    vi.spyOn(authService, 'login').mockResolvedValue({ success: true, user: user('A', false), token: 't' });
    await auth.getState().login('A@example.com', 'password');
    expect(auth.getState().access).toBe('membership');
    expect(auth.getState().accessReason).toBe('no-membership');
    expect(auth.getState().isPremium).toBe(false);
    expect(queue.getState().enabled).toBe(false);
  });

  it('unlocks the library offline only inside the recorded grace window', async () => {
    const { api, auth } = await authSetup();
    native.secure.set('auth_token', 'saved');
    native.secure.set('user_data', JSON.stringify(user()));
    vi.mocked(api.getMe).mockResolvedValue({ success: false, error: { code: 'NETWORK_ERROR', retryable: true, message: 'Offline' } });
    // Never validated by this build: unknown status must not unlock.
    await auth.getState().checkAuth();
    expect(auth.getState().access).toBe('membership');
    expect(auth.getState().accessReason).toBe('recheck');
    // Inside the 24-hour window after a successful check the cached library opens.
    native.disk.set('account:A:access_validation', JSON.stringify({ validatedAt: Date.now() - 60_000 }));
    await auth.getState().checkAuth();
    expect(auth.getState().access).toBe('allowed');
    // Once the window has elapsed, access returns to a recheck — a stored
    // Premium claim alone never extends it.
    native.disk.set('account:A:access_validation', JSON.stringify({ validatedAt: Date.now() - 25 * 3600 * 1000 }));
    await auth.getState().checkAuth();
    expect(auth.getState().access).toBe('membership');
  });

  it('honors a server-side downgrade over forged or stale local state', async () => {
    const { api, auth } = await authSetup();
    native.secure.set('auth_token', 'saved');
    // Locally stored profile claims verified Premium; the server disagrees.
    native.secure.set('user_data', JSON.stringify(user()));
    native.disk.set('account:A:access_validation', JSON.stringify({ validatedAt: Date.now() }));
    vi.mocked(api.getMe).mockResolvedValue(success(user('A', false)));
    await auth.getState().checkAuth();
    expect(auth.getState().access).toBe('membership');
    expect(auth.getState().isPremium).toBe(false);
  });

  it('pauses the queue without dropping changes on an access denial', async () => {
    const { queue, bookmarks, apply } = await setup(true);
    apply.mockResolvedValue({ success: false, error: { status: 403, code: 'EMAIL_NOT_VERIFIED', message: 'Verify your email address first' } });
    await bookmarks.getState().addBookmark('https://paused.example', 'Paused', null);
    expect(queue.getState().queue).toHaveLength(1);
    expect(queue.getState().lastDroppedCount).toBe(0);
    expect(queue.getState().enabled).toBe(false);
    // Later attempts must not silently drain a paused queue.
    await queue.getState().replay();
    expect(apply).toHaveBeenCalledTimes(1);
    expect(queue.getState().queue).toHaveLength(1);
    expect(JSON.parse(native.disk.get('account:A:sync_queue')!)).toHaveLength(1);
  });

  it('confirms the real auth contract and verified-email enforcement on the backend', async () => {
    vi.useRealTimers();
    await import('../setup');
    const backendHelpers = '../helpers.ts';
    const { app, registerUser, dbReady, db } = await import(backendHelpers);
    const request = (await import('supertest')).default;
    await dbReady;
    const registered = await registerUser({ verifyEmail: false });
    const { setSessionUser } = await import('../../src/mobile/services/session');
    const { api } = await import('../../src/mobile/services/api');
    setSessionUser(registered.userId);
    native.secure.set('auth_token', registered.token);
    native.fetch.mockImplementation(async (url, options) => {
      const pathname = new URL(url).pathname;
      const call = options.method === 'POST' ? request(app).post(pathname) : request(app).get(pathname);
      const response = await call.set(options.headers).send(options.body ? JSON.parse(options.body) : undefined);
      return { ok: response.status < 400, status: response.status, json: async () => response.body };
    });
    try {
      // GET /auth/me returns the user object directly in `data`.
      const me = await api.getMe();
      expect(me.success, JSON.stringify(me)).toBe(true);
      expect(me.data?.id).toBe(registered.userId);
      expect(me.data?.emailVerified).toBe(false);
      // Library routes reject unverified accounts with a named code.
      const denied = await api.getMasterCollection();
      expect(denied.success).toBe(false);
      expect(denied.error?.code).toBe('EMAIL_NOT_VERIFIED');
      // Registration already minted a token, so an immediate resend hits the
      // 60s cooldown — the client must surface the limit and its retryAfter.
      const resend = await api.resendVerificationEmail();
      expect(resend.success).toBe(false);
      expect(resend.error?.code).toBe('VERIFICATION_RATE_LIMIT');
      expect(resend.error?.retryAfter).toBeGreaterThan(0);
      // Verification tokens are validated; a bogus one is rejected.
      const verify = await api.verifyEmail('0'.repeat(64));
      expect(verify.success).toBe(false);
      expect(verify.error?.code).toBe('INVALID_VERIFICATION_TOKEN');
      // Forgot-password stays generic.
      const forgot = await api.forgotPassword(registered.email);
      expect(forgot.success).toBe(true);
    } finally {
      db.close();
    }
  });
});
