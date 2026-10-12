import { afterEach, describe, expect, it, vi } from 'vitest';
import { CDF_ASSET_PREFIX, cdfAssetSource } from './cdfAssets';

const cdf = { baseUrl: 'https://api.cognitedata.com/', project: 'lervik-industries', getToken: async () => 'tok' };

afterEach(() => vi.unstubAllGlobals());

function respond(status: number, body: unknown) {
  return { ok: status < 300, status, json: async () => body } as Response;
}

describe('cdfAssetSource', () => {
  it('maps files to download links in order, batching by 100', async () => {
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      const ids = JSON.parse(init.body as string).items.map((i: { externalId: string }) => i.externalId);
      return respond(200, { items: ids.reverse().map((externalId: string) => ({ externalId, downloadUrl: `u:${externalId}` })) });
    });
    vi.stubGlobal('fetch', fetch);
    const files = Array.from({ length: 150 }, (_, i) => `f${i}.png`);
    const urls = await cdfAssetSource(cdf).urls(files);
    expect(urls).toEqual(files.map((f) => `u:${CDF_ASSET_PREFIX}${f}`));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][0]).toBe('https://api.cognitedata.com/api/v1/projects/lervik-industries/files/downloadlink');
    expect((fetch.mock.calls[0][1].headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('drops files missing from CDF and resolves them to ""', async () => {
    const missing = CDF_ASSET_PREFIX + 'gone.png';
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const ids: string[] = JSON.parse(init.body as string).items.map((i: { externalId: string }) => i.externalId);
      if (ids.includes(missing)) return respond(400, { error: { code: 400, message: 'missing', missing: [{ externalId: missing }] } });
      return respond(200, { items: ids.map((externalId) => ({ externalId, downloadUrl: `u:${externalId}` })) });
    }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await cdfAssetSource(cdf).urls(['a.png', 'gone.png'])).toEqual([`u:${CDF_ASSET_PREFIX}a.png`, '']);
  });

  it('throws on other errors so the engine falls back to placeholders', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond(403, { error: { code: 403, message: 'Forbidden' } })));
    await expect(cdfAssetSource(cdf).urls(['a.png'])).rejects.toThrow(/403/);
  });
});
