import { Sprite, type Container } from 'pixi.js';
import type { Animation, AssetStore } from './Assets';
import { TILE_PX } from './Camera';
import { frameAt, parseTint } from './manifest';

/** Placeholder in a layer key replaced by the direction index, e.g. "small-biter/dir/{dir}". */
export const DIR = '{dir}';

/** Expands `{dir}` in a layer key into one key per direction (0 = north, clockwise). */
export function expandKey(key: string, directionCount: number): string[] {
  if (!key.includes(DIR)) return [key];
  return Array.from({ length: directionCount }, (_, d) => key.replace(DIR, String(d)));
}

/** Direction index for an orientation in turns (0 = north, 0.25 = east), like Factorio's RealOrientation. */
export function directionIndex(orientation: number, directionCount: number): number {
  const o = ((orientation % 1) + 1) % 1;
  return Math.round(o * directionCount) % directionCount;
}

/** Orientation in turns for a world-space vector (y down). */
export function orientationOf(dx: number, dy: number): number {
  return ((Math.atan2(dx, -dy) / (2 * Math.PI)) % 1 + 1) % 1;
}

interface StackLayer {
  /** One animation per direction for `{dir}` layers, else a single entry. */
  anims: (Animation | null)[];
  sprite: Sprite;
  current: Animation | null;
  /** Only drawn while the owner is working (e.g. a furnace's fire). */
  workingOnly: boolean;
}

/**
 * The layered sprites of one thing in the world (an entity, a unit, a cursor
 * ghost). Shadow layers go to `shadowParent` (or are dropped when it is
 * null), the rest to `objectParent`. Directional layers switch animation with
 * the orientation; all layers advance with the shared game tick.
 */
export class SpriteStack {
  private layers: StackLayer[] = [];
  private cx = 0;
  private cy = 0;
  private zBase = 0;
  /** Multiplies every non-shadow layer's colour, e.g. to grey out an offline entity. */
  private tintOverride: number | null = null;

  constructor(
    assets: AssetStore,
    keys: string[],
    directionCount: number,
    shadowParent: Container | null,
    private objectParent: Container,
    workingKeys: ReadonlySet<string> = new Set(),
    /** Colour for layers marked `applyRuntimeTint` (masks), like Factorio's player colour. */
    private runtimeTint?: number,
  ) {
    for (const key of keys) {
      const anims = expandKey(key, directionCount).map((k) => assets.animation(k));
      const first = anims.find((a) => a);
      if (!first) continue;
      if (first.def.drawAsShadow && !shadowParent) continue;
      const sprite = new Sprite(first.frames[0]);
      sprite.anchor.set(0.5);
      (first.def.drawAsShadow ? shadowParent! : objectParent).addChild(sprite);
      this.layers.push({ anims, sprite, current: null, workingOnly: workingKeys.has(key) });
    }
  }

  /** Centre of the owner in world pixels; `zBase` (in tiles) orders overlapping objects. */
  setPosition(cx: number, cy: number, zBase: number): void {
    this.cx = cx;
    this.cy = cy;
    this.zBase = zBase;
    for (const l of this.layers) if (l.current) this.place(l, l.current);
  }

  update(tick: number, orientation = 0, working = true): void {
    for (const l of this.layers) {
      const anim = l.anims.length > 1 ? l.anims[directionIndex(orientation, l.anims.length)] : l.anims[0];
      if (l.workingOnly) l.sprite.visible = anim !== null && working;
      if (anim !== l.current) {
        l.current = anim;
        l.sprite.visible = anim !== null && (!l.workingOnly || working);
        if (anim) this.place(l, anim);
      } else if (!anim || anim.frames.length <= 1) {
        continue;
      }
      if (anim) l.sprite.texture = anim.frames[frameAt(anim.def, tick)];
    }
  }

  /** Tints the whole entity (null restores its own colours). */
  setTint(color: number | null): void {
    if (color === this.tintOverride) return;
    this.tintOverride = color;
    for (const l of this.layers) if (l.current) this.place(l, l.current);
  }

  destroy(): void {
    for (const l of this.layers) l.sprite.destroy();
    this.layers = [];
  }

  private place(l: StackLayer, anim: Animation): void {
    const s = l.sprite;
    const [sx, sy] = anim.def.shift ?? [0, 0];
    s.scale.set(anim.def.scale ?? 1);
    s.position.set(this.cx + sx * TILE_PX, this.cy + sy * TILE_PX);
    s.blendMode = anim.def.additive ? 'add' : 'normal';
    const tint = parseTint(anim.def.tint);
    s.tint = anim.def.applyRuntimeTint && this.runtimeTint !== undefined ? this.runtimeTint : (tint?.color ?? 0xffffff);
    if (this.tintOverride !== null && !anim.def.drawAsShadow) s.tint = multiply(s.tint.valueOf() as number, this.tintOverride);
    s.alpha = tint?.alpha ?? 1;
    if (s.parent === this.objectParent) s.zIndex = this.zBase * 1000 + this.layers.indexOf(l);
  }
}

/** Component-wise product of two 0xRRGGBB colours, like a GPU tint. */
function multiply(a: number, b: number): number {
  const ch = (shift: number) => Math.round((((a >> shift) & 255) * ((b >> shift) & 255)) / 255) << shift;
  return ch(16) | ch(8) | ch(0);
}
