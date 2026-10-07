/**
 * Who may use the local server's cloud API (server only).
 *
 * The server listens on 127.0.0.1, but any web page the person visits could
 * still send requests to it. So a request is accepted only when:
 * - its Host is this computer (blocks DNS-rebinding attacks);
 * - it comes from OpenCanvas itself (same-origin Origin / Sec-Fetch-Site);
 * - it carries the X-OpenCanvas-Sync header, which a cross-site page cannot
 *   send without a CORS preflight that this server never allows.
 * The setup endpoint additionally needs the one-time token the `opencanvas`
 * command writes into the install folder.
 */
import { timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { cloudHome, SETUP_TOKEN_FILE } from './config';

export const SYNC_HEADER = 'x-opencanvas-sync';
export const SETUP_HEADER = 'x-opencanvas-setup-token';

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/;

export function isLocalRequest(headers: Headers): boolean {
  const host = headers.get('host') ?? '';
  if (!LOCAL_HOST.test(host)) return false;
  const origin = headers.get('origin');
  if (origin && origin !== `http://${host}`) return false;
  const site = headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return false;
  return true;
}

/** The browser API: this computer, this app, with the custom header. */
export function isSyncRequest(headers: Headers): boolean {
  return isLocalRequest(headers) && headers.get(SYNC_HEADER) === '1';
}

/** The setup API: this computer and the token from the install folder. */
export async function isSetupRequest(headers: Headers): Promise<boolean> {
  if (!isLocalRequest(headers) || headers.get('origin')) return false;
  const home = cloudHome();
  const given = headers.get(SETUP_HEADER) ?? '';
  if (!home || given.length < 32) return false;
  try {
    const expected = (await fs.readFile(path.join(home, SETUP_TOKEN_FILE), 'utf8')).trim();
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function forbidden(): Response {
  return Response.json({ error: 'Forbidden' }, { status: 403 });
}
