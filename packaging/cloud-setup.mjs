#!/usr/bin/env node
/**
 * Where OpenCanvas keeps your work: this computer only, or this computer
 * and your own cloud storage (Cloudflare R2, Amazon S3 or another
 * S3-compatible service). Run by the installers and by `opencanvas cloud`.
 *
 *   node cloud-setup.mjs setup  --home DIR --port N   ask (or read the environment), check, save
 *   node cloud-setup.mjs status --home DIR --port N   show the current choice
 *   node cloud-setup.mjs off    --home DIR --port N   keep everything on this computer only
 *
 * The OpenCanvas server must be running: it checks the bucket and stores the
 * settings, so the keys are only ever handled by it and this script.
 *
 * Without a terminal (or to automate), set OPENCANVAS_STORAGE=local|r2|s3|custom
 * and OPENCANVAS_S3_ACCOUNT_ID, _REGION, _ENDPOINT, _BUCKET, _ACCESS_KEY_ID,
 * _SECRET_ACCESS_KEY (and optionally _PREFIX).
 */
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const args = process.argv.slice(2);
const command = args[0] ?? 'setup';
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const home = option('home') ?? process.env.OPENCANVAS_HOME;
const port = Number(option('port') ?? 4790);
const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (text) => (color ? `\x1b[${code}m${text}\x1b[0m` : text);
const green = paint(32);
const red = paint(31);
const bold = paint(1);
const dim = paint(2);

if (!home) {
  console.error('error: --home is required');
  process.exit(2);
}

// ── Talking to the local server ─────────────────────────────────────────────

let token = null;
async function withToken(fn) {
  token = randomBytes(32).toString('hex');
  const file = path.join(home, '.setup-token');
  await fs.writeFile(file, token, { mode: 0o600 });
  try {
    return await fn();
  } finally {
    await fs.rm(file, { force: true });
  }
}

async function api(method, body) {
  let res;
  try {
    res = await fetch(`http://127.0.0.1:${port}/api/cloud/setup`, {
      method,
      headers: { 'content-type': 'application/json', 'x-opencanvas-setup-token': token },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(`OpenCanvas is not running on port ${port}. Start it with: opencanvas start`);
  }
  if (res.status === 403)
    throw new Error('OpenCanvas refused the request (is it this computer’s OpenCanvas?)');
  return res.json();
}

// ── Questions ───────────────────────────────────────────────────────────────

const interactive = !process.env.OPENCANVAS_STORAGE;
let rl = null;
let lines = null;
let muted = false;

function openPrompt() {
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: !!process.stdin.isTTY,
  });
  // Hidden answers (the secret key) are not echoed.
  const write = rl._writeToOutput?.bind(rl);
  rl._writeToOutput = (text) => {
    if (!muted && write) write(text);
  };
  lines = rl[Symbol.asyncIterator]();
}

async function ask(question, { hidden = false, fallback = '' } = {}) {
  const shown = fallback && !hidden ? `${question} ${dim(`[${fallback}]`)} ` : `${question} `;
  process.stdout.write(shown);
  muted = hidden && !!process.stdin.isTTY;
  const { value, done } = await lines.next();
  if (muted) process.stdout.write('\n');
  muted = false;
  if (done) throw new Error('No answer');
  return value.trim() || fallback;
}

async function choose(question, options, fallback = '1') {
  console.log(`\n${bold(question)}\n`);
  options.forEach((text, i) => console.log(`  ${i + 1}) ${text}`));
  console.log('');
  for (;;) {
    const answer = await ask(`Choose 1-${options.length}:`, { fallback });
    const n = Number(answer);
    if (Number.isInteger(n) && n >= 1 && n <= options.length) return n;
    console.log(red(`  Type a number from 1 to ${options.length}.`));
  }
}

const PROVIDERS = {
  r2: {
    name: 'Cloudflare R2',
    help: [
      'You need, from the Cloudflare dashboard → R2:',
      '  • your Account ID (on the R2 overview page)',
      '  • a bucket (Create bucket)',
      '  • an API token with "Object Read & Write" (Manage R2 API Tokens),',
      '    which gives an Access Key ID and a Secret Access Key',
    ],
    fields: ['accountId', 'bucket', 'accessKeyId', 'secretAccessKey'],
  },
  s3: {
    name: 'Amazon S3',
    help: [
      'You need, from the AWS console:',
      '  • a bucket and its region (e.g. eu-central-1)',
      '  • an access key of an IAM user allowed to read and write that bucket',
    ],
    fields: ['region', 'bucket', 'accessKeyId', 'secretAccessKey'],
  },
  custom: {
    name: 'Another S3-compatible service',
    help: ['You need the service address (endpoint), a bucket and an access key with read and write access.'],
    fields: ['endpoint', 'bucket', 'accessKeyId', 'secretAccessKey'],
  },
};

const LABELS = {
  accountId: 'Account ID',
  region: 'Region',
  endpoint: 'Endpoint URL (e.g. https://s3.example.com)',
  bucket: 'Bucket name',
  accessKeyId: 'Access Key ID',
  secretAccessKey: 'Secret Access Key (typing is hidden)',
};

async function askDetails(provider, previous = {}, only = null) {
  const details = { ...previous, provider };
  for (const field of PROVIDERS[provider].fields) {
    if (only && field !== only) continue;
    const hidden = field === 'secretAccessKey';
    const fallback = hidden ? '' : (previous[field] ?? (field === 'region' ? 'us-east-1' : ''));
    let value = '';
    while (!value) {
      value = await ask(`${LABELS[field]}:`, { hidden, fallback });
      if (!value && hidden && previous[field]) value = previous[field];
    }
    details[field] = value;
  }
  return details;
}

function fromEnvironment() {
  const e = process.env;
  const storage = (e.OPENCANVAS_STORAGE ?? '').toLowerCase();
  if (storage === 'local' || storage === '') return { mode: 'local' };
  if (!PROVIDERS[storage])
    throw new Error(`OPENCANVAS_STORAGE must be local, r2, s3 or custom (not "${storage}")`);
  return {
    mode: 'cloud',
    provider: storage,
    accountId: e.OPENCANVAS_S3_ACCOUNT_ID,
    region: e.OPENCANVAS_S3_REGION,
    endpoint: e.OPENCANVAS_S3_ENDPOINT,
    bucket: e.OPENCANVAS_S3_BUCKET ?? '',
    accessKeyId: e.OPENCANVAS_S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: e.OPENCANVAS_S3_SECRET_ACCESS_KEY ?? '',
    prefix: e.OPENCANVAS_S3_PREFIX,
  };
}

function describeLibrary(library, bucket) {
  if (library.exists) {
    const when = library.createdAt
      ? `, started ${new Date(library.createdAt).toISOString().slice(0, 10)}`
      : '';
    console.log(
      green(
        `✓ Found your OpenCanvas library from before in "${bucket}" (${library.designs} designs, ${library.files} files${when}).`,
      ),
    );
    console.log('  Everything comes back by itself when OpenCanvas opens.');
  } else {
    console.log(green(`✓ "${bucket}" has no OpenCanvas library yet: a new one is created there.`));
  }
}

async function saveLocal() {
  const result = await api('POST', { mode: 'local' });
  if (!result.ok) throw new Error(result.error?.message ?? 'Could not save the choice');
  console.log(green('✓ OpenCanvas keeps everything on this computer.'));
  console.log(dim('  To add cloud storage later, run: opencanvas cloud'));
}

/** Checks and saves; returns an error or null. */
async function connect(details) {
  process.stdout.write('\nChecking the connection… ');
  const result = await api('POST', { ...details, mode: 'cloud', save: true });
  if (result.ok) {
    console.log(green('connected.'));
    describeLibrary(result.library, details.bucket);
    console.log(green('✓ Your work is saved on this computer and synced to your cloud.'));
    console.log(dim('  Without internet it keeps working, and uploads when the connection is back.'));
    return null;
  }
  console.log(red('failed.'));
  return result.error ?? { message: 'Unknown error' };
}

async function setup() {
  if (!interactive) {
    const choice = fromEnvironment();
    if (choice.mode === 'local') return saveLocal();
    const error = await connect(choice);
    if (error) {
      console.log(red(`✗ ${error.message}`));
      console.log(
        '  Keeping everything on this computer for now. Fix the settings and run: opencanvas cloud',
      );
      await saveLocal();
      process.exitCode = 3;
    }
    return;
  }
  openPrompt();
  try {
    await askAndConnect();
  } catch (error) {
    // No terminal to answer in (the input closed): keep the safe default.
    if (error.message !== 'No answer') throw error;
    console.log('');
    await saveLocal();
  }
}

async function askAndConnect() {
  const where = await choose('Where should OpenCanvas keep your work?', [
    'On this computer only',
    `On this computer, and synced to your own cloud storage (Cloudflare R2 or Amazon S3)\n     ${dim('Works offline and syncs when online. Reinstalling or a new computer gets everything back.')}`,
  ]);
  if (where === 1) return saveLocal();

  const providerIndex = await choose('Which cloud storage?', [
    'Cloudflare R2',
    'Amazon S3',
    'Another S3-compatible service (MinIO, Backblaze B2, Wasabi…)',
  ]);
  const provider = ['r2', 's3', 'custom'][providerIndex - 1];
  console.log('');
  for (const line of PROVIDERS[provider].help) console.log(dim(line));
  console.log('');
  let details = await askDetails(provider);
  for (;;) {
    const error = await connect(details);
    if (!error) return;
    console.log(red(`✗ ${error.message}`));
    if (error.field && LABELS[error.field]) {
      // A typing mistake in one field: ask that one again (without suggesting the wrong value).
      const { [error.field]: _wrong, ...rest } = details;
      details = await askDetails(provider, rest, error.field);
      continue;
    }
    const next = await choose('What now?', [
      'Try again (for example after creating the bucket)',
      'Change the details',
      'Skip: keep everything on this computer for now',
    ]);
    if (next === 2) details = await askDetails(provider, details);
    if (next === 3) return saveLocal();
  }
}

async function status() {
  const settings = await api('GET');
  if (!settings.enabled) {
    console.log('Storage: this computer only. To add cloud storage: opencanvas cloud');
    return;
  }
  const name = PROVIDERS[settings.provider]?.name ?? 'S3';
  console.log(`Storage: this computer + ${name}, bucket "${settings.bucket}" (folder "${settings.prefix}")`);
  console.log(dim(`  ${settings.endpoint} · key ${settings.accessKeyId}`));
}

try {
  await withToken(async () => {
    if (command === 'setup') await setup();
    else if (command === 'status') await status();
    else if (command === 'off') await saveLocal();
    else throw new Error(`Unknown command: ${command}`);
  });
} catch (error) {
  console.error(red(`error: ${error.message}`));
  process.exitCode = 1;
} finally {
  rl?.close();
}
