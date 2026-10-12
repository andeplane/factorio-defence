import type { Container } from 'pixi.js';
import type { AssetStore } from './Assets';
import { TILE_PX } from './Camera';
import { expandKey, orientationOf, SpriteStack } from './SpriteStack';

export interface UnitPrototype {
  name: string;
  /** Layer keys bottom to top; `{dir}` is replaced by the heading's direction index. */
  layers: string[];
  directionCount: number;
  /** Movement speed in tiles per tick (Factorio's `movement_speed`). */
  speed: number;
}

export function unitKeys(proto: UnitPrototype): string[] {
  return proto.layers.flatMap((k) => expandKey(k, proto.directionCount));
}

/** A free-moving thing (biters, later vehicles): not bound to the tile grid. */
export class Unit {
  /** Where the unit is walking to, in tiles. */
  target: { x: number; y: number } | null = null;
  orientation = 0;

  constructor(
    readonly id: number,
    readonly proto: UnitPrototype,
    /** Position in tiles (fractional). */
    public x: number,
    public y: number,
    readonly stack: SpriteStack,
  ) {}

  get moving(): boolean {
    return this.target !== null;
  }
}

export class UnitManager {
  private units = new Map<number, Unit>();
  private nextId = 1;

  constructor(
    private assets: AssetStore,
    private shadowLayer: Container,
    private objectLayer: Container,
  ) {}

  get count(): number {
    return this.units.size;
  }

  all(): IterableIterator<Unit> {
    return this.units.values();
  }

  spawn(proto: UnitPrototype, x: number, y: number): Unit {
    const stack = new SpriteStack(this.assets, proto.layers, proto.directionCount, this.shadowLayer, this.objectLayer);
    const u = new Unit(this.nextId++, proto, x, y, stack);
    this.units.set(u.id, u);
    return u;
  }

  remove(u: Unit): void {
    u.stack.destroy();
    this.units.delete(u.id);
  }

  /** Moves every unit one tick towards its target; clears the target on arrival. */
  step(): void {
    for (const u of this.units.values()) {
      if (!u.target) continue;
      const dx = u.target.x - u.x;
      const dy = u.target.y - u.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= u.proto.speed) {
        u.x = u.target.x;
        u.y = u.target.y;
        u.target = null;
      } else {
        u.x += (dx / dist) * u.proto.speed;
        u.y += (dy / dist) * u.proto.speed;
        u.orientation = orientationOf(dx, dy);
      }
    }
  }

  animate(tick: number): void {
    for (const u of this.units.values()) {
      u.stack.setPosition(u.x * TILE_PX, u.y * TILE_PX, u.y);
      u.stack.update(u.moving ? tick : 0, u.orientation);
    }
  }
}
