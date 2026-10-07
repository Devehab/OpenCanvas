/**
 * The S3 client and the setup checks against a real S3 server with
 * authentication (scripts/s3-test-server.py). Skipped unless S3_TEST is set
 * to the JSON line that script prints.
 */
import { describe, expect, it } from 'vitest';
import { buildConfig, checkConnection, explainS3Error, libraryInfo } from '@/lib/cloud/config';
import { S3Client } from '@/lib/cloud/s3';

const server = process.env.S3_TEST
  ? (JSON.parse(process.env.S3_TEST) as {
      endpoint: string;
      bucket: string;
      accessKeyId: string;
      secretAccessKey: string;
    })
  : null;

describe.skipIf(!server)('S3 client against a real server', () => {
  const config = () => ({ ...server!, region: 'us-east-1', pathStyle: true });
  const prefix = `it-${Date.now()}/`;

  it('writes, reads, lists and deletes', async () => {
    const client = new S3Client(config());
    const created = await client.put(`${prefix}a b.json`, new TextEncoder().encode('{"x":1}'), {
      contentType: 'application/json',
      ifNoneMatch: true,
    });
    expect(created.ok).toBe(true);
    const got = await client.get(`${prefix}a b.json`);
    expect(new TextDecoder().decode(got!.body)).toBe('{"x":1}');
    expect(got!.etag).toBe(created.ok ? created.etag : '');
    expect((await client.head(`${prefix}a b.json`))?.size).toBe(7);
    expect(await client.get(`${prefix}missing`)).toBeNull();
    const list = await client.listAll(prefix);
    expect(list.map((o) => o.key)).toEqual([`${prefix}a b.json`]);
    await client.delete(`${prefix}a b.json`);
    expect(await client.head(`${prefix}a b.json`)).toBeNull();
  });

  it('refuses a write that would overwrite another version', async () => {
    const client = new S3Client(config());
    const key = `${prefix}cond.json`;
    const first = await client.put(key, new Uint8Array([1]), { ifNoneMatch: true });
    expect(first.ok).toBe(true);
    // Creating again fails: it exists.
    expect(await client.put(key, new Uint8Array([2]), { ifNoneMatch: true })).toEqual({
      ok: false,
      reason: 'precondition',
    });
    const second = await client.put(key, new Uint8Array([3]), { ifMatch: first.ok ? first.etag : '' });
    expect(second.ok).toBe(true);
    // The first version is no longer current.
    expect(await client.put(key, new Uint8Array([4]), { ifMatch: first.ok ? first.etag : '' })).toEqual({
      ok: false,
      reason: 'precondition',
    });
    expect((await client.get(key))!.body).toEqual(new Uint8Array([3]));
  });

  it('pages through long listings', async () => {
    const client = new S3Client(config());
    await Promise.all(
      Array.from({ length: 1005 }, (_, i) =>
        client.put(`${prefix}many/${String(i).padStart(4, '0')}`, new Uint8Array([i % 256])),
      ),
    );
    expect((await client.listAll(`${prefix}many/`)).length).toBe(1005);
  }, 60_000);

  it('rejects wrong keys with a clear reason', async () => {
    const wrongSecret = new S3Client({ ...config(), secretAccessKey: 'x'.repeat(40) });
    const e1 = await wrongSecret.list(prefix).catch((e: unknown) => e);
    expect(explainS3Error(e1).code).toBe('SignatureDoesNotMatch');
    const wrongId = new S3Client({ ...config(), accessKeyId: 'AKIANOTAREALKEY00000' });
    const e2 = await wrongId.list(prefix).catch((e: unknown) => e);
    expect(explainS3Error(e2).code).toBe('InvalidAccessKeyId');
    const noBucket = new S3Client({ ...config(), bucket: 'no-such-bucket-here' });
    const e3 = await noBucket.list(prefix).catch((e: unknown) => e);
    expect(explainS3Error(e3).code).toBe('NoSuchBucket');
    const offline = new S3Client({ ...config(), endpoint: 'http://127.0.0.1:9' });
    const e4 = await offline.list(prefix).catch((e: unknown) => e);
    expect(explainS3Error(e4).code).toBe('NetworkError');
  });

  it('checks a connection and finds an existing library', async () => {
    const built = buildConfig({
      provider: 'custom',
      endpoint: server!.endpoint,
      bucket: server!.bucket,
      accessKeyId: server!.accessKeyId,
      secretAccessKey: server!.secretAccessKey,
      prefix: `lib-${Date.now()}`,
    });
    expect(await checkConnection(built)).toEqual({ exists: false, createdAt: null, designs: 0, files: 0 });
    const client = new S3Client(built);
    await client.put(`${built.prefix}space.json`, new TextEncoder().encode('{"createdAt":5}'));
    await client.put(`${built.prefix}records/designs/d1.json`, new Uint8Array(2000));
    await client.put(`${built.prefix}records/designs/gone.json`, new Uint8Array(100));
    expect(await libraryInfo(client, built.prefix)).toEqual({
      exists: true,
      createdAt: 5,
      designs: 1,
      files: 0,
    });
  });
});
