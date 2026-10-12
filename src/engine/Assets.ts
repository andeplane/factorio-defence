import { Assets as PixiAssets, Rectangle, Texture } from 'pixi.js';
import { frameRects, type AnimationDef, type AssetManifest, type TileDef } from './manifest';
import { placeholderAnimation, placeholderTile } from './placeholders';

export const FACTORIO_ASSET_ROOT = 'assets/factorio/';

/**
 * Where the manifest and sprite sheets come from. `urls` maps paths relative
 * to the asset root (e.g. "manifest.json", "entity/belt/hr-belt.png") to
 * fetchable URLs, in order. The default serves them from the app itself; the
 * Flows build swaps in one that reads CDF Files (see src/flows).
 */
export interface AssetSource {
  urls(files: string[]): Promise<string[]>;
}

export function localAssetSource(root = FACTORIO_ASSET_ROOT): AssetSource {
  return { urls: async (files) => files.map((f) => root + f) };
}

let defaultSource: AssetSource = localAssetSource();

/** Sets the source `AssetStore.init()` uses when given none. Call before the engine starts. */
export function setAssetSource(source: AssetSource): void {
  defaultSource = source;
}

export interface Animation {
  key: string;
  def: AnimationDef;
  frames: Texture[];
  placeholder: boolean;
}

export interface TileSet {
  name: string;
  def: TileDef;
  variants: Texture[];
  placeholder: boolean;
}

/**
 * Resolves animation keys and tile names to textures. Real Factorio graphics
 * come from `public/assets/factorio/manifest.json` when it exists; anything
 * missing from it falls back to a generated placeholder.
 */
export class AssetStore {
  private manifest: AssetManifest | null = null;
  private animations = new Map<string, Animation | null>();
  private tiles = new Map<string, TileSet>();
  private images = new Map<string, Texture>();

  get hasFactorioAssets(): boolean {
    return this.manifest !== null;
  }

  private source = defaultSource;
  private failed = new Set<string>();

  /** Reads the manifest only; images are fetched by `preload`. */
  async init(source: AssetSource | string = defaultSource): Promise<void> {
    this.source = typeof source === 'string' ? localAssetSource(source) : source;
    let url: string | undefined;
    try {
      [url] = await this.source.urls(['manifest.json']);
    } catch (err) {
      console.warn('[assets] could not locate manifest.json, using placeholders', err);
    }
    this.manifest = url ? await loadManifest(url) : null;
  }

  /**
   * Fetches the images behind the given animation keys and tile names. The
   * manifest can describe thousands of sprites, so only what the game uses is
   * loaded. Keys absent from the manifest are skipped (they use placeholders).
   */
  async preload(
    animationKeys: Iterable<string>,
    tileNames: Iterable<string> = [],
    onProgress?: (done: number, total: number) => void,
  ): Promise<void> {
    if (!this.manifest) return;
    const files = new Set<string>();
    const keys = [...animationKeys];
    const tiles = [...tileNames];
    for (const key of keys) {
      const def = this.manifest.animations[key];
      if (def) for (const f of def.files ?? (def.file ? [def.file] : [])) files.add(f);
    }
    for (const name of tiles) {
      const def = this.manifest.tiles?.[name];
      if (def) files.add(def.file);
    }
    const todo = [...files].filter((f) => !this.images.has(f) && !this.failed.has(f));
    let done = 0;
    onProgress?.(0, todo.length);
    let urls: string[];
    try {
      urls = await this.source.urls(todo);
    } catch (err) {
      console.warn('[assets] could not locate sprite sheets, using placeholders', err);
      urls = [];
    }
    await Promise.all(
      todo.map(async (file, i) => {
          try {
            if (!urls[i]) throw new Error('no URL');
            // Remote URLs may have no file extension, so name the parser.
            const tex = await PixiAssets.load<Texture>({ src: urls[i], parser: 'texture' });
            tex.source.scaleMode = 'linear';
            this.images.set(file, tex);
          } catch (err) {
            this.failed.add(file);
            console.warn(`[assets] could not load ${file}, using placeholder`, err);
          }
          onProgress?.(++done, todo.length);
        }),
    );
    // Drop placeholders built before these images arrived.
    for (const key of keys) if (this.animations.get(key)?.placeholder) this.animations.delete(key);
    for (const name of tiles) if (this.tiles.get(name)?.placeholder) this.tiles.delete(name);
    this.transitions.clear();
  }

  /**
   * The animation for `key`: from the manifest, else its placeholder, else
   * null (the layer is simply not drawn, e.g. a tint mask without art).
   */
  animation(key: string): Animation | null {
    let anim = this.animations.get(key);
    if (anim === undefined) {
      anim = this.buildAnimation(key);
      this.animations.set(key, anim);
    }
    return anim;
  }

  tile(name: string): TileSet {
    let set = this.tiles.get(name);
    if (!set) {
      set = this.buildTile(name);
      this.tiles.set(name, set);
    }
    return set;
  }

  private buildAnimation(key: string): Animation | null {
    const def = this.manifest?.animations[key];
    if (def) {
      const rects = frameRects(def);
      if (rects.every((r) => this.images.has(r.file))) {
        const frames = rects.map((r) => sub(this.images.get(r.file)!, r.x, r.y, r.width, r.height));
        return { key, def, frames, placeholder: false };
      }
      if (rects.some((r) => !this.images.has(r.file) && !this.failed.has(r.file))) {
        console.warn(`[assets] "${key}" is in the manifest but was not preloaded, using placeholder`);
      }
    }
    const ph = placeholderAnimation(key);
    if (!ph) {
      if (this.manifest) this.reportMissing(key);
      return null;
    }
    const base = Texture.from(ph.canvas);
    const frames = frameRects(ph.def).map((r) => sub(base, r.x, r.y, r.width, r.height));
    return { key, def: ph.def, frames, placeholder: true };
  }

  private missing: string[] = [];

  /** Logs layers missing from the manifest once, batched, rather than one line per direction. */
  private reportMissing(key: string): void {
    if (this.missing.push(key) > 1) return;
    setTimeout(() => {
      console.warn(`[assets] ${this.missing.length} layers are not in the manifest and have no placeholder:`, this.missing);
      this.missing = [];
    });
  }

  private transitions = new Map<string, TileSet | null>();

  /**
   * Transition piece (e.g. "side/north") of tile `base`, or null when there
   * is none. Placeholder pieces are only generated for placeholder tiles, so
   * real Factorio ground never gets placeholder borders.
   */
  transition(base: string, piece: string): TileSet | null {
    const key = `${base}/${piece}`;
    let set = this.transitions.get(key);
    if (set === undefined) {
      set = null;
      const def = this.manifest?.tiles?.[key];
      if (def && this.images.has(def.file)) {
        set = { name: key, def, variants: tileVariants(this.images.get(def.file)!, def), placeholder: false };
      } else if (this.tile(base).placeholder) {
        const ph = placeholderTile(key);
        if (ph) set = { name: key, def: ph.def, variants: tileVariants(Texture.from(ph.canvas), ph.def, 'nearest'), placeholder: true };
      }
      this.transitions.set(key, set);
    }
    return set;
  }

  /** Factorio tile layer: higher layers draw their borders over lower ones. */
  tileLayer(name: string): number {
    return this.tile(name).def.layer ?? 0;
  }

  private buildTile(name: string): TileSet {
    const def = this.manifest?.tiles?.[name];
    if (def && this.images.has(def.file)) {
      const img = this.images.get(def.file)!;
      return { name, def, variants: tileVariants(img, def), placeholder: false };
    }
    const ph = placeholderTile(name);
    if (!ph) throw new Error(`Unknown tile "${name}" (not in manifest, no placeholder)`);
    return { name, def: ph.def, variants: tileVariants(Texture.from(ph.canvas), ph.def, 'nearest'), placeholder: true };
  }
}

function sub(tex: Texture, x: number, y: number, w: number, h: number): Texture {
  return new Texture({ source: tex.source, frame: new Rectangle(tex.frame.x + x, tex.frame.y + y, w, h) });
}

/**
 * Splits a tile's variants into textures. Each variant is copied into its own
 * cell of a new atlas with a 1 px border repeating its edge pixels, so linear
 * filtering at tile edges never samples the neighbouring variant (that bleed
 * shows up as seams between tiles).
 */
function tileVariants(img: Texture, def: TileDef, scaleMode: 'linear' | 'nearest' = 'linear'): Texture[] {
  const n = def.variants ?? 1;
  const size = def.size;
  const cell = size + 2;
  const src = img.source.resource as CanvasImageSource;
  const x0 = img.frame.x + (def.x ?? 0);
  const y0 = img.frame.y + (def.y ?? 0);
  const canvas = document.createElement('canvas');
  canvas.width = cell * n;
  canvas.height = cell;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  for (let i = 0; i < n; i++) {
    const sx = x0 + i * size;
    const dx = i * cell + 1;
    ctx.drawImage(src, sx, y0, size, size, dx, 1, size, size);
    // Extrude the edges into the border.
    ctx.drawImage(canvas, dx, 1, size, 1, dx, 0, size, 1);
    ctx.drawImage(canvas, dx, size, size, 1, dx, size + 1, size, 1);
    ctx.drawImage(canvas, dx, 0, 1, cell, dx - 1, 0, 1, cell);
    ctx.drawImage(canvas, dx + size - 1, 0, 1, cell, dx + size, 0, 1, cell);
  }
  const atlas = Texture.from(canvas);
  atlas.source.scaleMode = scaleMode;
  return Array.from({ length: n }, (_, i) => sub(atlas, i * cell + 1, 1, size, size));
}

async function loadManifest(url: string): Promise<AssetManifest | null> {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    // Vite's dev server answers unknown paths with index.html, so check the type.
    // Signed CDF download URLs may not say JSON, so only reject HTML.
    if (!res.ok || (res.headers.get('content-type') ?? '').includes('html')) return null;
    const manifest = (await res.json()) as AssetManifest;
    if (!manifest || typeof manifest.animations !== 'object') {
      console.warn('[assets] manifest.json has no "animations" object, ignoring it');
      return null;
    }
    console.info(`[assets] loaded Factorio manifest with ${Object.keys(manifest.animations).length} animations`);
    return manifest;
  } catch {
    return null;
  }
}
