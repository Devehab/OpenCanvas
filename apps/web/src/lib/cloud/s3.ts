/**
 * A small S3 client for the local OpenCanvas server: Cloudflare R2, Amazon S3
 * and other S3-compatible services. It signs requests with AWS Signature
 * Version 4 using Web Crypto, so it has no dependencies and runs in Node.
 *
 * Only what cloud sync needs: get, head, put (with If-Match / If-None-Match),
 * delete and list.
 */

export interface S3Config {
  /** e.g. https://<account>.r2.cloudflarestorage.com or https://s3.eu-west-1.amazonaws.com */
  endpoint: string;
  /** `auto` for R2. */
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Bucket in the path (R2, MinIO…) instead of the host name (Amazon S3). */
  pathStyle: boolean;
}

export interface S3Object {
  key: string;
  etag: string;
  size: number;
  lastModified: string;
}

/** An S3 error with the service's code (NoSuchBucket, AccessDenied…) or a network failure. */
export class S3Error extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'S3Error';
  }
}

const encoder = new TextEncoder();

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? encoder.encode(data) : data;
  return hex(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>));
}

async function hmac(key: Uint8Array | ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey(
    'raw',
    key as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', k, encoder.encode(data));
}

/** RFC 3986 encoding, as SigV4 requires (`/` kept in paths). */
export function uriEncode(value: string, keepSlash = false): string {
  return [...encoder.encode(value)]
    .map((b) => {
      const c = String.fromCharCode(b);
      if (/[A-Za-z0-9\-._~]/.test(c) || (keepSlash && c === '/')) return c;
      return `%${b.toString(16).toUpperCase().padStart(2, '0')}`;
    })
    .join('');
}

export interface SignInput {
  method: string;
  url: URL;
  /** Headers to sign besides host (names in any case). */
  headers: Record<string, string>;
  payloadHash: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  /** yyyymmddThhmmssZ */
  amzDate: string;
}

/** The Authorization header value for a request (AWS Signature Version 4, service s3). */
export async function signV4(input: SignInput): Promise<string> {
  const date = input.amzDate.slice(0, 8);
  const headers: Record<string, string> = { host: input.url.host };
  for (const [k, v] of Object.entries(input.headers))
    headers[k.toLowerCase()] = v.trim().replace(/\s+/g, ' ');
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${headers[n]}\n`).join('');
  const signedHeaders = names.join(';');
  const query = [...input.url.searchParams.entries()]
    .map(([k, v]) => [uriEncode(k), uriEncode(v)] as const)
    .sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : 1) : a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  // The path is already encoded once in the URL; SigV4 for S3 uses it as is.
  const canonicalRequest = [
    input.method,
    input.url.pathname || '/',
    query,
    canonicalHeaders,
    signedHeaders,
    input.payloadHash,
  ].join('\n');
  const scope = `${date}/${input.region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', input.amzDate, scope, await sha256Hex(canonicalRequest)].join(
    '\n',
  );
  const kDate = await hmac(encoder.encode(`AWS4${input.secretAccessKey}`), date);
  const kRegion = await hmac(kDate, input.region);
  const kService = await hmac(kRegion, 's3');
  const kSigning = await hmac(kService, 'aws4_request');
  const signature = hex(await hmac(kSigning, stringToSign));
  return `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

function amzDateNow(): string {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/** ETags without quotes or a weak prefix, so they compare as plain strings. */
export function normalizeEtag(etag: string | null | undefined): string {
  return (etag ?? '').replace(/^W\//, '').replace(/"/g, '');
}

function xmlDecode(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
}

function xmlTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? xmlDecode(m[1]!) : null;
}

export class S3Client {
  /** Whether the service accepts If-Match / If-None-Match on PUT (learned on first refusal). */
  private conditionalWrites = true;

  constructor(
    readonly config: S3Config,
    private readonly options: { timeoutMs?: number; fetch?: typeof fetch } = {},
  ) {}

  private objectUrl(key: string, query: Record<string, string> = {}): URL {
    const endpoint = new URL(this.config.endpoint);
    const path = key ? `/${uriEncode(key, true)}` : '/';
    const url = this.config.pathStyle
      ? new URL(`${endpoint.origin}/${uriEncode(this.config.bucket)}${key ? path : ''}`)
      : new URL(`${endpoint.protocol}//${this.config.bucket}.${endpoint.host}${path}`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    return url;
  }

  private async request(
    method: string,
    key: string,
    init: { query?: Record<string, string>; body?: Uint8Array; headers?: Record<string, string> } = {},
  ): Promise<Response> {
    const url = this.objectUrl(key, init.query);
    const body = init.body ?? new Uint8Array();
    const amzDate = amzDateNow();
    const payloadHash = await sha256Hex(body);
    const signed = { 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
    const authorization = await signV4({
      method,
      url,
      headers: signed,
      payloadHash,
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      region: this.config.region,
      amzDate,
    });
    const doFetch = this.options.fetch ?? fetch;
    try {
      return await doFetch(url, {
        method,
        headers: { ...init.headers, ...signed, authorization },
        body: method === 'PUT' ? (body as Uint8Array<ArrayBuffer>) : undefined,
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 30_000),
        redirect: 'manual',
      });
    } catch (error) {
      const cause = (error as { cause?: { code?: string } }).cause?.code;
      const timedOut = (error as Error).name === 'TimeoutError';
      throw new S3Error(
        timedOut
          ? `${url.host} did not answer in time`
          : `Could not reach ${url.host}${cause ? ` (${cause})` : ''}`,
        timedOut ? 'Timeout' : 'NetworkError',
        0,
      );
    }
  }

  private async fail(res: Response, what: string): Promise<never> {
    const text = await res.text().catch(() => '');
    const code = xmlTag(text, 'Code') ?? (res.status === 404 ? 'NotFound' : `HTTP${res.status}`);
    const message = xmlTag(text, 'Message') ?? `${what} failed (HTTP ${res.status})`;
    throw new S3Error(message, code, res.status);
  }

  /** The object, or null when it does not exist. */
  async get(key: string): Promise<{ body: Uint8Array; etag: string; contentType: string } | null> {
    const res = await this.request('GET', key);
    if (res.status === 404) {
      await res.body?.cancel();
      return null;
    }
    if (!res.ok) return this.fail(res, 'Download');
    return {
      body: new Uint8Array(await res.arrayBuffer()),
      etag: normalizeEtag(res.headers.get('etag')),
      contentType: res.headers.get('content-type') ?? 'application/octet-stream',
    };
  }

  async head(key: string): Promise<{ etag: string; size: number } | null> {
    const res = await this.request('HEAD', key);
    if (res.status === 404) return null;
    if (!res.ok) return this.fail(res, 'Check');
    return {
      etag: normalizeEtag(res.headers.get('etag')),
      size: Number(res.headers.get('content-length') ?? 0),
    };
  }

  /**
   * Writes an object. With `ifMatch` it only replaces that version, with
   * `ifNoneMatch` only creates; otherwise `{ ok: false }` (someone else wrote first).
   */
  async put(
    key: string,
    body: Uint8Array,
    options: { contentType?: string; contentEncoding?: string; ifMatch?: string; ifNoneMatch?: boolean } = {},
  ): Promise<{ ok: true; etag: string } | { ok: false; reason: 'precondition' }> {
    const headers: Record<string, string> = {
      'content-type': options.contentType ?? 'application/octet-stream',
    };
    if (options.contentEncoding) headers['content-encoding'] = options.contentEncoding;
    const conditional = this.conditionalWrites && (options.ifMatch || options.ifNoneMatch);
    if (conditional && options.ifMatch) headers['if-match'] = `"${normalizeEtag(options.ifMatch)}"`;
    if (conditional && options.ifNoneMatch) headers['if-none-match'] = '*';
    const res = await this.request('PUT', key, { body, headers });
    if (res.status === 412 || res.status === 409) {
      await res.body?.cancel();
      return { ok: false, reason: 'precondition' };
    }
    if (res.status === 501 && conditional) {
      // The service does not support conditional writes: write without them.
      await res.body?.cancel();
      this.conditionalWrites = false;
      return this.put(key, body, options);
    }
    if (!res.ok) return this.fail(res, 'Upload');
    await res.body?.cancel();
    const etag = normalizeEtag(res.headers.get('etag')) || (await this.head(key))?.etag || '';
    return { ok: true, etag };
  }

  async delete(key: string): Promise<void> {
    const res = await this.request('DELETE', key);
    if (!res.ok && res.status !== 404) return this.fail(res, 'Delete');
    await res.body?.cancel();
  }

  /** One page of objects under a prefix (up to 1000). */
  async list(
    prefix: string,
    continuationToken?: string,
  ): Promise<{ objects: S3Object[]; next: string | null }> {
    const query: Record<string, string> = { 'list-type': '2', prefix, 'max-keys': '1000' };
    if (continuationToken) query['continuation-token'] = continuationToken;
    const res = await this.request('GET', '', { query });
    if (!res.ok) return this.fail(res, 'List');
    const xml = await res.text();
    const objects: S3Object[] = [];
    for (const block of xml.match(/<Contents>[\s\S]*?<\/Contents>/g) ?? []) {
      objects.push({
        key: xmlTag(block, 'Key') ?? '',
        etag: normalizeEtag(xmlTag(block, 'ETag')),
        size: Number(xmlTag(block, 'Size') ?? 0),
        lastModified: xmlTag(block, 'LastModified') ?? '',
      });
    }
    const truncated = xmlTag(xml, 'IsTruncated') === 'true';
    return { objects, next: truncated ? xmlTag(xml, 'NextContinuationToken') : null };
  }

  /** Every object under a prefix. */
  async listAll(prefix: string): Promise<S3Object[]> {
    const all: S3Object[] = [];
    let token: string | null | undefined;
    do {
      const page = await this.list(prefix, token ?? undefined);
      all.push(...page.objects);
      token = page.next;
    } while (token);
    return all;
  }
}
