import { Assets as PixiAssets, Rectangle, Texture } from 'pixi.js';
import { frameRects, type AnimationDef, type AssetManifest, type TileDef } from './manifest';
import { placeholderAnimation, placeholderTile } from './placeholders';

export const FACTORIO_ASSET_ROOT = 'assets/factorio/';

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
  private animations = new Map<string, Animation>();
  private tiles = new Map<string, TileSet>();
  private images = new Map<string, Texture>();

  get hasFactorioAssets(): boolean {
    return this.manifest !== null;
  }

  async init(root = FACTORIO_ASSET_ROOT): Promise<void> {
    this.manifest = await loadManifest(root + 'manifest.json');
    if (!this.manifest) return;
    const files = new Set<string>();
    for (const def of Object.values(this.manifest.animations)) {
      for (const f of def.files ?? (def.file ? [def.file] : [])) files.add(f);
    }
    for (const def of Object.values(this.manifest.tiles ?? {})) files.add(def.file);
    await Promise.all(
      [...files].map(async (file) => {
        try {
          const tex = await PixiAssets.load<Texture>(root + file);
          tex.source.scaleMode = 'linear';
          this.images.set(file, tex);
        } catch (err) {
          console.warn(`[assets] could not load ${file}, using placeholder`, err);
        }
      }),
    );
  }

  animation(key: string): Animation {
    let anim = this.animations.get(key);
    if (!anim) {
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

  private buildAnimation(key: string): Animation {
    const def = this.manifest?.animations[key];
    if (def) {
      const rects = frameRects(def);
      if (rects.every((r) => this.images.has(r.file))) {
        const frames = rects.map((r) => sub(this.images.get(r.file)!, r.x, r.y, r.width, r.height));
        return { key, def, frames, placeholder: false };
      }
    }
    const ph = placeholderAnimation(key);
    if (!ph) throw new Error(`Unknown animation "${key}" (not in manifest, no placeholder)`);
    const base = Texture.from(ph.canvas);
    const frames = frameRects(ph.def).map((r) => sub(base, r.x, r.y, r.width, r.height));
    return { key, def: ph.def, frames, placeholder: true };
  }

  private buildTile(name: string): TileSet {
    const def = this.manifest?.tiles?.[name];
    if (def && this.images.has(def.file)) {
      const img = this.images.get(def.file)!;
      return { name, def, variants: tileVariants(img, def), placeholder: false };
    }
    const ph = placeholderTile(name);
    if (!ph) throw new Error(`Unknown tile "${name}" (not in manifest, no placeholder)`);
    const base = Texture.from(ph.canvas);
    base.source.scaleMode = 'nearest';
    return { name, def: ph.def, variants: tileVariants(base, ph.def), placeholder: true };
  }
}

function sub(tex: Texture, x: number, y: number, w: number, h: number): Texture {
  return new Texture({ source: tex.source, frame: new Rectangle(tex.frame.x + x, tex.frame.y + y, w, h) });
}

function tileVariants(img: Texture, def: TileDef): Texture[] {
  const n = def.variants ?? 1;
  const out: Texture[] = [];
  for (let i = 0; i < n; i++) out.push(sub(img, (def.x ?? 0) + i * def.size, def.y ?? 0, def.size, def.size));
  return out;
}

async function loadManifest(url: string): Promise<AssetManifest | null> {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    // Vite's dev server answers unknown paths with index.html, so check the type.
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null;
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
