/**
 * Cloud sync, end to end, against a real S3 server with authentication.
 * Run with playwright.cloud.config.ts (it starts the S3 server and an
 * OpenCanvas server set up like a local install).
 *
 * Each browser context is a separate computer: it has its own IndexedDB.
 * "No internet" is simulated the way it happens: the bucket becomes
 * unreachable (a relay between the server and S3 is cut), while the
 * settings stay exactly the same. A second OpenCanvas server (its own
 * settings and device id, reaching S3 directly) is a second computer on
 * another network.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { decodeRecord } from '../src/lib/cloud/codec';
import { S3Client } from '../src/lib/cloud/s3';
import { type Browser, expect, type Page, test } from './fixtures';
import {
  createDesign,
  getNodes,
  insertNodes,
  noisePng,
  openPanel,
  samplePng,
  waitForCanvasIdle,
  waitForSaved,
} from './support';

const require = createRequire(import.meta.url);

const home = process.env.E2E_CLOUD_HOME!;
const homeB = process.env.E2E_CLOUD_HOME_B!;
/** The second computer's OpenCanvas. */
const urlB = process.env.E2E_CLOUD_URL_B!;
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

function writeCloudJson(endpoint: string, dir = home, deviceId = 'e2e') {
  const info = s3Info();
  writeFileSync(
    path.join(dir, 'cloud.json'),
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
      deviceId,
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
  return object ? (JSON.parse(new TextDecoder().decode(decodeRecord(object.body))) as BucketRecord) : null;
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
  // Right after opening a design, the editor may still be loading.
  await page.waitForFunction(() => !!window.__opencanvas?.editor);
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
  // The second computer is on another network: it reaches S3 directly.
  writeCloudJson(s3Info().endpoint, homeB, 'computer-b');
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

/** Every record of an IndexedDB store on a computer (a browser page). */
async function localRecords(page: Page, store: string): Promise<Record<string, unknown>[]> {
  return page.evaluate(async (name) => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('opencanvas');
      r.onsuccess = () => resolve(r.result);
    });
    const all = await new Promise<Record<string, unknown>[]>((resolve) => {
      const r = db.transaction(name).objectStore(name).getAll();
      r.onsuccess = () => resolve(r.result);
    });
    db.close();
    // Files become their size and SHA-256, to compare them across computers.
    const digest = async (blob: Blob) =>
      [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    const plain = async (v: unknown): Promise<unknown> => {
      if (v instanceof Blob) return { file: await digest(v), size: v.size, type: v.type };
      if (Array.isArray(v)) return Promise.all(v.map(plain));
      if (v && typeof v === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, x] of Object.entries(v)) out[k] = await plain(x);
        return out;
      }
      return v;
    };
    return (await plain(all)) as Record<string, unknown>[];
  }, store);
}

test('saves on this computer at once, uploads once editing pauses (one upload), and never while browsing pages', async ({
  page,
}) => {
  const id = await createDesign(page);
  await setTitle(page, 'Paused uploads');
  await page.evaluate(() => {
    const { editor } = window.__opencanvas!;
    editor.addPage(editor.pageId);
    editor.addPage(editor.pageId);
  });
  const [shapeId] = await insertNodes(page, [
    { type: 'shape', shape: 'rect', x: 100, y: 100, width: 200, height: 200 },
  ]);
  await waitForSaved(page);
  const status = page.getByTestId('cloud-status').first();
  // Nothing to click: it reaches the cloud by itself once editing pauses.
  await expect(status).toHaveAttribute('data-shown', 'synced', { timeout: 20_000 });

  const uploads: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'PUT' && r.url().includes('/api/cloud/object'))
      uploads.push(new URL(r.url()).searchParams.get('path')!);
  });
  // A burst of edits, each saved on this computer at once.
  const shown: string[] = [];
  for (let i = 1; i <= 8; i++) {
    await page.evaluate(
      ([nodeId, x]) => window.__opencanvas!.editor.execute('node.update', { ids: [nodeId], patch: { x } }),
      [shapeId!, 100 + i * 10] as const,
    );
    await waitForSaved(page);
    await expect(page.getByTestId('save-status')).toContainText('Saved on this computer');
    shown.push((await status.getAttribute('data-shown'))!);
    await page.waitForTimeout(400);
  }
  // Never "Saved to your cloud" while the last change is not up there, and nothing went up mid-burst.
  expect(shown).not.toContain('synced');
  // One status: saved on this computer, waiting to go up.
  await expect(status).toHaveAttribute('data-shown', 'waiting');
  await expect(status).toContainText('Saved on this computer');
  expect(uploads).toEqual([]);

  // Editing pauses: one upload of the design (and the small change marker).
  await expect(status).toHaveAttribute('data-shown', 'synced', { timeout: 15_000 });
  await expect(status).toContainText('Saved to your cloud');
  expect(uploads.sort()).toEqual(['changes.json', `records/designs/${id}.json`]);
  expect(JSON.stringify((await bucketRecord('designs', id))!.value)).toContain('"x":180');

  // Browsing pages, scrolling and zooming change nothing: nothing goes up.
  uploads.length = 0;
  await page.evaluate(() => {
    const { editor } = window.__opencanvas!;
    for (const pageId of editor.store.getPageIds()) editor.setCurrentPage(pageId);
    editor.setPageView('scroll');
    editor.zoomTo(1.5);
    editor.setCurrentPage(editor.store.getPageIds()[0]!);
  });
  await page.mouse.move(700, 450);
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 300);
  await page.waitForTimeout(6000);
  expect(uploads).toEqual([]);
  await expect(status).toHaveAttribute('data-shown', 'synced');
});

test('large designs are stored compressed in the bucket and come back exactly', async ({ page, browser }) => {
  const id = await createDesign(page);
  await setTitle(page, 'Many shapes');
  await insertNodes(
    page,
    Array.from({ length: 250 }, (_, i) => ({
      type: 'shape' as const,
      shape: 'rect' as const,
      x: (i % 20) * 50,
      y: Math.floor(i / 20) * 50,
      width: 40,
      height: 40,
      fill: { type: 'solid' as const, color: '#7c3aed' },
    })),
    { center: false },
  );
  await waitForSaved(page);
  await syncNow(page);
  await expectSynced(page);
  const stored = await bucket().head(`${prefix}records/designs/${id}.json`);
  const json = JSON.stringify(await bucketRecord('designs', id));
  // Five to ten times smaller to upload and to keep.
  expect(stored!.size).toBeLessThan(json.length / 4);

  const other = await newComputer(browser);
  await other.goto('/');
  await expect(other.getByTestId('design-card').filter({ hasText: 'Many shapes' })).toBeVisible();
  await other.goto(`/design/${id}`);
  await waitForCanvasIdle(other);
  expect(await getNodes(other)).toEqual(await getNodes(page));
  await other.context().close();
});

test('two computers, each with its own OpenCanvas, share everything (files byte for byte), both ways and by themselves', async ({
  page,
  browser,
}) => {
  // Computer A: a folder, a brand kit, an uploaded font, and a three-page design with a photo.
  await page.goto('/designs');
  await page.getByTestId('new-folder').click();
  await page.getByTestId('folder-name').fill('Client work');
  await page.getByTestId('save-folder').click();
  await expect(page.getByTestId('folder-card')).toHaveCount(1);
  await page.goto('/brand');
  await page.getByTestId('new-brand').first().click();
  await page.getByTestId('brand-kit-name').fill('Acme brand');
  await page.getByTestId('create-brand').click();
  await page.waitForURL(/\/brand\?id=/);
  await page.goto('/settings');
  await page.getByTestId('settings-font-input').setInputFiles([
    {
      name: 'AcmeScript-Regular.woff2',
      mimeType: 'font/woff2',
      buffer: readFileSync(require.resolve('@fontsource/pacifico/files/pacifico-latin-400-normal.woff2')),
    },
  ]);
  await expect(page.getByTestId('custom-font')).toHaveCount(1);
  const id = await createDesign(page);
  await setTitle(page, 'Shared design');
  await page.evaluate(() => {
    const { editor } = window.__opencanvas!;
    editor.addPage(editor.pageId);
    editor.addPage(editor.pageId);
  });
  await openPanel(page, 'uploads');
  const photo = noisePng(640, 480);
  await page
    .getByTestId('upload-input')
    .setInputFiles([{ name: 'big-photo.png', mimeType: 'image/png', buffer: photo }]);
  await expect.poll(async () => (await getNodes(page)).filter((n) => n.type === 'image').length).toBe(1);
  await waitForSaved(page);
  await expect(page.getByTestId('cloud-status').first()).toHaveAttribute('data-shown', 'synced', {
    timeout: 30_000,
  });

  // Computer B: its own OpenCanvas (another server and device), an empty browser.
  const contextB = await browser.newContext({ baseURL: urlB, viewport: { width: 1440, height: 900 } });
  const b = await contextB.newPage();
  await b.goto('/');
  await expect(b.getByTestId('design-card').filter({ hasText: 'Shared design' })).toBeVisible({
    timeout: 30_000,
  });
  await expectSynced(b);
  for (const store of ['designs', 'assets', 'folders', 'brands', 'fonts']) {
    const mine = await localRecords(page, store);
    const theirs = await localRecords(b, store);
    const byKey = (r: Record<string, unknown>) => String(r.id ?? r.hash);
    // The same records, with the same content: files byte for byte.
    expect(theirs.map(byKey).sort(), store).toEqual(mine.map(byKey).sort());
    for (const record of mine) {
      const other = theirs.find((r) => byKey(r) === byKey(record))!;
      const { revision: _a, ...left } = record;
      const { revision: _b, ...right } = other;
      expect(right, `${store}/${byKey(record)}`).toEqual(left);
    }
  }
  // The photo on computer B is the very file uploaded on A: same bytes, full resolution.
  const photoOnB = (await localRecords(b, 'assets')).find((r) => r.name === 'big-photo.png')!;
  expect(photoOnB).toMatchObject({
    width: 640,
    height: 480,
    blob: {
      file: createHash('sha256').update(photo).digest('hex'),
      size: photo.byteLength,
      type: 'image/png',
    },
  });
  await b.goto(`/design/${id}`);
  await waitForCanvasIdle(b);
  // Every page, every element (the photo included) is there.
  const everything = (p: Page) =>
    p.evaluate(() => {
      const { store } = window.__opencanvas!.editor;
      return { pages: store.getPageIds(), nodes: store.getNodes().sort((x, y) => (x.id < y.id ? -1 : 1)) };
    });
  const onB = await everything(b);
  expect(onB.pages).toHaveLength(3);
  expect(onB.nodes.some((n) => n.type === 'image')).toBe(true);
  expect(onB).toEqual(await everything(page));

  // B edits: it goes up by itself, and A, already showing its designs, gets it by itself (no reload).
  await page.goto('/');
  await expectSynced(page);
  await setTitle(b, 'Shared design, edited on B');
  await expect(b.getByTestId('cloud-status').first()).toHaveAttribute('data-shown', 'synced', {
    timeout: 20_000,
  });
  await expect(page.getByTestId('design-card').filter({ hasText: 'Shared design, edited on B' })).toBeVisible(
    {
      timeout: 45_000,
    },
  );

  // And the other way round.
  await b.goto('/');
  await expectSynced(b);
  await page.goto(`/design/${id}`);
  await setTitle(page, 'Shared design, edited on A');
  await expect(page.getByTestId('cloud-status').first()).toHaveAttribute('data-shown', 'synced', {
    timeout: 20_000,
  });
  await expect(b.getByTestId('design-card').filter({ hasText: 'Shared design, edited on A' })).toBeVisible({
    timeout: 45_000,
  });
  await contextB.close();
});

test('brand kits and templates (with their folders) reach another computer, and stay templates there', async ({
  page,
  browser,
}) => {
  // Computer A: a full brand kit (an extra color, a logo, a heading font)…
  await page.goto('/brand');
  await page.getByTestId('new-brand').first().click();
  await page.getByTestId('brand-kit-name').fill('Studio kit');
  await page.getByTestId('create-brand').click();
  await page.waitForURL(/\/brand\?id=/);
  const brandId = new URL(page.url()).searchParams.get('id')!;
  await page.getByTestId('brand-add-color').click();
  const logo = noisePng(300, 120);
  await page
    .getByTestId('brand-input-logos')
    .setInputFiles([{ name: 'studio-logo.png', mimeType: 'image/png', buffer: logo }]);
  await expect(page.getByTestId('brand-images-logos').locator('li')).toHaveCount(1);
  await page.getByTestId('brand-font-heading-family').selectOption('Cairo');

  // …a template folder with an icon, a starter copied to the templates, and a design saved as a template into the folder.
  await page.goto('/templates');
  await page.getByTestId('new-template-folder').click();
  await page.getByTestId('template-folder-name').fill('Social');
  await page.locator('input[data-testid="template-folder-icon"][value="heart"]').check({ force: true });
  await page.getByTestId('save-template-folder').click();
  const sale = page.getByTestId('starter-card').filter({ hasText: 'Summer sale' });
  await sale.hover();
  await sale.getByTestId('starter-menu').click();
  await page.getByTestId('copy-starter').click();
  await expect(page.getByTestId('template-card').filter({ hasText: 'Summer sale' })).toHaveCount(1);
  await createDesign(page);
  await insertNodes(page, [{ type: 'shape', shape: 'star', x: 200, y: 200, width: 300, height: 300 }], {
    center: false,
  });
  await waitForSaved(page);
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByTestId('editor-save-as-template').click();
  await page.getByTestId('template-name').fill('Promo');
  await page.getByTestId('template-folder-select').selectOption({ label: 'Social' });
  await page.getByTestId('confirm-save-template').click();
  await page.goto('/templates');
  await expect(page.getByTestId('template-folder-card')).toContainText('1 template');
  await expect(page.getByTestId('cloud-status').first()).toHaveAttribute('data-shown', 'synced', {
    timeout: 30_000,
  });
  const templatesOn = async (p: Page) =>
    (await localRecords(p, 'designs')).filter((d) => d.kind === 'template' && d.deletedAt === null);
  const templates = await templatesOn(page);
  expect(templates.map((d) => d.title).sort()).toEqual(['Promo', 'Summer sale']);

  // Computer B: the kit, the folder (with its icon) and both templates arrive by themselves.
  const contextB = await browser.newContext({ baseURL: urlB, viewport: { width: 1440, height: 900 } });
  const b = await contextB.newPage();
  await b.goto('/templates');
  const folderOnB = b.getByTestId('template-folder-card').filter({ hasText: 'Social' });
  await expect(folderOnB).toBeVisible({ timeout: 30_000 });
  await expect(folderOnB.locator('[data-icon]')).toHaveAttribute('data-icon', 'heart');
  await expect(folderOnB).toContainText('1 template');
  await expect(b.getByTestId('template-card').filter({ hasText: 'Summer sale' })).toHaveCount(1);
  await expectSynced(b);

  // The very same records: the brand kit, the folder and the templates (still templates).
  const same = async (store: string, keep: (r: Record<string, unknown>) => boolean) => {
    const mine = (await localRecords(page, store)).filter(keep);
    const theirs = (await localRecords(b, store)).filter(keep);
    expect(theirs.length, store).toBe(mine.length);
    for (const record of mine) {
      const other = theirs.find((r) => r.id === record.id)!;
      const { revision: _a, ...left } = record;
      const { revision: _b, ...right } = other ?? {};
      expect(right, `${store}/${String(record.id)}`).toEqual(left);
    }
  };
  await same('brands', (r) => r.id === brandId);
  await same('folders', (r) => r.kind === 'template');
  await same('designs', (r) => r.kind === 'template');
  // The kit's logo is the very file uploaded on A.
  const kit = (await localRecords(b, 'brands')).find((r) => r.id === brandId) as {
    name: string;
    logos: { hash: string }[];
    fonts: { heading: { family: string } };
  };
  expect(kit.name).toBe('Studio kit');
  expect(kit.fonts.heading.family).toBe('Cairo');
  const logoOnB = (await localRecords(b, 'assets')).find((r) => r.hash === kit.logos[0]!.hash) as {
    blob: { file: string; size: number };
  };
  expect(logoOnB.blob).toMatchObject({
    file: createHash('sha256').update(logo).digest('hex'),
    size: logo.byteLength,
  });
  // Templates stay out of B's designs.
  await b.goto('/');
  await expect(b.getByTestId('design-card').filter({ hasText: 'Promo' })).toHaveCount(0);

  // B renames a template; A, showing its templates, gets the new name by itself.
  await b.goto('/templates?folder=' + String(templates.find((d) => d.title === 'Promo')!.folderId));
  const promo = b.getByTestId('template-card').filter({ hasText: 'Promo' });
  await promo.hover();
  await promo.getByTestId('template-menu').click();
  await b.getByTestId('rename-template').click();
  await b.getByTestId('rename-template-input').fill('Promo (team)');
  await b.getByTestId('confirm-rename-template').click();
  await expect(b.getByTestId('cloud-status').first()).toHaveAttribute('data-shown', 'synced', {
    timeout: 20_000,
  });
  await page.goto('/templates?folder=' + String(templates.find((d) => d.title === 'Promo')!.folderId));
  await expect(page.getByTestId('template-title')).toHaveText('Promo (team)', { timeout: 45_000 });
  await contextB.close();
});

test('while nothing changes, it only checks the tiny change marker: no listing, no uploads', async ({
  page,
}) => {
  await page.goto('/');
  await expectSynced(page);
  const calls: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/cloud/')) calls.push(`${r.method()} ${new URL(r.url()).pathname}`);
  });
  await page.waitForTimeout(25_000);
  expect(calls.filter((c) => c.includes('/api/cloud/records'))).toEqual([]);
  expect(calls.filter((c) => !c.startsWith('GET'))).toEqual([]);
  // One small check every 20 seconds.
  const checks = calls.filter((c) => c === 'GET /api/cloud/status').length;
  expect(checks).toBeGreaterThanOrEqual(1);
  expect(checks).toBeLessThanOrEqual(2);
});

test('leaving the tab uploads what waits at once, without waiting for the pause', async ({ page }) => {
  const id = await createDesign(page);
  await setTitle(page, 'Leaving now');
  const status = page.getByTestId('cloud-status').first();
  await expect(status).toHaveAttribute('data-shown', 'synced', { timeout: 20_000 });
  await setTitle(page, 'Left the tab');
  await expect(status).toHaveAttribute('data-shown', 'waiting');
  const hiddenAt = Date.now();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(async () => (await bucketRecord('designs', id))?.value.title).toBe('Left the tab');
  // Well before the 3 seconds a pause in editing waits for.
  expect(Date.now() - hiddenAt).toBeLessThan(2500);
});
