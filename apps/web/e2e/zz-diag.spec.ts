// Temporary diagnostics (WebKit: deleting an upload after renaming it); removed once understood.
import { expect, test } from './fixtures';
import { createDesign, openPanel, samplePng } from './support';

/** get + put of an asset record in one transaction, as the app does; reports what happens. */
const reput = (page: import('@playwright/test').Page, label: string) =>
  page.evaluate(async (label) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('opencanvas');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const hash = await new Promise<string>((resolve) => {
      const r = db.transaction('assets').objectStore('assets').getAllKeys();
      r.onsuccess = () => resolve(String(r.result[0]));
    });
    const result = await Promise.race([
      new Promise<string>((resolve) => {
        const tx = db.transaction('assets', 'readwrite');
        const store = tx.objectStore('assets');
        const get = store.get(hash);
        get.onsuccess = () => {
          try {
            const put = store.put({ ...get.result, name: `${get.result.name}-${label}` });
            put.onerror = () => resolve(`put error ${put.error?.name}: ${put.error?.message}`);
          } catch (e) {
            resolve(`put threw ${(e as Error).name}: ${(e as Error).message}`);
          }
        };
        tx.oncomplete = () => resolve('ok');
        tx.onerror = () => resolve(`tx error ${tx.error?.name}: ${tx.error?.message}`);
        tx.onabort = () => resolve(`tx abort ${tx.error?.name}: ${tx.error?.message}`);
      }),
      new Promise<string>((resolve) => setTimeout(() => resolve('timeout (10 s)'), 10_000)),
    ]);
    db.close();
    return `${label}: ${result}`;
  }, label);

test('diag: re-putting an uploaded image record', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console ${m.text()}`));
  await createDesign(page);
  await openPanel(page, 'uploads');
  await page
    .getByTestId('upload-input')
    .setInputFiles([{ name: 'wide.png', mimeType: 'image/png', buffer: samplePng(400, 200) }]);
  await expect(page.getByTestId('upload-item')).toHaveCount(1);
  const results = [await reput(page, 'first'), await reput(page, 'second'), await reput(page, 'third')];
  // Then the app's own delete.
  await page.getByTestId('upload-menu').first().focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: 'Delete' }).focus();
  await page.keyboard.press('Enter');
  const confirm = page.getByTestId('confirm-delete-upload');
  await confirm.focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3000);
  results.push(`dialog after delete: ${(await confirm.isVisible()) ? 'open' : 'closed'}`);
  results.push(`focused: ${await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 120))}`);
  results.push(...errors);
  expect(results).toEqual(['report']);
});
