// tests/extension/cross-browser-regressions.spec.ts
//
// Regression tests for sync bugs found by the cross-browser suite.
//
//  1. Push-before-pull: a browser's own push must not skip changes other browsers
//     made before it. The server advanced the pull watermark on every push, so the
//     earlier change was never delivered.
//  2. Folder delete: deleting a folder on one browser must remove the folder and its
//     contents on another. The masterId lookup missed folders the master had dropped.

import { test, expect } from '@playwright/test';
import { registerFreeUser } from './_fixtures';
import {
  launchPeer, seedAuth, sendFromPopup, createBookmark, createFolder, findLocalByUrl,
  findLocalFolders, removeLocalFolderByTitle, waitFor, retirePeer, type Peer,
} from './_peers';

const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
const url = (tag: string) => `https://example.com/xreg-${runId}-${tag}`;

const syncUp = (p: Peer) => sendFromPopup<any>(p, { action: 'syncNow' });
const syncDown = (p: Peer) => sendFromPopup<any>(p, { action: 'syncDown' });

test.describe('cross-browser sync regressions', () => {
  test('a browser that pushes before pulling still receives earlier changes from another', async () => {
    test.setTimeout(240000);
    const account = await registerFreeUser();
    let a: Peer | null = null;
    let b: Peer | null = null;
    try {
      a = await launchPeer('pp-a', 'chromium');
      b = await launchPeer('pp-b', 'msedge');
      await seedAuth(a, account);
      await seedAuth(b, account);

      const ux = url('pp-x');
      const uy = url('pp-y');
      await createBookmark(a, '1', `XREG PP-X ${runId}`, ux);
      expect(await syncUp(a)).toMatchObject({ success: true });

      // B pushes before it has pulled A's change.
      await createBookmark(b, '1', `XREG PP-Y ${runId}`, uy);
      expect(await syncUp(b)).toMatchObject({ success: true });

      await syncDown(b);
      expect(
        await waitFor(() => findLocalByUrl(b!, ux), (r) => r.length > 0),
        'B must receive A\'s change even though B pushed first',
      ).toHaveLength(1);
    } finally {
      await retirePeer(a, null);
      await retirePeer(b, account);
    }
  });

  test('deleting a folder on one browser removes it and its contents on another', async () => {
    test.setTimeout(240000);
    const account = await registerFreeUser();
    let a: Peer | null = null;
    let b: Peer | null = null;
    try {
      a = await launchPeer('fd-a', 'chromium');
      b = await launchPeer('fd-b', 'msedge');
      await seedAuth(a, account);
      await seedAuth(b, account);

      const folderTitle = `XREG FOLDER ${runId}`;
      const child = url('folder-child');
      const folderId = await createFolder(a, '1', folderTitle);
      await createBookmark(a, folderId, `XREG CHILD ${runId}`, child);
      expect(await syncUp(a)).toMatchObject({ success: true });

      await syncDown(b);
      expect(
        await waitFor(() => findLocalFolders(b!, folderTitle), (r) => r.length > 0),
      ).toHaveLength(1);
      expect(await waitFor(() => findLocalByUrl(b!, child), (r) => r.length > 0)).toHaveLength(1);

      // A deletes the folder and its contents, then pushes.
      await removeLocalFolderByTitle(a, folderTitle);
      expect(await syncUp(a)).toMatchObject({ success: true });

      await syncDown(b);
      expect(
        await waitFor(() => findLocalFolders(b!, folderTitle), (r) => r.length === 0),
        'folder should be removed on B',
      ).toHaveLength(0);
      expect(await findLocalByUrl(b!, child), 'child bookmark should be removed on B').toHaveLength(0);
    } finally {
      await retirePeer(a, null);
      await retirePeer(b, account);
    }
  });
});
