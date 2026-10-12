/**
 * Uploads the extracted Factorio sprites (public/assets/factorio/) to CDF Files, where the Flows
 * app reads them. Each file becomes one CDF file with externalId CDF_ASSET_PREFIX + its relative
 * path, in directory /factorio-defence/sprites. Files whose sha256 already matches are skipped,
 * and manifest.json goes last so the app never sees a manifest pointing at missing sheets.
 *
 * Run with `npm run upload:cdf` (on the machine that has the sprites). Options:
 *   --project <name>      CDF project        (default: app.json deployments[0].project)
 *   --base-url <url>      CDF cluster URL    (default: app.json deployments[0].baseUrl)
 *   --org <org>           Cognite org, used as the login hint (default: app.json deployments[0].org)
 *   --data-set <extId>    put the files in this data set (optional)
 *   --dry-run             list what would be uploaded, without logging in
 * Auth: a browser login to your Cognite org (auth.cognite.com), or a token in CDF_TOKEN.
 * Nothing is stored on disk.
 */
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, relative, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { CDF_ASSET_PREFIX } from '../src/flows/cdfAssets';

const SPRITES = 'public/assets/factorio';
const DIRECTORY = '/factorio-defence/sprites';
const PARALLEL = 8;

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const dryRun = args.includes('--dry-run');
const deployment = JSON.parse(readFileSync('app.json', 'utf8')).deployments?.[0] ?? {};
const project: string = opt('project') ?? deployment.project;
const baseUrl: string = (opt('base-url') ?? deployment.baseUrl ?? '').replace(/\/+$/, '');
const org: string | undefined = opt('org') ?? deployment.org;
const dataSet = opt('data-set');
if (!project || !baseUrl) throw new Error('No CDF project/base URL: set them in app.json or pass --project and --base-url');
const api = `${baseUrl}/api/v1/projects/${encodeURIComponent(project)}`;

interface LocalFile {
  path: string;
  externalId: string;
  sha256: string;
  size: number;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (name.startsWith('.')) return [];
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

function mimeType(path: string): string {
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
}

// --- Login -------------------------------------------------------------------------------------

/** Cognite's public login client (the one @cognite/cli uses); override with CDF_CLIENT_ID. */
const CLIENT_ID = process.env.CDF_CLIENT_ID ?? '0404baaa-0a90-43a2-aba7-a110b53fb41c';
const IDP = (process.env.COGNITE_IDP_BASE_URL ?? 'https://auth.cognite.com').replace(/\/+$/, '');
const CALLBACK_PORT = Number(process.env.CDF_LOGIN_PORT ?? 3000);

/** Authorization code + PKCE login in the browser, with a one-shot callback server on localhost. */
async function browserLogin(): Promise<string> {
  const discovery = await fetch(`${IDP}/.well-known/openid-configuration`)
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  const authorizeUrl: string = discovery.authorization_endpoint ?? `${IDP}/oauth2/authorize`;
  const tokenUrl: string = discovery.token_endpoint ?? `${IDP}/oauth2/token`;
  const redirectUri = `http://localhost:${CALLBACK_PORT}/`;
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const state = randomBytes(16).toString('base64url');
  const url = new URL(authorizeUrl);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    scope: 'openid profile email',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    ...(org ? { organization_hint: org } : {}),
  }).toString();

  const code = await new Promise<string>((resolveCode, reject) => {
    const server = createServer((req, res) => {
      const params = new URL(req.url ?? '/', redirectUri).searchParams;
      if (!params.has('code') && !params.has('error')) {
        res.writeHead(404).end();
        return;
      }
      const ok = params.get('state') === state && params.has('code');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(ok ? '<p>Logged in. You can close this tab.</p>' : '<p>Login failed. See the terminal.</p>');
      server.close();
      if (ok) resolveCode(params.get('code')!);
      else reject(new Error(`Login failed: ${params.get('error_description') ?? params.get('error') ?? 'state mismatch'}`));
    });
    server.on('error', reject);
    server.listen(CALLBACK_PORT, '127.0.0.1', () => {
      console.log(`Opening the browser to log in to ${org ?? 'Cognite'}. If it does not open, visit:\n  ${url}`);
      const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
      spawn(opener, [url.toString()], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
    });
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: CLIENT_ID,
      code_verifier: verifier,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) throw new Error(`Token exchange failed: ${res.status} ${JSON.stringify(body)}`);
  return body.access_token;
}

// --- CDF ---------------------------------------------------------------------------------------

let token = '';

async function cdf<T>(path: string, body: unknown): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${api}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return (await res.json()) as T;
    const text = await res.text();
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    throw new Error(`CDF ${path} failed: ${res.status} ${text}`);
  }
}

interface CdfFile {
  externalId?: string;
  uploaded: boolean;
  metadata?: Record<string, string>;
}

async function existingFiles(): Promise<Map<string, CdfFile>> {
  const files = new Map<string, CdfFile>();
  let cursor: string | undefined;
  do {
    const page = await cdf<{ items: CdfFile[]; nextCursor?: string }>('/files/list', {
      filter: { externalIdPrefix: CDF_ASSET_PREFIX },
      limit: 1000,
      ...(cursor ? { cursor } : {}),
    });
    for (const f of page.items) if (f.externalId) files.set(f.externalId, f);
    cursor = page.nextCursor;
  } while (cursor);
  return files;
}

async function dataSetId(externalId: string): Promise<number> {
  const { items } = await cdf<{ items: { id: number }[] }>('/datasets/byids', { items: [{ externalId }] });
  return items[0].id;
}

async function upload(file: LocalFile, dataSetIdValue?: number): Promise<void> {
  const name = file.path.split(sep).pop()!;
  const { uploadUrl } = await cdf<{ uploadUrl: string }>('/files?overwrite=true', {
    externalId: file.externalId,
    name,
    directory: DIRECTORY,
    mimeType: mimeType(file.path),
    source: 'factorio-defence',
    metadata: { sha256: file.sha256 },
    ...(dataSetIdValue !== undefined ? { dataSetId: dataSetIdValue } : {}),
  });
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType(file.path) },
      body: readFileSync(file.path),
    });
    if (res.ok) return;
    if (attempt >= 4) throw new Error(`Upload of ${file.externalId} failed: ${res.status} ${await res.text()}`);
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
}

// --- Main --------------------------------------------------------------------------------------

const local: LocalFile[] = walk(SPRITES).map((path) => {
  const bytes = readFileSync(path);
  const rel = relative(SPRITES, path).split(sep).join('/');
  return {
    path,
    externalId: CDF_ASSET_PREFIX + rel,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    size: bytes.length,
  };
});
if (!local.some((f) => f.externalId === CDF_ASSET_PREFIX + 'manifest.json')) {
  throw new Error(`No ${SPRITES}/manifest.json. Run npm run extract-sprites first.`);
}
const mb = (n: number) => `${(n / 1e6).toFixed(1)} MB`;
console.log(`${local.length} sprite files (${mb(local.reduce((s, f) => s + f.size, 0))}) -> ${project} on ${baseUrl}, ${DIRECTORY}`);
if (dryRun) process.exit(0);

token = process.env.CDF_TOKEN ?? (await browserLogin());
const existing = await existingFiles();
const todo = local.filter((f) => {
  const e = existing.get(f.externalId);
  return !e?.uploaded || e.metadata?.sha256 !== f.sha256;
});
// manifest.json last: the app only asks for sheets the manifest names.
todo.sort((a, b) => Number(a.externalId.endsWith('/manifest.json')) - Number(b.externalId.endsWith('/manifest.json')));
console.log(`${local.length - todo.length} already up to date, uploading ${todo.length} (${mb(todo.reduce((s, f) => s + f.size, 0))})`);

const dsId = dataSet ? await dataSetId(dataSet) : undefined;
const manifest = todo.length && todo[todo.length - 1].externalId.endsWith('/manifest.json') ? todo.pop() : undefined;
let next = 0;
let done = 0;
await Promise.all(
  Array.from({ length: PARALLEL }, async () => {
    while (next < todo.length) {
      const file = todo[next++];
      await upload(file, dsId);
      if (++done % 50 === 0 || done === todo.length) console.log(`  ${done}/${todo.length}`);
    }
  }),
);
if (manifest) await upload(manifest, dsId);
console.log(`Done. ${local.length} sprite files are in CDF under externalId prefix "${CDF_ASSET_PREFIX}".`);
