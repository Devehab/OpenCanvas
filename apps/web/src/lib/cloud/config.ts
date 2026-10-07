/**
 * Cloud storage settings of a local install (server only).
 *
 * The installer (or `opencanvas cloud`) writes `$OPENCANVAS_HOME/cloud.json`:
 * `{ "enabled": false }` for "this computer only", or the bucket and keys
 * for R2 / S3. The file is readable by its owner only; the keys never reach
 * the browser. Without OPENCANVAS_HOME (development, Docker, a hosted
 * server) cloud sync is off.
 */
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { S3Client, type S3Config, S3Error } from './s3';

export type CloudProvider = 'r2' | 's3' | 'custom';

export interface CloudConfig extends S3Config {
  version: 1;
  enabled: true;
  provider: CloudProvider;
  /** Folder inside the bucket, ending with "/". */
  prefix: string;
  /** Names this computer in the records it writes. */
  deviceId: string;
  createdAt: number;
}

export type CloudSettings = CloudConfig | { enabled: false };

export const CLOUD_FILE = 'cloud.json';
export const SETUP_TOKEN_FILE = '.setup-token';

export function cloudHome(): string | null {
  const home = process.env.OPENCANVAS_HOME;
  return home && path.isAbsolute(home) ? home : null;
}

let cache: { mtimeMs: number; settings: CloudSettings } | null = null;

/** The current settings (re-read when the file changes); disabled when absent or invalid. */
export async function readCloudSettings(): Promise<CloudSettings> {
  const home = cloudHome();
  if (!home) return { enabled: false };
  const file = path.join(home, CLOUD_FILE);
  try {
    const stat = await fs.stat(file);
    if (cache && cache.mtimeMs === stat.mtimeMs) return cache.settings;
    const parsed = JSON.parse(await fs.readFile(file, 'utf8')) as Partial<CloudConfig>;
    const settings: CloudSettings =
      parsed.enabled === true &&
      typeof parsed.endpoint === 'string' &&
      typeof parsed.bucket === 'string' &&
      typeof parsed.accessKeyId === 'string' &&
      typeof parsed.secretAccessKey === 'string'
        ? ({
            ...parsed,
            version: 1,
            enabled: true,
            provider: parsed.provider ?? 'custom',
            region: parsed.region || 'auto',
            pathStyle: parsed.pathStyle ?? true,
            prefix: normalizePrefix(parsed.prefix),
            deviceId: parsed.deviceId || 'device',
            createdAt: parsed.createdAt ?? 0,
          } as CloudConfig)
        : { enabled: false };
    cache = { mtimeMs: stat.mtimeMs, settings };
    return settings;
  } catch {
    return { enabled: false };
  }
}

export async function writeCloudSettings(settings: CloudSettings): Promise<void> {
  const home = cloudHome();
  if (!home) throw new Error('OPENCANVAS_HOME is not set');
  const file = path.join(home, CLOUD_FILE);
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(tmp, file);
  cache = null;
}

export function normalizePrefix(prefix: string | undefined): string {
  const clean = (prefix ?? 'opencanvas')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^A-Za-z0-9._\-/]/g, '-');
  return clean ? `${clean}/` : '';
}

export function clientFor(config: S3Config, timeoutMs?: number): S3Client {
  return new S3Client(config, { timeoutMs });
}

// ── Setup: build, check and save the settings the person typed ─────────────

export interface SetupInput {
  provider: CloudProvider;
  /** R2 account id (32 hex characters). */
  accountId?: string;
  /** Amazon S3 region, e.g. eu-west-1. */
  region?: string;
  /** Custom S3-compatible endpoint URL. */
  endpoint?: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix?: string;
}

export class SetupError extends Error {
  constructor(
    message: string,
    readonly field: string,
  ) {
    super(message);
  }
}

/** Validates what was typed and turns it into an S3 configuration. */
export function buildConfig(input: SetupInput): Omit<CloudConfig, 'deviceId' | 'createdAt'> {
  const bucket = (input.bucket ?? '').trim();
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) {
    throw new SetupError(
      'A bucket name has 3–63 lower-case letters, digits, dots or hyphens (e.g. my-designs).',
      'bucket',
    );
  }
  const accessKeyId = (input.accessKeyId ?? '').trim();
  const secretAccessKey = (input.secretAccessKey ?? '').trim();
  if (accessKeyId.length < 8 || /\s/.test(accessKeyId))
    throw new SetupError('The access key ID looks wrong.', 'accessKeyId');
  if (secretAccessKey.length < 16 || /\s/.test(secretAccessKey))
    throw new SetupError('The secret access key looks wrong.', 'secretAccessKey');

  const base = { version: 1 as const, enabled: true as const, bucket, accessKeyId, secretAccessKey };
  const prefix = normalizePrefix(input.prefix);
  if (input.provider === 'r2') {
    const accountId = (input.accountId ?? '').trim().toLowerCase();
    if (!/^[a-f0-9]{32}$/.test(accountId)) {
      throw new SetupError(
        'A Cloudflare account ID has 32 characters (0-9, a-f). Find it in the R2 overview page.',
        'accountId',
      );
    }
    return {
      ...base,
      provider: 'r2',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      region: 'auto',
      pathStyle: true,
      prefix,
    };
  }
  if (input.provider === 's3') {
    const region = (input.region ?? 'us-east-1').trim().toLowerCase();
    if (!/^[a-z]{2}(-[a-z]+)+-\d$/.test(region)) {
      throw new SetupError('An AWS region looks like us-east-1 or eu-central-1.', 'region');
    }
    return {
      ...base,
      provider: 's3',
      endpoint: `https://s3.${region}.amazonaws.com`,
      region,
      // Bucket names with dots break TLS on virtual-hosted URLs.
      pathStyle: bucket.includes('.'),
      prefix,
    };
  }
  let endpoint: URL;
  try {
    endpoint = new URL((input.endpoint ?? '').trim());
  } catch {
    throw new SetupError('The endpoint must be a URL such as https://s3.example.com.', 'endpoint');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname);
  if (endpoint.protocol !== 'https:' && !(local && endpoint.protocol === 'http:')) {
    throw new SetupError('The endpoint must use https:// (http:// only for this computer).', 'endpoint');
  }
  return {
    ...base,
    provider: 'custom',
    endpoint: endpoint.origin,
    region: (input.region ?? '').trim() || 'us-east-1',
    pathStyle: true,
    prefix,
  };
}

export interface LibraryInfo {
  /** A library from a previous install was found in the bucket. */
  exists: boolean;
  createdAt: number | null;
  designs: number;
  files: number;
}

/** Plain-language explanation of an S3 error code. */
export function explainS3Error(error: unknown): { code: string; message: string } {
  if (!(error instanceof S3Error)) return { code: 'Error', message: (error as Error).message };
  const reasons: Record<string, string> = {
    NetworkError: `${error.message}. Check the address and your internet connection.`,
    Timeout: `${error.message}. Check your internet connection.`,
    InvalidAccessKeyId: 'The access key ID is not known to the service.',
    SignatureDoesNotMatch: 'The secret access key does not match the access key ID.',
    AccessDenied: 'These keys are not allowed to use this bucket. Give them read and write access to it.',
    NoSuchBucket: 'There is no bucket with this name. Create it first, or check the name.',
    AuthorizationHeaderMalformed: 'The region or account does not match the bucket.',
    PermanentRedirect: 'The bucket is in another region. Use the region shown in the bucket settings.',
    InvalidBucketName: 'The bucket name is not valid.',
  };
  return { code: error.code, message: reasons[error.code] ?? error.message };
}

/**
 * Checks that the bucket can be written, read and listed with these keys,
 * and looks for a library left by a previous install.
 */
export async function checkConnection(config: CloudConfig | Omit<CloudConfig, 'deviceId' | 'createdAt'>) {
  const client = clientFor(config, 20_000);
  const probe = `${config.prefix}.check-${randomUUID()}`;
  const body = new TextEncoder().encode('opencanvas');
  const put = await client.put(probe, body, { contentType: 'text/plain' });
  if (!put.ok) throw new S3Error('The test file could not be written', 'WriteRefused', 412);
  const back = await client.get(probe);
  await client.delete(probe);
  if (!back || new TextDecoder().decode(back.body) !== 'opencanvas') {
    throw new S3Error('The test file could not be read back', 'ReadFailed', 0);
  }
  return libraryInfo(client, config.prefix);
}

export async function libraryInfo(client: S3Client, prefix: string): Promise<LibraryInfo> {
  const space = await client.get(`${prefix}space.json`);
  const records = await client.listAll(`${prefix}records/`);
  // Deleted items stay as small markers (under 300 bytes); real designs are
  // larger, compressed or not.
  const designs = records.filter((o) => o.key.startsWith(`${prefix}records/designs/`) && o.size > 300).length;
  const files = records.filter((o) => o.key.startsWith(`${prefix}records/assets/`) && o.size > 300).length;
  let createdAt: number | null = null;
  if (space) {
    try {
      createdAt =
        (JSON.parse(new TextDecoder().decode(space.body)) as { createdAt?: number }).createdAt ?? null;
    } catch {
      createdAt = null;
    }
  }
  return { exists: !!space || records.length > 0, createdAt, designs, files };
}

/** Marks the bucket folder as an OpenCanvas library (kept when it already is one). */
export async function ensureSpace(client: S3Client, prefix: string): Promise<void> {
  const body = new TextEncoder().encode(
    `${JSON.stringify({ format: 1, app: 'opencanvas', createdAt: Date.now() })}\n`,
  );
  await client.put(`${prefix}space.json`, body, { contentType: 'application/json', ifNoneMatch: true });
}

export function newDeviceId(): string {
  return randomUUID();
}
