import { Container } from 'pixi.js';
import type { AssetStore } from './Assets';
import { TILE_PX } from './Camera';
import { expandKey, SpriteStack } from './SpriteStack';

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
   * or a list per direction. A key containing `{dir}` is a directional layer
   * (e.g. a turret's gun) picked from the entity's orientation, with
   * `directionCount` variants.
   */
  layers: string[] | Record<Direction, string[]>;
  directionCount?: number;
  /**
   * Picks layers from the surroundings (e.g. belt curves). Re-evaluated when
   * the entity or one of its neighbours is placed or removed. Falls back to
   * `layers` when it returns undefined.
   */
  connectedLayers?: (e: Entity, world: EntityManager) => string[] | undefined;
  /** Every animation key this prototype may use, for preloading. */
  extraKeys?: string[];
}

/** All animation keys a prototype can show, for `AssetStore.preload`. */
export function prototypeKeys(proto: EntityPrototype): string[] {
  const base = Array.isArray(proto.layers) ? proto.layers : Object.values(proto.layers).flat();
  const keys = [...base, ...(proto.extraKeys ?? [])].flatMap((k) => expandKey(k, proto.directionCount ?? 1));
  return [...new Set(keys)];
}

export class Entity {
  stack: SpriteStack | null = null;
  layerKeys: string[] = [];
  /** Animations only advance while the entity is working. */
  working = true;
  /** Turns, 0 = north, clockwise. Selects the frame set of `{dir}` layers. */
  orientation = 0;

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
    // Shadows are drawn as one flat layer under all objects, like Factorio.
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
    for (let ty = y; ty < y + e.height; ty++) {
      for (let tx = x; tx < x + e.width; tx++) this.occupancy.set(cell(tx, ty), e.id);
    }
    this.entities.set(e.id, e);
    this.refresh(e);
    this.refreshNeighbours(e);
    return e;
  }

  remove(e: Entity): void {
    e.stack?.destroy();
    e.stack = null;
    for (let ty = e.y; ty < e.y + e.height; ty++) {
      for (let tx = e.x; tx < e.x + e.width; tx++) this.occupancy.delete(cell(tx, ty));
    }
    this.entities.delete(e.id);
    this.refreshNeighbours(e);
  }

  /** Rebuilds an entity's sprites if its (possibly connection-dependent) layers changed. */
  private refresh(e: Entity): void {
    const keys = e.proto.connectedLayers?.(e, this) ?? layerKeys(e.proto, e.direction);
    if (keys.length === e.layerKeys.length && keys.every((k, i) => k === e.layerKeys[i])) return;
    e.stack?.destroy();
    e.layerKeys = keys;
    e.stack = new SpriteStack(this.assets, keys, e.proto.directionCount ?? 1, this.shadowLayer, this.objectLayer);
    // Sort by the entity's bottom edge so taller things overlap correctly.
    e.stack.setPosition((e.x + e.width / 2) * TILE_PX, (e.y + e.height / 2) * TILE_PX, e.y + e.height);
  }

  private refreshNeighbours(e: Entity): void {
    const seen = new Set<number>([e.id]);
    const visit = (tx: number, ty: number) => {
      const n = this.at(tx, ty);
      if (n && !seen.has(n.id)) {
        seen.add(n.id);
        if (n.proto.connectedLayers) this.refresh(n);
      }
    };
    for (let tx = e.x; tx < e.x + e.width; tx++) {
      visit(tx, e.y - 1);
      visit(tx, e.y + e.height);
    }
    for (let ty = e.y; ty < e.y + e.height; ty++) {
      visit(e.x - 1, ty);
      visit(e.x + e.width, ty);
    }
  }

  /** Advance every animation to game tick `tick`. All belts stay in sync, like Factorio. */
  animate(tick: number): void {
    for (const e of this.entities.values()) e.stack?.update(e.working ? tick : 0, e.orientation);
  }
}

function cell(x: number, y: number): string {
  return `${x},${y}`;
}
