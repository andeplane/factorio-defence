import { Container, Sprite } from 'pixi.js';
import type { Animation, AssetStore } from './Assets';
import { TILE_PX } from './Camera';
import { frameAt } from './manifest';

export type Direction = 'north' | 'east' | 'south' | 'west';
export const DIRECTIONS: Direction[] = ['north', 'east', 'south', 'west'];

export function rotate(dir: Direction, steps = 1): Direction {
  return DIRECTIONS[(DIRECTIONS.indexOf(dir) + steps + 4 * 4) % 4];
}

export interface EntityPrototype {
  name: string;
  /** Footprint in tiles (width, height) when facing north. */
  size: [number, number];
  rotatable: boolean;
  /**
   * Animation keys drawn bottom to top. Either one list for every direction,
   * or a list per direction.
   */
  layers: string[] | Record<Direction, string[]>;
}

interface Layer {
  anim: Animation;
  sprite: Sprite;
}

export class Entity {
  readonly layers: Layer[] = [];
  /** Animations only advance while the entity is working. */
  working = true;

  constructor(
    readonly id: number,
    readonly proto: EntityPrototype,
    readonly x: number,
    readonly y: number,
    readonly direction: Direction,
  ) {}

  get width(): number {
    return footprint(this.proto, this.direction)[0];
  }

  get height(): number {
    return footprint(this.proto, this.direction)[1];
  }
}

export function footprint(proto: EntityPrototype, dir: Direction): [number, number] {
  const [w, h] = proto.size;
  return dir === 'east' || dir === 'west' ? [h, w] : [w, h];
}

export function layerKeys(proto: EntityPrototype, dir: Direction): string[] {
  return Array.isArray(proto.layers) ? proto.layers : proto.layers[dir];
}

/** Builds a sprite for an animation, positioned relative to an entity's centre. */
export function makeLayerSprite(anim: Animation, centreX: number, centreY: number): Sprite {
  const s = new Sprite(anim.frames[0]);
  const scale = anim.def.scale ?? 1;
  const [sx, sy] = anim.def.shift ?? [0, 0];
  s.anchor.set(0.5);
  s.scale.set(scale);
  s.position.set(centreX + sx * TILE_PX, centreY + sy * TILE_PX);
  if (anim.def.additive) s.blendMode = 'add';
  return s;
}

/**
 * Owns all placed entities: tile occupancy, display objects split into a
 * shadow layer and a y-sorted object layer, and synchronized animation.
 */
export class EntityManager {
  readonly shadowLayer = new Container();
  readonly objectLayer = new Container();
  private entities = new Map<number, Entity>();
  private occupancy = new Map<string, number>();
  private nextId = 1;

  constructor(private assets: AssetStore) {
    this.shadowLayer.label = 'shadows';
    this.shadowLayer.alpha = 0.6;
    this.objectLayer.label = 'entities';
    this.objectLayer.sortableChildren = true;
  }

  get count(): number {
    return this.entities.size;
  }

  all(): IterableIterator<Entity> {
    return this.entities.values();
  }

  at(x: number, y: number): Entity | undefined {
    const id = this.occupancy.get(cell(x, y));
    return id === undefined ? undefined : this.entities.get(id);
  }

  canPlace(proto: EntityPrototype, x: number, y: number, dir: Direction): boolean {
    const [w, h] = footprint(proto, dir);
    for (let ty = y; ty < y + h; ty++) {
      for (let tx = x; tx < x + w; tx++) if (this.occupancy.has(cell(tx, ty))) return false;
    }
    return true;
  }

  place(proto: EntityPrototype, x: number, y: number, dir: Direction): Entity | null {
    if (!this.canPlace(proto, x, y, dir)) return null;
    const e = new Entity(this.nextId++, proto, x, y, proto.rotatable ? dir : 'north');
    const cx = (x + e.width / 2) * TILE_PX;
    const cy = (y + e.height / 2) * TILE_PX;
    for (const k of layerKeys(proto, e.direction)) {
      const anim = this.assets.animation(k);
      const sprite = makeLayerSprite(anim, cx, cy);
      if (anim.def.drawAsShadow) {
        this.shadowLayer.addChild(sprite);
      } else {
        // Sort by the entity's bottom edge so taller things overlap correctly.
        sprite.zIndex = (y + e.height) * 1000 + e.layers.length;
        this.objectLayer.addChild(sprite);
      }
      e.layers.push({ anim, sprite });
    }
    for (let ty = y; ty < y + e.height; ty++) {
      for (let tx = x; tx < x + e.width; tx++) this.occupancy.set(cell(tx, ty), e.id);
    }
    this.entities.set(e.id, e);
    return e;
  }

  remove(e: Entity): void {
    for (const l of e.layers) l.sprite.destroy();
    for (let ty = e.y; ty < e.y + e.height; ty++) {
      for (let tx = e.x; tx < e.x + e.width; tx++) this.occupancy.delete(cell(tx, ty));
    }
    this.entities.delete(e.id);
  }

  /** Advance every animation to game tick `tick`. All belts stay in sync, like Factorio. */
  animate(tick: number): void {
    for (const e of this.entities.values()) {
      if (!e.working) continue;
      for (const l of e.layers) {
        if (l.anim.frames.length > 1) l.sprite.texture = l.anim.frames[frameAt(l.anim.def, tick)];
      }
    }
  }
}

function cell(x: number, y: number): string {
  return `${x},${y}`;
}
