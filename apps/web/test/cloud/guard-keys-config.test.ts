import { describe, expect, it } from 'vitest';
import { buildConfig, normalizePrefix, SetupError } from '@/lib/cloud/config';
import { isLocalRequest, isSyncRequest } from '@/lib/cloud/guard';
import {
  decodeRecordKey,
  encodeRecordKey,
  isAllowedPath,
  parseRecordPath,
  recordPath,
} from '@/lib/cloud/keys';

const headers = (h: Record<string, string>) => new Headers(h);

describe('who may use the cloud API', () => {
  it('accepts OpenCanvas itself on this computer', () => {
    expect(isSyncRequest(headers({ host: 'localhost:4790', 'x-opencanvas-sync': '1' }))).toBe(true);
    expect(
      isSyncRequest(
        headers({
          host: '127.0.0.1:4790',
          origin: 'http://127.0.0.1:4790',
          'sec-fetch-site': 'same-origin',
          'x-opencanvas-sync': '1',
        }),
      ),
    ).toBe(true);
  });

  it('refuses other websites, forged hosts and requests without the header', () => {
    expect(isSyncRequest(headers({ host: 'localhost:4790' }))).toBe(false);
    expect(isSyncRequest(headers({ host: 'evil.example', 'x-opencanvas-sync': '1' }))).toBe(false);
    expect(
      isSyncRequest(
        headers({ host: 'localhost:4790', origin: 'https://evil.example', 'x-opencanvas-sync': '1' }),
      ),
    ).toBe(false);
    expect(
      isSyncRequest(
        headers({ host: 'localhost:4790', 'sec-fetch-site': 'cross-site', 'x-opencanvas-sync': '1' }),
      ),
    ).toBe(false);
    expect(isLocalRequest(headers({ host: 'localhost.evil.example:4790' }))).toBe(false);
  });
});

describe('library layout', () => {
  it('names records safely and reads them back', () => {
    for (const key of ['design_abc', 'sha256-ab12', 'org.opencanvas.x', 'a/b c', 'عربي', '~tilde']) {
      const path = recordPath('designs', key);
      expect(isAllowedPath(path)).toBe(true);
      expect(parseRecordPath(path)).toEqual({ store: 'designs', key });
      expect(decodeRecordKey(encodeRecordKey(key))).toBe(key);
    }
    expect(recordPath('assets', 'plain-key')).toBe('records/assets/plain-key.json');
  });

  it('only allows record and file paths', () => {
    expect(isAllowedPath(`blobs/${'a'.repeat(64)}`)).toBe(true);
    expect(isAllowedPath('blobs/../../secret')).toBe(false);
    expect(isAllowedPath('records/thumbnails/x.json')).toBe(false);
    expect(isAllowedPath('space.json')).toBe(false);
    expect(isAllowedPath('../cloud.json')).toBe(false);
  });
});

describe('setup details', () => {
  const keys = { accessKeyId: 'AKIAEXAMPLE123', secretAccessKey: 'secretsecretsecret123' };

  it('builds Cloudflare R2, Amazon S3 and custom endpoints', () => {
    expect(
      buildConfig({ provider: 'r2', accountId: 'A'.repeat(32).toLowerCase(), bucket: 'my-designs', ...keys }),
    ).toMatchObject({
      endpoint: `https://${'a'.repeat(32)}.r2.cloudflarestorage.com`,
      region: 'auto',
      pathStyle: true,
      prefix: 'opencanvas/',
    });
    expect(
      buildConfig({ provider: 's3', region: 'eu-central-1', bucket: 'my-designs', ...keys }),
    ).toMatchObject({
      endpoint: 'https://s3.eu-central-1.amazonaws.com',
      region: 'eu-central-1',
      pathStyle: false,
    });
    expect(
      buildConfig({ provider: 's3', region: 'us-east-1', bucket: 'my.designs', ...keys }).pathStyle,
    ).toBe(true);
    expect(
      buildConfig({ provider: 'custom', endpoint: 'http://localhost:9000/x', bucket: 'b-1', ...keys }),
    ).toMatchObject({ endpoint: 'http://localhost:9000' });
  });

  it('says which field is wrong', () => {
    const field = (fn: () => unknown) => {
      try {
        fn();
        return null;
      } catch (e) {
        return e instanceof SetupError ? e.field : 'other';
      }
    };
    expect(
      field(() => buildConfig({ provider: 'r2', accountId: 'nope', bucket: 'ok-bucket', ...keys })),
    ).toBe('accountId');
    expect(field(() => buildConfig({ provider: 's3', region: 'europe', bucket: 'ok-bucket', ...keys }))).toBe(
      'region',
    );
    expect(field(() => buildConfig({ provider: 's3', bucket: 'Bad_Bucket', ...keys }))).toBe('bucket');
    expect(
      field(() =>
        buildConfig({ provider: 'custom', endpoint: 'http://s3.example.com', bucket: 'ok-bucket', ...keys }),
      ),
    ).toBe('endpoint');
    expect(
      field(() =>
        buildConfig({ provider: 's3', bucket: 'ok-bucket', accessKeyId: 'x', secretAccessKey: 'y' }),
      ),
    ).toBe('accessKeyId');
  });

  it('normalizes the folder inside the bucket', () => {
    expect(normalizePrefix(undefined)).toBe('opencanvas/');
    expect(normalizePrefix('/my/designs/')).toBe('my/designs/');
    expect(normalizePrefix('a b')).toBe('a-b/');
  });
});
