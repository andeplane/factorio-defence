import { CRAFTING_SPEED, RECIPES, type ItemName, type MachineType, type Recipe } from './recipes';
import type { Rng } from './rng';

export const TICKS_PER_SECOND = 60;
/** Yellow belt: 1.875 tiles/s. */
export const BELT_SPEED = 1.875 / TICKS_PER_SECOND;
/** Items on a lane keep this far apart, giving 4 items per tile per lane. */
export const ITEM_GAP = 0.25;
const HALF_GAP = ITEM_GAP / 2;
/** Yellow inserter: 0.6 s each way, 1.2 s per item. */
export const INSERTER_SWING_TICKS = 36;
/** A machine stops crafting once this many results are waiting. */
const OUTPUT_CAP = 8;

export type Dir = 'north' | 'east' | 'south' | 'west';
export const DIR_VEC: Record<Dir, readonly [number, number]> = {
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
};

export interface Stack {
  item: ItemName;
  off: boolean;
}

export interface LaneItem extends Stack {
  pos: number;
}

export interface BeltTile {
  x: number;
  y: number;
  dir: Dir;
}

/** Counts of good and off-spec items. */
export interface Count {
  good: number;
  off: number;
}

export type Delivery = (item: ItemName, off: boolean) => void;

/**
 * A Factorio-style transport line: a chain of belt tiles with two lanes. Lane 0 is the left lane
 * seen in the direction of travel. Positions are measured in tiles from the start of the chain.
 */
export class BeltLine {
  readonly lanes: [LaneItem[], LaneItem[]] = [[], []];
  /** Clog positions per lane; items cannot move past them. */
  readonly blocks: [number[], number[]] = [[], []];

  constructor(
    readonly id: number,
    readonly tiles: BeltTile[],
    readonly sink: boolean,
    readonly stage: number,
  ) {}

  get length(): number {
    return this.tiles.length;
  }

  step(deliver: Delivery): void {
    const end = this.length - HALF_GAP;
    for (let l = 0; l < 2; l++) {
      const lane = this.lanes[l];
      const blocks = this.blocks[l];
      let cap = end;
      for (let i = 0; i < lane.length; i++) {
        const it = lane[i];
        let limit = cap;
        for (const b of blocks) if (b > it.pos && b - HALF_GAP < limit) limit = b - HALF_GAP;
        const next = Math.min(it.pos + BELT_SPEED, limit);
        if (next > it.pos) it.pos = next;
        if (this.sink && i === 0 && it.pos >= end - 1e-9) {
          deliver(it.item, it.off);
          lane.shift();
          i--;
          continue;
        }
        cap = it.pos - ITEM_GAP;
      }
    }
  }

  canInsert(lane: 0 | 1, pos: number): boolean {
    if (pos < 0 || pos >= this.length) return false;
    for (const it of this.lanes[lane]) if (Math.abs(it.pos - pos) < ITEM_GAP - 1e-9) return false;
    return true;
  }

  insert(lane: 0 | 1, pos: number, stack: Stack): boolean {
    if (!this.canInsert(lane, pos)) return false;
    const items = this.lanes[lane];
    let i = 0;
    while (i < items.length && items[i].pos > pos) i++;
    items.splice(i, 0, { item: stack.item, off: stack.off, pos });
    return true;
  }

  /** Takes the most advanced item inside tile `index` (either lane) that `want` accepts. */
  take(index: number, want: (item: ItemName) => boolean): Stack | null {
    for (let l = 0; l < 2; l++) {
      const items = this.lanes[l];
      // Items are sorted by position, front first: binary search for the first one inside the tile.
      let lo = 0;
      let hi = items.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (items[mid].pos >= index + 1) lo = mid + 1;
        else hi = mid;
      }
      for (let i = lo; i < items.length && items[i].pos >= index; i++) {
        const it = items[i];
        if (want(it.item)) {
          items.splice(i, 1);
          return { item: it.item, off: it.off };
        }
      }
    }
    return null;
  }

  itemCount(): number {
    return this.lanes[0].length + this.lanes[1].length;
  }
}

export class Machine {
  readonly input = new Map<ItemName, Count>();
  readonly output: Count = { good: 0, off: 0 };
  readonly recipe: Recipe;
  readonly speed: number;
  progress = 0;
  crafting = false;
  private craftOff = false;
  /** Ticks spent crafting, for stats. */
  busyTicks = 0;
  /** Did it make progress on the last tick? Drives the working animation. */
  working = false;

  constructor(
    readonly id: number,
    readonly type: MachineType,
    recipe: string,
    readonly x: number,
    readonly y: number,
    readonly stage: number,
  ) {
    this.recipe = RECIPES[recipe];
    if (!this.recipe) throw new Error(`Unknown recipe ${recipe}`);
    this.speed = CRAFTING_SPEED[type];
    for (const [item] of this.recipe.ingredients) this.input.set(item, { good: 0, off: 0 });
  }

  get size(): number {
    return this.type === 'stone-furnace' ? 2 : 3;
  }

  get isFurnace(): boolean {
    return this.type === 'stone-furnace';
  }

  wants(item: ItemName): boolean {
    const c = this.input.get(item);
    if (!c) return false;
    const need = this.recipe.ingredients.find(([i]) => i === item)![1];
    return c.good + c.off < Math.max(2 * need, 2);
  }

  insert(stack: Stack): boolean {
    if (!this.wants(stack.item)) return false;
    const c = this.input.get(stack.item)!;
    if (stack.off) c.off++;
    else c.good++;
    return true;
  }

  takeOutput(): Stack | null {
    // Off-spec leaves first so it keeps moving downstream.
    if (this.output.off > 0) {
      this.output.off--;
      return { item: this.recipe.result, off: true };
    }
    if (this.output.good > 0) {
      this.output.good--;
      return { item: this.recipe.result, off: false };
    }
    return null;
  }

  /** `speedMul` folds in wear, breakdowns and power; `offChance` is the sensor-drift off-spec chance. */
  step(speedMul: number, offChance: number, rng: Rng): void {
    this.working = false;
    if (!this.crafting) {
      if (this.output.good + this.output.off + this.recipe.count > OUTPUT_CAP) return;
      for (const [item, n] of this.recipe.ingredients) {
        const c = this.input.get(item)!;
        if (c.good + c.off < n) return;
      }
      let off = false;
      for (const [item, n] of this.recipe.ingredients) {
        const c = this.input.get(item)!;
        for (let k = 0; k < n; k++) {
          if (c.off > 0) {
            c.off--;
            off = true;
          } else c.good--;
        }
      }
      this.crafting = true;
      this.craftOff = off;
      this.progress = 0;
    }
    if (speedMul <= 0) return;
    this.working = true;
    this.busyTicks++;
    this.progress += (this.speed * speedMul) / TICKS_PER_SECOND;
    if (this.progress >= this.recipe.time) {
      const off = this.craftOff || (offChance > 0 && rng.next() < offChance);
      if (off) this.output.off += this.recipe.count;
      else this.output.good += this.recipe.count;
      this.crafting = false;
      this.progress = 0;
    }
  }
}

/** Something on the grid an inserter can reach. */
export type Endpoint = { kind: 'belt'; line: BeltLine; index: number } | { kind: 'machine'; machine: Machine };

export type InserterPhase = 'pickup' | 'toDrop' | 'drop' | 'toPickup';

export class Inserter {
  hand: Stack | null = null;
  phase: InserterPhase = 'pickup';
  timer = 0;

  constructor(
    readonly id: number,
    readonly x: number,
    readonly y: number,
    /** Direction it drops towards; it picks up from the opposite side. */
    readonly dir: Dir,
    readonly pickup: Endpoint,
    readonly drop: Endpoint,
    readonly dropLane: 0 | 1,
    readonly stage: number,
    /** Removed when this stage is reached. */
    readonly until = Infinity,
  ) {}

  /** 0 at the pickup side, 1 at the drop side; for rendering the arm. */
  get armPosition(): number {
    switch (this.phase) {
      case 'pickup':
        return 0;
      case 'drop':
        return 1;
      case 'toDrop':
        return 1 - this.timer / INSERTER_SWING_TICKS;
      case 'toPickup':
        return this.timer / INSERTER_SWING_TICKS;
    }
  }

  private dropWants(item: ItemName): boolean {
    return this.drop.kind === 'machine' ? this.drop.machine.wants(item) : true;
  }

  step(): void {
    switch (this.phase) {
      case 'pickup': {
        const want = (item: ItemName) => this.dropWants(item);
        let got: Stack | null = null;
        if (this.pickup.kind === 'belt') got = this.pickup.line.take(this.pickup.index, want);
        else {
          const m = this.pickup.machine;
          if (m.output.good + m.output.off > 0 && want(m.recipe.result)) got = m.takeOutput();
        }
        if (got) {
          this.hand = got;
          this.phase = 'toDrop';
          this.timer = INSERTER_SWING_TICKS;
        }
        return;
      }
      case 'toDrop':
        if (--this.timer <= 0) this.phase = 'drop';
        return;
      case 'drop': {
        const hand = this.hand!;
        const ok =
          this.drop.kind === 'machine'
            ? this.drop.machine.insert(hand)
            : this.drop.line.insert(this.dropLane, this.drop.index + 0.5, hand);
        if (ok) {
          this.hand = null;
          this.phase = 'toPickup';
          this.timer = INSERTER_SWING_TICKS;
        }
        return;
      }
      case 'toPickup':
        if (--this.timer <= 0) this.phase = 'pickup';
        return;
    }
  }
}

/** Electric mining drill: 0.5 ore/s (mining speed 0.5, mining time 1). */
export const DRILL_RATE = 0.5;

/** A 3x3 electric mining drill putting ore onto the far lane of the belt in front of it. */
export class Source {
  private acc = 0;
  readonly rate = DRILL_RATE;

  constructor(
    readonly id: number,
    readonly item: ItemName,
    readonly x: number,
    readonly y: number,
    /** Output side. */
    readonly dir: Dir,
    readonly line: BeltLine,
    readonly lane: 0 | 1,
    readonly index: number,
    readonly stage: number,
  ) {}

  step(): void {
    this.acc = Math.min(1, this.acc + this.rate / TICKS_PER_SECOND);
    if (this.acc >= 1 && this.line.insert(this.lane, this.index + 0.5, { item: this.item, off: false })) this.acc -= 1;
  }
}
