import { describe, expect, it } from 'vitest';
import { normalizeEtag, S3Client, signV4, uriEncode } from '@/lib/cloud/s3';

describe('AWS Signature Version 4', () => {
  it('matches the GET Object example of the S3 documentation', async () => {
    const authorization = await signV4({
      method: 'GET',
      url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'),
      headers: {
        range: 'bytes=0-9',
        'x-amz-content-sha256': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        'x-amz-date': '20130524T000000Z',
      },
      payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1',
      amzDate: '20130524T000000Z',
    });
    expect(authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, ' +
        'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, ' +
        'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    );
  });

  it('matches the GET Bucket (list objects) example, with a query string', async () => {
    const authorization = await signV4({
      method: 'GET',
      url: new URL('https://examplebucket.s3.amazonaws.com/?max-keys=2&prefix=J'),
      headers: {
        'x-amz-content-sha256': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        'x-amz-date': '20130524T000000Z',
      },
      payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1',
      amzDate: '20130524T000000Z',
    });
    expect(authorization).toContain(
      'Signature=34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7',
    );
  });

  it('encodes like RFC 3986', () => {
    expect(uriEncode('a b/c~d*é', true)).toBe('a%20b/c~d%2A%C3%A9');
    expect(uriEncode('a/b')).toBe('a%2Fb');
  });

  it('normalizes ETags', () => {
    expect(normalizeEtag('"abc"')).toBe('abc');
    expect(normalizeEtag('W/"abc"')).toBe('abc');
    expect(normalizeEtag(null)).toBe('');
  });
});

describe('S3Client', () => {
  const config = {
    endpoint: 'https://acct.r2.cloudflarestorage.com',
    region: 'auto',
    bucket: 'my-bucket',
    accessKeyId: 'AKID',
    secretAccessKey: 'SECRET',
    pathStyle: true,
  };

  it('uses path-style or virtual-hosted URLs', async () => {
    const urls: string[] = [];
    const fake = (async (url: URL) => {
      urls.push(String(url));
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;
    await new S3Client(config, { fetch: fake }).get('a b/c.json');
    await new S3Client(
      { ...config, endpoint: 'https://s3.eu-west-1.amazonaws.com', pathStyle: false },
      { fetch: fake },
    ).get('x.json');
    expect(urls).toEqual([
      'https://acct.r2.cloudflarestorage.com/my-bucket/a%20b/c.json',
      'https://my-bucket.s3.eu-west-1.amazonaws.com/x.json',
    ]);
  });

  it('parses list pages and error codes', async () => {
    const xml = `<?xml version="1.0"?><ListBucketResult><IsTruncated>true</IsTruncated>
      <Contents><Key>p/a&amp;b.json</Key><LastModified>2026-01-01T00:00:00Z</LastModified><ETag>&quot;e1&quot;</ETag><Size>12</Size></Contents>
      <NextContinuationToken>tok</NextContinuationToken></ListBucketResult>`;
    const client = new S3Client(config, {
      fetch: (async () => new Response(xml, { status: 200 })) as unknown as typeof fetch,
    });
    expect(await client.list('p/')).toEqual({
      objects: [{ key: 'p/a&b.json', etag: 'e1', size: 12, lastModified: '2026-01-01T00:00:00Z' }],
      next: 'tok',
    });
    const denied = new S3Client(config, {
      fetch: (async () =>
        new Response('<Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>', {
          status: 403,
        })) as unknown as typeof fetch,
    });
    await expect(denied.list('p/')).rejects.toMatchObject({ code: 'AccessDenied', status: 403 });
  });

  it('reports a refused write and retries without conditions when they are not supported', async () => {
    const seen: (string | null)[] = [];
    let call = 0;
    const client = new S3Client(config, {
      fetch: (async (_url: URL, init: RequestInit) => {
        seen.push(new Headers(init.headers).get('if-match'));
        call++;
        if (call === 1) return new Response(null, { status: 412 });
        if (call === 2) return new Response(null, { status: 501 });
        return new Response(null, { status: 200, headers: { etag: '"new"' } });
      }) as unknown as typeof fetch,
    });
    expect(await client.put('k', new Uint8Array([1]), { ifMatch: 'old' })).toEqual({
      ok: false,
      reason: 'precondition',
    });
    expect(await client.put('k', new Uint8Array([1]), { ifMatch: 'old' })).toEqual({ ok: true, etag: 'new' });
    expect(seen).toEqual(['"old"', '"old"', null]);
  });

  it('turns network failures into a NetworkError', async () => {
    const client = new S3Client(config, {
      fetch: (async () => {
        throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
      }) as unknown as typeof fetch,
    });
    await expect(client.head('k')).rejects.toMatchObject({ code: 'NetworkError' });
  });
});
