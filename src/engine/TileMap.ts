import { Container, Sprite } from 'pixi.js';
import type { AssetStore } from './Assets';
import { TILE_PX, type Camera } from './Camera';

export const CHUNK_TILES = 32;

interface Chunk {
  cx: number;
  cy: number;
  tiles: Uint8Array; // index into TileMap.tileNames
  view: Container;
}

export type TileGenerator = (x: number, y: number) => number;

/**
 * Infinite ground layer, generated and rendered lazily in 32x32-tile chunks.
 * Chunks outside the camera are hidden; far-away chunks are destroyed and
 * regenerated deterministically when revisited.
 */
export class TileMap {
  readonly container = new Container();
  private chunks = new Map<string, Chunk>();

  constructor(
    private assets: AssetStore,
    readonly tileNames: string[],
    private generate: TileGenerator,
  ) {
    this.container.label = 'tiles';
  }

  tileAt(x: number, y: number): string {
    const cx = Math.floor(x / CHUNK_TILES);
    const cy = Math.floor(y / CHUNK_TILES);
    const chunk = this.chunks.get(key(cx, cy));
    const idx = chunk
      ? chunk.tiles[(y - cy * CHUNK_TILES) * CHUNK_TILES + (x - cx * CHUNK_TILES)]
      : this.generate(x, y);
    return this.tileNames[idx];
  }

  update(camera: Camera): void {
    const b = camera.bounds();
    const size = CHUNK_TILES * TILE_PX;
    const x0 = Math.floor(b.left / size);
    const x1 = Math.floor(b.right / size);
    const y0 = Math.floor(b.top / size);
    const y1 = Math.floor(b.bottom / size);

    for (const chunk of this.chunks.values()) {
      const visible = chunk.cx >= x0 && chunk.cx <= x1 && chunk.cy >= y0 && chunk.cy <= y1;
      chunk.view.visible = visible;
      // Keep a margin of hidden chunks around the view, drop the rest.
      if (chunk.cx < x0 - 2 || chunk.cx > x1 + 2 || chunk.cy < y0 - 2 || chunk.cy > y1 + 2) {
        chunk.view.destroy({ children: true });
        this.chunks.delete(key(chunk.cx, chunk.cy));
      }
    }
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (!this.chunks.has(key(cx, cy))) this.buildChunk(cx, cy);
      }
    }
  }

  private buildChunk(cx: number, cy: number): void {
    const tiles = new Uint8Array(CHUNK_TILES * CHUNK_TILES);
    const view = new Container();
    view.position.set(cx * CHUNK_TILES * TILE_PX, cy * CHUNK_TILES * TILE_PX);
    for (let ty = 0; ty < CHUNK_TILES; ty++) {
      for (let tx = 0; tx < CHUNK_TILES; tx++) {
        const wx = cx * CHUNK_TILES + tx;
        const wy = cy * CHUNK_TILES + ty;
        const idx = this.generate(wx, wy);
        tiles[ty * CHUNK_TILES + tx] = idx;
        const set = this.assets.tile(this.tileNames[idx]);
        const variant = set.variants[hash(wx, wy) % set.variants.length];
        const s = new Sprite(variant);
        s.position.set(tx * TILE_PX, ty * TILE_PX);
        s.width = TILE_PX;
        s.height = TILE_PX;
        // Snap to whole screen pixels so fractional zooms don't open seams between tiles.
        s.roundPixels = true;
        view.addChild(s);
      }
    }
    this.container.addChild(view);
    this.chunks.set(key(cx, cy), { cx, cy, tiles, view });
  }
}

function key(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Smooth 2D value noise in [0, 1). */
export function valueNoise(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const r = (a: number, b: number) => (hash(a + seed * 7919, b - seed * 104729) & 0xffff) / 65536;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const top = r(xi, yi) + (r(xi + 1, yi) - r(xi, yi)) * sx;
  const bottom = r(xi, yi + 1) + (r(xi + 1, yi + 1) - r(xi, yi + 1)) * sx;
  return top + (bottom - top) * sy;
}
