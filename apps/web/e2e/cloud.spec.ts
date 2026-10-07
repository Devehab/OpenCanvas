/**
 * Cloud sync, end to end, against a real S3 server with authentication.
 * Run with playwright.cloud.config.ts (it starts the S3 server and an
 * OpenCanvas server set up like a local install).
 *
 * Each browser context is a separate computer: it has its own IndexedDB.
 * "No internet" is simulated the way it happens: the bucket becomes
 * unreachable (a relay between the server and S3 is cut), while the
 * settings stay exactly the same.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { type Browser, expect, type Page, test } from '@playwright/test';
import { S3Client } from '../src/lib/cloud/s3';
import {
  createDesign,
  getNodes,
  insertNodes,
  openPanel,
  samplePng,
  waitForCanvasIdle,
  waitForSaved,
} from './support';

const home = process.env.E2E_CLOUD_HOME!;
const prefix = `e2e-${Date.now()}/`;

interface S3Info {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

function s3Info(): S3Info {
  return JSON.parse(readFileSync(process.env.E2E_S3_INFO!, 'utf8')) as S3Info;
}

function writeCloudJson(endpoint: string) {
  const info = s3Info();
  writeFileSync(
    path.join(home, 'cloud.json'),
    JSON.stringify({
      version: 1,
      enabled: true,
      provider: 'custom',
      endpoint,
      region: 'us-east-1',
      bucket: info.bucket,
      accessKeyId: info.accessKeyId,
      secretAccessKey: info.secretAccessKey,
      pathStyle: true,
      prefix,
      deviceId: 'e2e',
      createdAt: Date.now(),
    }),
  );
}

// A TCP relay in front of the S3 server: cutting it is "no internet".
let relay: net.Server | null = null;
let relayPort = 0;
const sockets = new Set<net.Socket>();

async function goOnline() {
  if (relay) return;
  const target = new URL(s3Info().endpoint);
  relay = net.createServer((client) => {
    const upstream = net.connect(Number(target.port), target.hostname);
    for (const socket of [client, upstream]) {
      sockets.add(socket);
      socket.on('error', () => socket.destroy());
      socket.on('close', () => sockets.delete(socket));
    }
    client.pipe(upstream).pipe(client);
  });
  await new Promise<void>((resolve) => relay!.listen(relayPort, '127.0.0.1', resolve));
  relayPort = (relay.address() as net.AddressInfo).port;
}

/** The internet goes away: the bucket can no longer be reached. */
async function goOffline() {
  const server = relay;
  relay = null;
  for (const socket of sockets) socket.destroy();
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
}

const bucket = () => new S3Client({ ...s3Info(), region: 'us-east-1', pathStyle: true });

interface BucketRecord {
  store: string;
  deleted: boolean;
  value: { id?: string; title?: string; name?: string; blob?: { $blob: string } };
}

async function bucketRecord(store: string, key: string): Promise<BucketRecord | null> {
  const object = await bucket().get(`${prefix}records/${store}/${key}.json`);
  return object ? (JSON.parse(new TextDecoder().decode(object.body)) as BucketRecord) : null;
}

/** Clicks "Sync now" and waits for that round to finish. */
async function syncNow(page: Page) {
  const status = page.getByTestId('cloud-status').first();
  await expect(status).toBeVisible();
  // Let a round that is already running finish first.
  await expect(status).not.toHaveAttribute('data-state', 'syncing');
  const before = Number(await status.getAttribute('data-rounds'));
  await status.click();
  await page.getByTestId('cloud-sync-now').click();
  await page.keyboard.press('Escape');
  await expect.poll(async () => Number(await status.getAttribute('data-rounds'))).toBeGreaterThan(before);
  await expect(status).not.toHaveAttribute('data-state', 'syncing');
}

async function expectSynced(page: Page) {
  const status = page.getByTestId('cloud-status').first();
  await expect(status).toHaveAttribute('data-state', 'synced');
  await expect(status).toHaveAttribute('data-pending', '0');
}

/** A new computer: a browser context with an empty IndexedDB. */
async function newComputer(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
  return context.newPage();
}

/** Renames the open design and waits until it is saved on this computer. */
async function setTitle(page: Page, title: string) {
  await page.evaluate((t) => {
    const { editor } = window.__opencanvas!;
    editor.execute('document.rename', { title: t });
  }, title);
  await waitForSaved(page);
}

test.describe.configure({ mode: 'serial' });

let designId = '';

test.beforeAll(async () => {
  test.setTimeout(180_000);
  for (let i = 0; i < 480 && !existsSync(process.env.E2E_S3_INFO!); i++) {
    await new Promise((r) => setTimeout(r, 250));
  }
  await goOnline();
  writeCloudJson(`http://127.0.0.1:${relayPort}`);
});

test.afterAll(async () => {
  await goOffline();
});

test('uploads designs and files to the bucket, and says when everything is saved there', async ({ page }) => {
  designId = await createDesign(page);
  await setTitle(page, 'Cloud poster');
  await insertNodes(page, [
    {
      type: 'shape',
      shape: 'rect',
      x: 100,
      y: 100,
      width: 300,
      height: 200,
      fill: { type: 'solid', color: '#7c3aed' },
    },
  ]);
  await openPanel(page, 'uploads');
  await page
    .getByTestId('upload-input')
    .setInputFiles([{ name: 'photo.png', mimeType: 'image/png', buffer: samplePng(80, 60) }]);
  await expect.poll(async () => (await getNodes(page)).filter((n) => n.type === 'image').length).toBe(1);
  await waitForCanvasIdle(page);
  await waitForSaved(page);

  // The editor shows the cloud status next to "Saved".
  await syncNow(page);
  await expectSynced(page);

  const doc = await bucketRecord('designs', designId);
  expect(doc).toMatchObject({
    store: 'designs',
    deleted: false,
    value: { id: designId, title: 'Cloud poster' },
  });
  const image = (await getNodes(page)).find((n) => n.type === 'image') as unknown as { assetId: string };
  const hash = await page.evaluate(
    (assetId) => window.__opencanvas!.editor.store.getAsset(assetId)!.hash,
    image.assetId,
  );
  const asset = await bucketRecord('assets', hash!);
  expect(asset?.value.name).toBe('photo.png');
  const blobHash = asset!.value.blob!.$blob;
  const blob = await bucket().get(`${prefix}blobs/${blobHash}`);
  expect(blob!.body.byteLength).toBeGreaterThan(50);

  await page.goto('/');
  await expectSynced(page);
  await expect(page.getByTestId('local-only-badge')).toHaveCount(0);
});

test('without internet it keeps working, marks what is only on this computer, and uploads it when back', async ({
  page,
}) => {
  await page.goto('/');
  await expectSynced(page);
  await goOffline();
  await page.goto(`/design/${designId}`);
  await setTitle(page, 'Edited offline');
  await syncNow(page);
  const status = page.getByTestId('cloud-status').first();
  await expect(status).toHaveAttribute('data-state', 'offline');
  await expect(status).toContainText('Offline: saved on this computer');

  await page.goto('/');
  await syncNow(page);
  await expect(page.getByTestId('cloud-status').first()).toHaveAttribute('data-state', 'offline');
  const card = page.getByTestId('design-card').filter({ hasText: 'Edited offline' });
  await expect(card.getByTestId('local-only-badge')).toBeVisible();
  // The bucket still has the old version.
  expect((await bucketRecord('designs', designId))?.value.title).toBe('Cloud poster');

  // The connection comes back: it uploads by itself (no click).
  await goOnline();
  await expect(card.getByTestId('local-only-badge')).toHaveCount(0, { timeout: 40_000 });
  await expectSynced(page);
  expect((await bucketRecord('designs', designId))?.value.title).toBe('Edited offline');
});

test('a new computer (or a reinstall) gets everything back from the bucket', async ({ browser }) => {
  const page = await newComputer(browser);
  await page.goto('/');
  const card = page.getByTestId('design-card').filter({ hasText: 'Edited offline' });
  await expect(card).toBeVisible();
  await expectSynced(page);
  await card.getByRole('link').first().click();
  await page.waitForURL(`**/design/${designId}`);
  await waitForCanvasIdle(page);
  const nodes = await getNodes(page);
  expect(nodes.map((n) => n.type).sort()).toEqual(['image', 'shape']);
  // The photo's file came back too, and the uploads library has it.
  await openPanel(page, 'uploads');
  await expect(page.getByTestId('upload-item')).toHaveCount(1);
  await page.context().close();
});

test('an open editor follows a change synced from another computer', async ({ page, browser }) => {
  // Each test starts as a new computer: get the library first.
  await page.goto('/');
  await expect(page.getByTestId('design-card').filter({ hasText: 'Edited offline' })).toBeVisible();
  await page.goto(`/design/${designId}`);
  await waitForCanvasIdle(page);
  await expectSynced(page);

  const other = await newComputer(browser);
  await other.goto('/');
  await expect(other.getByTestId('design-card').filter({ hasText: 'Edited offline' })).toBeVisible();
  await other.goto(`/design/${designId}`);
  await waitForCanvasIdle(other);
  await setTitle(other, 'Renamed on the other computer');
  await syncNow(other);
  await expectSynced(other);
  await other.context().close();

  await syncNow(page);
  await expect(page.getByTestId('design-title-input')).toHaveValue('Renamed on the other computer');
});

test('when two computers change the same design, both versions are kept', async ({ page, browser }) => {
  await page.goto('/');
  await expectSynced(page);
  const other = await newComputer(browser);
  await other.goto('/');
  await expect(
    other.getByTestId('design-card').filter({ hasText: 'Renamed on the other computer' }),
  ).toBeVisible();
  await expectSynced(other);

  await goOffline();
  await page.goto(`/design/${designId}`);
  await setTitle(page, 'Version from computer A');
  await other.goto(`/design/${designId}`);
  await setTitle(other, 'Version from computer B');

  await goOnline();
  await other.goto('/');
  await syncNow(other);
  await expectSynced(other);
  await page.goto('/');
  await syncNow(page);
  await expectSynced(page);
  await syncNow(other);
  await expectSynced(other);

  for (const p of [page, other]) {
    await p.goto('/');
    // Exactly the two versions: no duplicate copies.
    await expect(p.getByTestId('design-card').filter({ hasText: 'Version from computer' })).toHaveCount(2);
    await expect(p.getByTestId('design-card').filter({ hasText: 'Version from computer B' })).toHaveCount(1);
    await expect(
      p.getByTestId('design-card').filter({ hasText: 'Version from computer A (from another computer)' }),
    ).toHaveCount(1);
  }
  await other.context().close();
});

test('deleting a design for good removes it everywhere', async ({ page, browser }) => {
  await page.goto('/');
  await expectSynced(page);
  const copy = page.getByTestId('design-card').filter({ hasText: '(from another computer)' });
  const copyId = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('opencanvas');
      r.onsuccess = () => resolve(r.result);
    });
    const all = await new Promise<{ id: string; title: string }[]>((resolve) => {
      const r = db.transaction('designs').objectStore('designs').getAll();
      r.onsuccess = () => resolve(r.result);
    });
    return all.find((d) => d.title.includes('(from another computer)'))!.id;
  });
  await page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('opencanvas');
      r.onsuccess = () => resolve(r.result);
    });
    await new Promise((resolve) => {
      const tx = db.transaction('designs', 'readwrite');
      tx.objectStore('designs').delete(id);
      tx.oncomplete = resolve;
    });
  }, copyId);
  await page.reload();
  await expect(copy).toHaveCount(0);
  await syncNow(page);
  await expectSynced(page);
  expect((await bucketRecord('designs', copyId))?.deleted).toBe(true);

  const other = await newComputer(browser);
  await other.goto('/');
  await expect(other.getByTestId('design-card').filter({ hasText: 'Version from computer B' })).toBeVisible();
  await expectSynced(other);
  await expect(other.getByTestId('design-card').filter({ hasText: '(from another computer)' })).toHaveCount(
    0,
  );
  await other.context().close();
});

test('the cloud API only answers OpenCanvas itself, never other websites', async ({ page, request }) => {
  // No sync header: refused.
  expect((await request.get('/api/cloud/status')).status()).toBe(403);
  // Another site in the browser: the header needs a CORS preflight that is never allowed.
  await page.goto('/');
  const fromOtherSite = await page.evaluate(async () => {
    try {
      const res = await fetch('http://127.0.0.1:3101/api/cloud/records', {
        headers: { 'x-opencanvas-sync': '1' },
      });
      return res.status;
    } catch {
      return 'blocked';
    }
  });
  // localhost and 127.0.0.1 are different origins: the cross-origin request is blocked.
  expect(fromOtherSite).toBe('blocked');
  // A forged Host (DNS rebinding) is refused.
  expect(
    (
      await request.get('/api/cloud/status', {
        headers: { 'x-opencanvas-sync': '1', host: 'evil.example:3101' },
      })
    ).status(),
  ).toBe(403);
  // The keys never reach the browser.
  const status = await page.evaluate(async () =>
    (await fetch('/api/cloud/status', { headers: { 'x-opencanvas-sync': '1' } })).text(),
  );
  expect(status).not.toContain(s3Info().secretAccessKey);
  expect(status).not.toContain(s3Info().accessKeyId);
});
