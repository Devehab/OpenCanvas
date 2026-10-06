import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';
import { createDesign, getNodes, nodeCenter, openPanel, samplePng, waitForCanvasIdle } from './support';

const EXAMPLES = fileURLToPath(new URL('../../../plugins/examples/', import.meta.url));

/** Packs an example plugin folder like `pnpm plugin:pack` does. */
function packExample(name: string): Buffer {
  const files: Record<string, Uint8Array> = {};
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else
        files[relative(join(EXAMPLES, name), full).split(sep).join('/')] = new Uint8Array(readFileSync(full));
    }
  };
  walk(join(EXAMPLES, name));
  return Buffer.from(zipSync(files));
}

function packFiles(files: Record<string, string>): Buffer {
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)]))));
}

async function install(page: Page, name: string, buffer: Buffer) {
  await page.goto('/settings?tab=plugins');
  await page.getByTestId('plugin-input').setInputFiles([{ name, mimeType: 'application/zip', buffer }]);
  await expect(page.getByTestId('plugin-review')).toBeVisible();
  const id = JSON.parse((await page.getByTestId('plugin-review').getAttribute('data-plugin-id')) ?? 'null') as
    | string
    | null;
  await page.getByTestId('plugin-confirm-install').click();
  await expect(page.getByTestId('plugin-review')).toHaveCount(0);
  if (id)
    await expect(page.locator(`[data-testid="installed-plugin"][data-plugin-id="${id}"]`)).toHaveCount(1);
}

test('install a plugin after reviewing its permissions, then turn it off and uninstall it', async ({
  page,
}) => {
  await page.goto('/settings?tab=plugins');
  await page
    .getByTestId('plugin-input')
    .setInputFiles([
      { name: 'effects.ocplugin', mimeType: 'application/zip', buffer: packExample('image-effects') },
    ]);
  const review = page.getByTestId('plugin-review');
  await expect(review).toContainText('Image effects');
  await expect(page.getByTestId('plugin-permissions')).toContainText('Read the images in your design');
  await expect(page.getByTestId('plugin-permissions')).toContainText('Replace images and add new ones');
  await page.getByTestId('plugin-confirm-install').click();
  const row = page.getByTestId('installed-plugin');
  await expect(row).toHaveAttribute('data-plugin-id', 'org.opencanvas.image-effects');
  await expect(row.getByTestId('plugin-toggle')).toHaveAttribute('aria-checked', 'true');

  await row.getByTestId('plugin-toggle').click();
  await expect(row.getByTestId('plugin-toggle')).toHaveAttribute('aria-checked', 'false');
  await row.getByTestId('plugin-uninstall').click();
  await page.getByTestId('plugin-confirm-uninstall').click();
  await expect(page.getByTestId('installed-plugin')).toHaveCount(0);
});

test('a broken plugin is refused with the reasons', async ({ page }) => {
  await page.goto('/settings?tab=plugins');
  await page.getByTestId('plugin-input').setInputFiles([
    {
      name: 'broken.ocplugin',
      mimeType: 'application/zip',
      buffer: packFiles({
        'opencanvas-plugin.json': JSON.stringify({
          manifestVersion: 1,
          id: 'Bad Id',
          name: 'X',
          version: 'one',
        }),
      }),
    },
  ]);
  const problem = page.getByTestId('plugin-problem');
  await expect(problem).toContainText('manifest is not valid');
  await expect(problem).toContainText('id:');
  await expect(problem).toContainText('version:');
});

test('an image plugin command changes the photo as one undo step', async ({ page }) => {
  await install(page, 'effects.ocplugin', packExample('image-effects'));
  await createDesign(page);
  await openPanel(page, 'uploads');
  await page
    .getByTestId('upload-input')
    .setInputFiles([{ name: 'color.png', mimeType: 'image/png', buffer: samplePng(80, 60) }]);
  await expect.poll(async () => (await getNodes(page)).length).toBe(1);
  const [before] = (await getNodes(page)) as { assetId: string }[];

  await openPanel(page, 'plugins');
  await expect(page.getByTestId('plugin-card')).toHaveCount(1);
  await page.getByTestId('plugin-command-grayscale').click();
  await expect
    .poll(async () => ((await getNodes(page))[0] as { assetId: string }).assetId)
    .not.toBe(before!.assetId);

  // The new image really is gray.
  const gray = await page.evaluate(async () => {
    const { editor } = window.__opencanvas!;
    const node = editor.store.getNodes().find((n) => n.type === 'image') as { assetId: string };
    const asset = editor.store.getAsset(node.assetId)!;
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('opencanvas');
      r.onsuccess = () => resolve(r.result);
    });
    const blob = await new Promise<Blob>((resolve) => {
      const r = db.transaction('assets').objectStore('assets').get(asset.hash);
      r.onsuccess = () => resolve(r.result.blob);
    });
    const bitmap = await createImageBitmap(blob);
    const c = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = c.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    const [r, g, b] = ctx.getImageData(60, 10, 1, 1).data;
    return Math.max(Math.abs(r! - g!), Math.abs(g! - b!));
  });
  expect(gray).toBeLessThanOrEqual(1);

  await page.getByTestId('undo').click();
  expect(((await getNodes(page))[0] as { assetId: string }).assetId).toBe(before!.assetId);

  // The same command is in the image's right-click menu.
  const [image] = await getNodes(page);
  const center = await nodeCenter(page, image!.id);
  await page.mouse.click(center.x, center.y, { button: 'right' });
  await page.getByTestId('plugin-menu-sepia').click();
  await expect
    .poll(async () => ((await getNodes(page))[0] as { assetId: string }).assetId)
    .not.toBe(before!.assetId);
});

test('a plugin with a panel builds a whole design; icon packs show in Elements', async ({ page }) => {
  await install(page, 'layouts.ocplugin', packExample('quick-layouts'));
  await install(page, 'arrows.ocplugin', packExample('hand-drawn-arrows'));
  await createDesign(page);

  await openPanel(page, 'elements');
  await expect(page.getByTestId('custom-icons').getByRole('button')).toHaveCount(8);
  await page.getByTestId('custom-icons').getByRole('button').first().click();
  await expect.poll(async () => (await getNodes(page)).filter((n) => n.type === 'path').length).toBe(1);

  await openPanel(page, 'plugins');
  await page.getByTestId('plugin-open-panel').click();
  const frame = page.frameLocator('iframe[data-plugin-id="org.opencanvas.quick-layouts"]');
  await frame.locator('#title').fill('Grand opening');
  await frame.locator('button[data-kind="poster"]').click();
  await expect
    .poll(async () =>
      (await getNodes(page)).some((n) => n.type === 'text' && JSON.stringify(n).includes('Grand opening')),
    )
    .toBe(true);
  const count = (await getNodes(page)).length;
  expect(count).toBeGreaterThan(5);
  await waitForCanvasIdle(page);
});

test('plugins are sandboxed: no access to the editor page, its storage or the network, and permissions are enforced', async ({
  page,
}) => {
  // A plugin that tries everything it should not be able to do and reports back.
  const probe = `
    const results = [];
    const tryIt = async (name, fn) => {
      try { await fn(); results.push(name + ':open'); } catch { results.push(name + ':blocked'); }
    };
    opencanvas.commands.register('probe', async () => {
      await tryIt('parent', () => window.parent.document.title);
      await tryIt('storage', () => localStorage.length);
      await tryIt('indexeddb', () => new Promise((ok, fail) => { const r = indexedDB.open('opencanvas'); r.onsuccess = ok; r.onerror = fail; }));
      await tryIt('network', () => fetch('https://example.com/'));
      await tryIt('write', () => opencanvas.design.insert([{ type: 'shape', shape: 'rect', width: 10, height: 10 }]));
      await opencanvas.ui.toast(results.join(' '));
    });
  `;
  await install(
    page,
    'probe.ocplugin',
    packFiles({
      'opencanvas-plugin.json': JSON.stringify({
        manifestVersion: 1,
        id: 'test.sandbox-probe',
        name: 'Probe',
        version: '1.0.0',
        description: 'Tries to escape',
        author: 'Tests',
        main: 'main.js',
        permissions: ['design:read'],
        contributes: { commands: [{ id: 'probe', title: 'Probe' }] },
      }),
      'main.js': probe,
    }),
  );
  await createDesign(page);
  await openPanel(page, 'plugins');
  await page.getByTestId('plugin-command-probe').click();
  const toast = page.getByTestId('toast').filter({ hasText: 'parent:' });
  await expect(toast).toBeVisible();
  await expect(toast).toHaveText(
    'parent:blocked storage:blocked indexeddb:blocked network:blocked write:blocked',
  );
  expect(await getNodes(page)).toHaveLength(0);
});
