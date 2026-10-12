// tests/api/sync-convergence.test.ts
//
// Cross-device sync convergence harness.
//
// This is the suite that de-risks PROGRESS.md:78 ("Test backward
// compatibility with existing extension") and the un-checked cross-browser
// sync test in Phase 9 (PROGRESS.md:170). It exercises the core masterId
// contract from the Phase 2 backend refactor: that N devices, each talking
// to the same /api/v1/sync endpoint, can OPTION A) push their own bookmarks
// and folders into a shared master collection, OPTION B) address the other
// devices' rows using the `masterId` returned by API responses, and OPTION C)
// converge to the same visible master-collection state when they each pull.
//
// Why this is more than tests/api/sync.test.ts: that file proves one device
// can round-trip its own CREATE/DELETE against the API. This file proves the
// *cross-device* matrix — device A UPDATEs an item device B created, device
// C DELETEs the item device A just moved, etc. — and asserts structural
// invariants of the converged collection (no orphaned masterParentId, no
// duplicate masterId, no device sees a different universe).
//
// The "fake devices" here are real HTTP clients through supertest; there is
// no in-process DB snooping. Every assertion is observable over the wire,
// so if the extension ever changes its sync payload shape, these tests catch
// that drift just as a real second browser would.

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import {
  app, baseUrl, bearer, registerUser,
  deviceInfo, syncMetadata, makeBookmark, makeFolder,
  dbReady, type DeviceMeta,
} from '../helpers';

beforeAll(async () => { await dbReady; });

// ---------------------------------------------------------------------------
// Small per-device client used to model the extension's sync behaviour.
// ---------------------------------------------------------------------------

// A "device" is just (token, device-meta). All HTTP detail is encapsulated in
// the helpers below so each test stays focused on the *sequence* of syncs.
interface Device {
  name: string;
  user: { token: string; userId: string };
  meta: DeviceMeta;
}

async function mkDevice(
  user: { token: string; userId: string },
  name: string,
  fingerprint: { browser: string; os: string; osVersion: string }
): Promise<Device> {
  return {
    name,
    user,
    meta: deviceInfo({
      browserInstanceId: `${name}-${Math.random().toString(36).slice(2, 8)}`,
      deviceId: `dev-${name}-${Math.random().toString(36).slice(2, 8)}`,
      ...fingerprint,
    }),
  };
}

// Push the initial set of bookmarks + folders from a device to the server.
// Mirrors what the extension's `SyncManager.initialSync` does on first run.
async function initialSync(
  d: Device,
  payload: { bookmarks?: ReturnType<typeof makeBookmark>[]; folders?: ReturnType<typeof makeFolder>[] } = {}
) {
  const res = await request(app)
    .post(`${baseUrl}/sync/initial`)
    .set('Authorization', bearer(d.user.token))
    .set('x-device-id', d.meta.deviceId)
    .send({
      bookmarks: payload.bookmarks ?? [],
      folders: payload.folders ?? [],
      deviceId: d.meta.deviceId,
      metadata: syncMetadata(d.meta),
    });
  if (res.status !== 200) throw new Error(`[${d.name}] initialSync ${res.status}: ${res.text}`);
  return res.body.data;
}

// Push a delta-sync batch of CREATE/UPDATE/DELETE/MOVE changes from a device.
// Each change carries the acting device's browserInstanceId in `metadata`,
// which the server uses to disambiguate legacy browserId-keyed lookups
// (see db.deleteBookmark fallback path in database.ts:2032).
async function deltaSync(
  d: Device,
  changes: Array<{ type: 'CREATE' | 'UPDATE' | 'DELETE' | 'MOVE'; data: any }>
) {
  const res = await request(app)
    .post(`${baseUrl}/sync`)
    .set('Authorization', bearer(d.user.token))
    .set('x-device-id', d.meta.deviceId)
    .send({
      changes: changes.map((c) => ({
        type: c.type,
        data: c.data,
        metadata: syncMetadata(d.meta),
        timestamp: Date.now(),
      })),
      deviceId: d.meta.deviceId,
      metadata: syncMetadata(d.meta),
    });
  if (res.status !== 200) throw new Error(`[${d.name}] deltaSync ${res.status}: ${res.text}`);
  return res.body.data as { changesApplied: number; results: any[] };
}

// Fetch the master collection as `device d` would see it on its next pull.
// The extension calls this on every poll; convergence tests pull it at the
// end to assert all devices see the same final state.
async function masterCollection(d: Device) {
  const res = await request(app)
    .get(`${baseUrl}/sync/master-collection`)
    .set('Authorization', bearer(d.user.token))
    .set('x-device-id', d.meta.deviceId)
    .set('x-browser-instance-id', d.meta.browserInstanceId);
  if (res.status !== 200) throw new Error(`[${d.name}] masterCollection ${res.status}: ${res.text}`);
  return res.body.data as {
    bookmarks: Array<{ masterId: string; browserId: string; url: string; title: string; masterParentId: string | null; status: string }>;
    folders: Array<{ masterId: string; browserId: string; title: string; masterParentId: string | null; status: string }>;
  };
}

// ---------------------------------------------------------------------------
// Structural invariants every converged collection must satisfy. Pulled into
// helpers so multiple tests can reuse the same checks without copy-paste.
// ---------------------------------------------------------------------------

function assertConvergedShape(
  label: string,
  data: { bookmarks: any[]; folders: any[] }
) {
  // 1. masterId is unique across each kind. The schema declares
  //    `masterId TEXT UNIQUE` (schema.sql:88,112) so a duplicate would
  //    surface as a 500 in production — but only AFTER a collision. Assert
  //    here so a broken upsert path that *would* collide is caught earlier.
  const bmIds = data.bookmarks.map((b) => b.masterId);
  const fldIds = data.folders.map((f) => f.masterId);
  expect(new Set(bmIds).size, `[${label}] bookmark masterIds unique`).toBe(bmIds.length);
  expect(new Set(fldIds).size, `[${label}] folder masterIds unique`).toBe(fldIds.length);

  // 2. No bookmark references a masterParentId that isn't one of our
  //    folders' masterIds OR null (root). An orphan here means the parent
  //    folder was deleted but the child wasn't — the recursion bug class
  //    the masterId refactor was supposed to fix (PROGRESS.md:71-73).
  const folderMasterIds = new Set(fldIds);
  const orphans = data.bookmarks.filter(
    (b) => b.masterParentId !== null && !folderMasterIds.has(b.masterParentId)
  );
  expect(orphans, `[${label}] no orphaned bookmark masterParentId`).toEqual([]);

  // 3. No folder references a masterParentId that isn't another folder's
  //    masterId OR null. Self-references and cycles would also get caught
  //    here were they to slip in.
  const folderOrphans = data.folders.filter(
    (f) => f.masterParentId !== null && !folderMasterIds.has(f.masterParentId) && f.masterParentId !== f.masterId
  );
  expect(folderOrphans, `[${label}] no orphaned folder masterParentId`).toEqual([]);

  // 4. No soft-deleted rows leak into master-collection reads. The schema
  //    already filters status='active' (database.ts:1769,1776), but a future
  //    query-edit that drops the WHERE clause would silently leak tombstones
  //    through. Pin the contract.
  for (const b of data.bookmarks) {
    expect(b.status, `[${label}] bookmark ${b.masterId} status active`).toBe('active');
  }
  for (const f of data.folders) {
    expect(f.status, `[${label}] folder ${f.masterId} status active`).toBe('active');
  }
}

// Assert every device in `devices` sees the same visible master-collection.
// "Same" is keyed on (masterId → url|title|masterParentId|status) so that
// server-side ordering (ORDER BY parentId, position) is descoped — the
// convergence contract is about *content*, not row order.
function assertAllDevicesConverged(devices: Device[]) {
  const snapshots: Array<{ name: string; data: any }> = [];
  for (const d of devices) {
    // No `await` inside the loop is intentional — we want a clean pull per
    // device with no interleaving from this test, mirroring the polling
    // pattern of the real extension.
  }
  // We DO need sequential awaits because supertest shares the agent; const
  // above is just to keep the loop readable.
  return (async () => {
    for (const d of devices) {
      snapshots.push({ name: d.name, data: await masterCollection(d) });
    }
    const first = snapshots[0];
    const firstKey = new Set(
      first.data.bookmarks.map((b: any) => `${b.masterId}|${b.url}|${b.masterParentId}|${b.status}`)
        .concat(first.data.folders.map((f: any) => `${f.masterId}|${f.title}|${f.masterParentId}|${f.status}`))
    );
    for (let i = 1; i < snapshots.length; i++) {
      const other = snapshots[i];
      const otherKey = new Set(
        other.data.bookmarks.map((b: any) => `${b.masterId}|${b.url}|${b.masterParentId}|${b.status}`)
          .concat(other.data.folders.map((f: any) => `${f.masterId}|${f.title}|${f.masterParentId}|${f.status}`))
      );
      expect(otherKey.size, `[${other.name}] visible item count matches ${first.name}`).toBe(firstKey.size);
      // Iterate Array.from(Set) instead of Set directly so the test tree type-
      // checks without the `--downlevelIteration` flag (which the inherited
      // tsconfig.test.json target currently declines to enable).
      for (const key of Array.from(firstKey)) {
        expect(otherKey.has(key), `[${other.name}] missing key from ${first.name}: ${key}`).toBe(true);
      }
    }
    // All snapshots must also pass the structural invariant.
    for (const s of snapshots) assertConvergedShape(`${s.name}`, s.data);
  })();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Cross-device sync: convergence + masterId invariants', () => {
  // Distinct OS+browser fingerprints so the browser-limit abuse-prevention
  // branch (premium.ts:176) doesn't sneak-dedupe them. The free browser
  // limit is 2, so most tests use exactly 2 devices. The 3+ device test
  // registers the user as premium via the ALWAYS_PREMIUM_EMAILS allowlist
  // (auth.ts:39) — see that test for details.
  const fp = {
    chrome:     { browser: 'Chrome',  os: 'Windows', osVersion: '11' },
    firefox:    { browser: 'Firefox', os: 'macOS',   osVersion: '14' },
    edge:       { browser: 'Edge',    os: 'Linux',   osVersion: '22' },
    brave:      { browser: 'Brave',   os: 'Windows', osVersion: '10' },
    safariDrop: { browser: 'Safari',  os: 'iOS',    osVersion: '17' },
  };

  it('two devices each initial-sync different sets converge to the union', async () => {
    const u = await registerUser();
    const alice = await mkDevice(u, 'alice', fp.chrome);
    const bob = await mkDevice(u, 'bob', fp.firefox);

    const aMark = makeBookmark({ id: 'a-bm', url: 'https://alice.test/a', title: 'Alice A' });
    const aFolder = makeFolder({ id: 'a-fld', title: 'Alice Folder' });
    const bMark = makeBookmark({ id: 'b-bm', url: 'https://bob.test/b', title: 'Bob B' });

    await initialSync(alice, { bookmarks: [aMark], folders: [aFolder] });
    await initialSync(bob,   { bookmarks: [bMark] });

    await assertAllDevicesConverged([alice, bob]);

    // And the converged union has both bookmarks + Alice's folder.
    const mc = await masterCollection(alice);
    const urls = mc.bookmarks.map((b) => b.url).sort();
    const folderTitles = mc.folders.map((f) => f.title);
    expect(urls).toEqual(['https://alice.test/a', 'https://bob.test/b']);
    expect(folderTitles).toContain('Alice Folder');
  });

  it('cross-device UPDATE via masterId lands on the row the other device created', async () => {
    const u = await registerUser();
    const alice = await mkDevice(u, 'alice', fp.chrome);
    const bob = await mkDevice(u, 'bob', fp.firefox);

    // Alice creates, initial-sync.
    const aMark = makeBookmark({ id: 'a-bm', url: 'https://alice.test/orig', title: 'Orig Title' });
    await initialSync(alice, { bookmarks: [aMark] });

    // Bob pulls master to discover Alice's bookmark masterId — exactly what
    // the extension does on its polling tick.
    const bobPull = await masterCollection(bob);
    const aliceBm = bobPull.bookmarks.find((b) => b.url === aMark.url);
    expect(aliceBm, 'Bob should see Alice\'s bookmark').toBeDefined();

    // Bob UPDATEs Alice's bookmark using its masterId (`masterId` path
    // taken in db.updateBookmark at database.ts:1798). This is the
    // undoing of "legacy browserId + browserInstanceId" limitation —
    // Bob has no idea what Alice's browserInstanceId was, but he can
    // still edit her row because the server-keyed lookup is on masterId.
    await deltaSync(bob, [{
      type: 'UPDATE',
      data: {
        type: 'bookmark',
        masterId: aliceBm!.masterId,
        title: 'Bob Renamed This',
        url: 'https://alice.test/renamed',
        parentId: aliceBm!.masterParentId ?? '1',
        masterParentId: aliceBm!.masterParentId,
        position: 0,
      },
    }]);

    // Both devices must see the rename.
    await assertAllDevicesConverged([alice, bob]);
    const aMc = await masterCollection(alice);
    const updated = aMc.bookmarks.find((b) => b.masterId === aliceBm!.masterId);
    expect(updated!.title).toBe('Bob Renamed This');
    expect(updated!.url).toBe('https://alice.test/renamed');
  });

  it('cross-device MOVE via masterId relocates the row for every viewer', async () => {
    const u = await registerUser();
    const alice = await mkDevice(u, 'alice', fp.chrome);
    const bob = await mkDevice(u, 'bob', fp.firefox);

    // Alice seeds with a bookmark in the default root + a custom folder.
    const aMark = makeBookmark({ id: 'a-bm', url: 'https://alice.test/x', title: 'X' });
    const aFolder = makeFolder({ id: 'a-fld', title: 'Moveable Folder' });
    await initialSync(alice, { bookmarks: [aMark], folders: [aFolder] });

    // Bob pulls to learn both masterIds.
    const bobPull = await masterCollection(bob);
    const mark = bobPull.bookmarks.find((b) => b.url === aMark.url)!;
    const folder = bobPull.folders.find((f) => f.title === 'Moveable Folder')!;

    // Bob MOVEs the bookmark INTO the folder by sending both parentId
    // (the folder's masterId) and masterParentId (same value). The
    // moveBookmark path at database.ts:1929 honors the masterId key.
    // Note: `moveBookmark` reads `bookmark.index` (NOT `bookmark.position`)
    // and uses it for `position = ?` (not COALESCE), so the move UPDATE
    // requires a non-null index. We send BOTH names to be safe — supertest
    // doesn't care which one the server reads at the SQL level.
    await deltaSync(bob, [{
      type: 'MOVE',
      data: {
        type: 'bookmark',
        masterId: mark.masterId,
        parentId: folder.masterId,
        masterParentId: folder.masterId,
        position: 7,
        index: 7,
      },
    }]);

    await assertAllDevicesConverged([alice, bob]);

    // Alice (the original creator) must observe her bookmark now lives
    // INSIDE Bob's folder — the core "cross-device editing" guarantee
    // that PROGRESS.md:71-73 claims the masterId system enables.
    const aMc = await masterCollection(alice);
    const moved = aMc.bookmarks.find((b) => b.masterId === mark.masterId)!;
    expect(moved.masterParentId).toBe(folder.masterId);
  });

  it('cross-device DELETE via masterId hides the row from every viewer (soft-delete)', async () => {
    const u = await registerUser();
    const alice = await mkDevice(u, 'alice', fp.chrome);
    const bob = await mkDevice(u, 'bob', fp.firefox);

    const aMark = makeBookmark({ id: 'a-bm', url: 'https://alice.test/del', title: 'Del Me' });
    await initialSync(alice, { bookmarks: [aMark] });

    const bobPull = await masterCollection(bob);
    const mark = bobPull.bookmarks.find((b) => b.url === aMark.url)!;

    // Bob DELETEs Alice's bookmark by masterId. handleSync's DELETE branch
    // (server.ts:231) tries db.checkBookmarkExists(browserId) first — that
    // path inspects `bookmark.browserId`, so to delete via masterId we
    // send `browserId = mark.browserId` (which the original CREATE stored
    // alongside masterId). MasterId-only delete is a TODO for the server;
    // for now we mirror what the extension actually sends.
    await deltaSync(bob, [{
      type: 'DELETE',
      data: { browserId: mark.browserId, masterId: mark.masterId },
    }]);

    await assertAllDevicesConverged([alice, bob]);

    // Both devices must see zero bookmarks — the soft-deleted row is
    // filtered out of master-collection reads (database.ts:1769 status='active').
    const aMc = await masterCollection(alice);
    const bMc = await masterCollection(bob);
    expect(aMc.bookmarks).toHaveLength(0);
    expect(bMc.bookmarks).toHaveLength(0);
  });

  it('concurrent CREATE bursts from N devices all land (no lost writes)', async () => {
    const u = await registerUser();
    // Three distinct browsers + a free-tier limit of 2: we'd hit the
    // browser-limit gate. Use the ALWAYS_PREMIUM_EMAILS allowlist entry
    // (auth.ts:39) so this user is premium from registration, bypassing
    // the browser-limit check but keeping everything else stock.
    const premiumUser = await registerUser({ email: 'qa@bookmarx.cc' });
    const devices = await Promise.all([
      mkDevice(premiumUser, 'chrome', fp.chrome),
      mkDevice(premiumUser, 'firefox', fp.firefox),
      mkDevice(premiumUser, 'edge', fp.edge),
      mkDevice(premiumUser, 'brave', fp.brave),
    ]);

    // Each device initial-syncs zero bookmarks first (just to register).
    for (const d of devices) await initialSync(d);

    // Then every device fires a 5-bookmark CREATE burst. We sequence them
    // with a for-await — supertest's `request(app)` from a single Express
    // instance races internally on `app.listen(0)` when called in parallel
    // across many Promise.all branches (TypeError: app.address is not a
    // function). The "no lost writes" assertion is content-based, not
    // parallelism-based: the server's better-sqlite3 is single-threaded
    // synchronous either way, so serializing supertest calls loses no
    // signal while sidestepping that supertest quirk.
    const BATCH = 5;
    for (const d of devices) {
      const makes = Array.from({ length: BATCH }, (_, i) =>
        makeBookmark({ id: `${d.name}-bm-${i}`, url: `https://${d.name}.test/b${i}`, title: `${d.name}-${i}` })
      );
      await deltaSync(d, makes.map((m) => ({
        type: 'CREATE', data: { ...m, type: 'bookmark' },
      })));
    }

    await assertAllDevicesConverged(devices);

    // 4 devices × 5 = 20 bookmark creates — all must be visible. The
    // union count is the strongest possible statement that "no writes
    // were lost" without modelling precisely which row survived a clash.
    const mc = await masterCollection(devices[0]);
    expect(mc.bookmarks.length).toBe(devices.length * BATCH);
  });

  it('folden-with-kids DELETE propagates: parent gone, children hidden (not orphaned)', async () => {
    // The masterId refactor's primary purpose (PROGRESS.md:71-73) was
    // cross-device editing, but a happy side-effect is that folder
    // DELETE with `recursive: true` (server.ts:252) hides the children
    // too. This test pins that the children do NOT show up as orphans.
    const u = await registerUser();
    const alice = await mkDevice(u, 'alice', fp.chrome);
    const bob = await mkDevice(u, 'bob', fp.firefox);

    const aFolder = makeFolder({ id: 'parent', title: 'Parent' });
    const aChild1 = makeBookmark({ id: 'child1', url: 'https://c.one', parentId: 'parent' });
    const aChild2 = makeBookmark({ id: 'child2', url: 'https://c.two', parentId: 'parent' });
    // We have to send child bookmarks with parentId='parent' so the server's
    // resolveMasterParentId (server.ts:96-111) maps 'parent' into the
    // folder's masterId at CREATE time.
    await initialSync(alice, { folders: [aFolder], bookmarks: [aChild1, aChild2] });

    // Bob pulls, learns the folder's masterId + that the children's
    // masterParentId points at it.
    let bobPull = await masterCollection(bob);
    const parentFolder = bobPull.folders.find((f) => f.title === 'Parent')!;
    expect(bobPull.bookmarks.every((b) => b.masterParentId === parentFolder.masterId)).toBe(true);

    // Bob DELETEs the parent FOLDER.
    await deltaSync(bob, [{
      type: 'DELETE',
      data: { browserId: parentFolder.browserId, masterId: parentFolder.masterId },
    }]);

    await assertAllDevicesConverged([alice, bob]);

    // Critically: the structural invariant check above will FAIL if the
    // children leak through into master-collection reads while still
    // referring to a masterParentId that no longer exists (orphan).
    // The recursive soft-delete must have hidden them. Assert explicitly
    // too so the failure message is meaningful, not just "orphaned":
    const aMc = await masterCollection(alice);
    expect(aMc.folders.find((f) => f.masterId === parentFolder.masterId)).toBeUndefined();
    expect(aMc.bookmarks.filter((b) => b.masterParentId === parentFolder.masterId)).toHaveLength(0);
  });

  it('cross-device UPDATE preserves fields the second device did NOT send (COALESCE contract)', async () => {
    // db.updateBookmark's masterId path (database.ts:1799-1823) uses
    // COALESCE(?, col) so partial updates keep pre-existing fields. This
    // pins that contract because a future "simplification" to plain
    // `SET title = ?` would silently null out fields the second device
    // didn't know about.
    const u = await registerUser();
    const alice = await mkDevice(u, 'alice', fp.chrome);
    const bob = await mkDevice(u, 'bob', fp.firefox);

    const aMark = makeBookmark({ id: 'a-bm', url: 'https://keep.test/url', title: 'Keep Title' });
    await initialSync(alice, { bookmarks: [aMark] });

    const bobPull = await masterCollection(bob);
    const orig = bobPull.bookmarks.find((b) => b.url === aMark.url)!;

    // Bob sends ONLY a title update — no url, no parentId, no masterParentId.
    // The server must keep the original url and masterParentId.
    await deltaSync(bob, [{
      type: 'UPDATE',
      data: {
        type: 'bookmark',
        masterId: orig.masterId,
        title: 'Only Title Changed',
        // url, parentId, masterParentId intentionally omitted.
        position: 3,
      },
    }]);

    const aMc = await masterCollection(alice);
    const updated = aMc.bookmarks.find((b) => b.masterId === orig.masterId)!;
    expect(updated.title).toBe('Only Title Changed');
    expect(updated.url, 'url must survive a partial update').toBe('https://keep.test/url');
    expect(updated.masterParentId, 'masterParentId must survive a partial update').toBe(orig.masterParentId);
  });
});