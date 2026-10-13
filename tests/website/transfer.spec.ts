import { test, expect, loginAs, apiBase } from './_fixtures';

test('paste, preview, cancel, import duplicates, and export a lossless backup', async ({ page, freeAccount }) => {
  await loginAs(page, freeAccount);
  await page.goto('/collections/default');
  await page.getByText('Import, export & paste bookmarks', { exact: true }).click();
  const content = 'Über & <safe>\thttps://example.test/Case?A=B\nDuplicate\thttps://example.test/Case?A=B';
  await page.getByLabel('Paste bookmarks').fill(content);
  await page.getByRole('button', { name: 'Preview import', exact: true }).click();
  await expect(page.getByText('2 bookmarks and 0 folders will be added.')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel preview' }).click();
  const headers = { Authorization: `Bearer ${freeAccount.token}` };
  const before = await page.request.get(`${apiBase()}/collections/default/export`, { headers });
  expect(JSON.stringify((await before.json()).items)).not.toContain('example.test/Case');
  await page.getByRole('button', { name: 'Preview import', exact: true }).click();
  await page.getByRole('button', { name: 'Import bookmarks', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Imported 2 bookmarks and 0 folders.');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON backup' }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('bookmarx-bookmarks.json');
  const stream = await download.createReadStream();
  const chunks = []; for await (const chunk of stream!) chunks.push(chunk);
  const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const bookmarks: any[] = [];
  const visit = (items: any[]) => items.forEach(item => item.type === 'bookmark' ? bookmarks.push(item) : visit(item.children));
  visit(data.items);
  expect(bookmarks.map(b => [b.title, b.url])).toEqual([
    ['Über & <safe>', 'https://example.test/Case?A=B'], ['Duplicate', 'https://example.test/Case?A=B'],
  ]);
  await page.getByLabel('Paste bookmarks').fill('https://valid.test/\nnot a URL');
  await page.getByRole('button', { name: 'Preview import', exact: true }).click();
  await expect(page.locator('details').getByRole('alert')).toContainText('Invalid bookmark URL');
  const after = await page.request.get(`${apiBase()}/collections/default/export`, { headers });
  expect(JSON.stringify((await after.json()).items)).not.toContain('valid.test');
});

test('file upload preserves an empty folder and rejects a malformed backup', async ({ page, freeAccount }) => {
  await loginAs(page, freeAccount);
  await page.goto('/collections/default');
  await page.getByText('Import, export & paste bookmarks', { exact: true }).click();
  await page.getByLabel('Bookmark file').setInputFiles({ name: 'bookmarks.html', mimeType: 'text/html',
    buffer: Buffer.from('<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p><DT><H3>Empty ü</H3><DL><p></DL><p></DL><p>') });
  await page.getByRole('button', { name: 'Preview import', exact: true }).click();
  await expect(page.getByText('0 bookmarks and 1 folders will be added.')).toBeVisible();
  await page.getByRole('button', { name: 'Import bookmarks', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Imported 0 bookmarks and 1 folders.');
  await page.getByLabel('Bookmark file').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{') });
  await page.getByRole('button', { name: 'Preview import', exact: true }).click();
  await expect(page.locator('details').getByRole('alert')).toBeVisible();
});
