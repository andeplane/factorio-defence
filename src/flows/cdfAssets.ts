import type { AssetSource } from '../engine/Assets';

/**
 * The Factorio sprites live in CDF as CogniteFile nodes in their own data
 * modeling space (CDF_SPRITE_SPACE), one per file under public/assets/factorio/,
 * with externalId = CDF_ASSET_PREFIX + relative path (e.g.
 * "factorio-defence/sprites/manifest.json") and directory CDF_SPRITE_DIRECTORY.
 * tools/upload-assets-cdf.ts writes them; the Flows build reads them through
 * this source. With `space: null` the same externalIds are read as classic
 * (non data modeling) files instead, which `upload:cdf -- --classic` writes.
 */
export const CDF_ASSET_PREFIX = 'factorio-defence/sprites/';
export const CDF_SPRITE_SPACE = 'factorio-defence';
export const CDF_SPRITE_DIRECTORY = '/factorio-defence/sprites';

/** CDF caps files/downloadlink at 100 items per request. */
const BATCH = 100;

export interface CdfConnection {
  /** e.g. "https://api.cognitedata.com" */
  baseUrl: string;
  project: string;
  getToken(): Promise<string>;
  /** Data modeling space holding the sprite files, or null for classic files. Default CDF_SPRITE_SPACE. */
  space?: string | null;
}

type FileId = { instanceId: { space: string; externalId: string } } | { externalId: string };

/** Resolves sprite paths to signed CDF download URLs. Files missing from CDF resolve to "". */
export function cdfAssetSource(cdf: CdfConnection): AssetSource {
  const api = `${cdf.baseUrl.replace(/\/+$/, '')}/api/v1/projects/${encodeURIComponent(cdf.project)}`;
  const space = cdf.space === undefined ? CDF_SPRITE_SPACE : cdf.space;
  const fileId = (externalId: string): FileId => (space ? { instanceId: { space, externalId } } : { externalId });
  const keyOf = (item: { externalId?: string; instanceId?: { externalId: string } }) =>
    item.instanceId?.externalId ?? item.externalId ?? '';

  async function downloadLinks(externalIds: string[]): Promise<Map<string, string>> {
    const links = new Map<string, string>();
    let ids = externalIds;
    // A missing file fails the whole request and names the culprits; drop them and ask again.
    for (let attempt = 0; attempt < 2 && ids.length > 0; attempt++) {
      const res = await fetch(`${api}/files/downloadlink`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await cdf.getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: ids.map(fileId) }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        for (const item of body.items ?? []) links.set(keyOf(item), item.downloadUrl);
        return links;
      }
      const missing = new Set<string>((body.error?.missing ?? []).map(keyOf));
      if (res.status !== 400 || missing.size === 0) {
        throw new Error(`CDF files/downloadlink failed: ${res.status} ${body.error?.message ?? ''}`);
      }
      console.warn(`[assets] ${missing.size} sprite files are not in CDF`, [...missing]);
      ids = ids.filter((id) => !missing.has(id));
    }
    return links;
  }

  return {
    async urls(files) {
      const ids = files.map((f) => CDF_ASSET_PREFIX + f);
      const batches: string[][] = [];
      for (let i = 0; i < ids.length; i += BATCH) batches.push(ids.slice(i, i + BATCH));
      const links = new Map<string, string>();
      for (const part of await Promise.all(batches.map(downloadLinks))) for (const [k, v] of part) links.set(k, v);
      return ids.map((id) => links.get(id) ?? '');
    },
  };
}
