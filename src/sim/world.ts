import {
  BeltLine,
  DIR_VEC,
  Inserter,
  Machine,
  Source,
  type BeltTile,
  type Delivery,
  type Dir,
  type Endpoint,
} from './factory';
import type { ItemName, MachineType } from './recipes';
import type { Rng } from './rng';

export type Point = readonly [number, number];

type Occupant =
  | { kind: 'belt'; line: BeltLine; index: number }
  | { kind: 'machine'; machine: Machine }
  | { kind: 'inserter'; inserter: Inserter }
  | { kind: 'source'; source: Source }
  | { kind: 'card'; id: number };

interface PendingInserter {
  x: number;
  y: number;
  dir: Dir;
  stage: number;
  lane?: 0 | 1;
  until?: number;
}

interface PendingDrill {
  item: ItemName;
  x: number;
  y: number;
  dir: Dir;
  stage: number;
}

const key = (x: number, y: number) => `${x},${y}`;

function dirBetween(a: Point, b: Point): Dir {
  const dx = Math.sign(b[0] - a[0]);
  const dy = Math.sign(b[1] - a[1]);
  if (dx > 0) return 'east';
  if (dx < 0) return 'west';
  return dy > 0 ? 'south' : 'north';
}

/** The factory: every belt, machine, inserter and drill in a level, with the stage it appears in. */
export class World {
  readonly lines: BeltLine[] = [];
  readonly machines: Machine[] = [];
  readonly inserters: Inserter[] = [];
  readonly sources: Source[] = [];
  private readonly grid = new Map<string, Occupant>();
  private pending: PendingInserter[] = [];
  private pendingDrills: PendingDrill[] = [];
  private boundsCache: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
  private nextId = 1;
  /** Entities with a stage above this are not built yet. */
  stage = 1;

  // ---- Building -------------------------------------------------------------

  /**
   * A belt through the given corner points (straight runs between them). With `sink`, items
   * leaving the last tile are delivered to the dock.
   */
  belt(points: Point[], opts: { sink?: boolean; stage?: number } = {}): BeltLine {
    const cells: Point[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, ay] = points[i];
      const [bx, by] = points[i + 1];
      if (ax !== bx && ay !== by) throw new Error('Belt segments must be straight');
      const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
      const sx = Math.sign(bx - ax);
      const sy = Math.sign(by - ay);
      for (let k = i === 0 ? 0 : 1; k <= n; k++) cells.push([ax + sx * k, ay + sy * k]);
    }
    const tiles: BeltTile[] = cells.map((c, i) => ({
      x: c[0],
      y: c[1],
      dir: i < cells.length - 1 ? dirBetween(c, cells[i + 1]) : dirBetween(cells[i - 1], c),
    }));
    const line = new BeltLine(this.nextId++, tiles, opts.sink ?? false, opts.stage ?? 1);
    tiles.forEach((t, index) => this.occupy(t.x, t.y, 1, { kind: 'belt', line, index }));
    this.lines.push(line);
    return line;
  }

  machine(type: MachineType, recipe: string, x: number, y: number, stage = 1): Machine {
    const m = new Machine(this.nextId++, type, recipe, x, y, stage);
    this.occupy(x, y, m.size, { kind: 'machine', machine: m });
    this.machines.push(m);
    return m;
  }

  furnace(recipe: string, x: number, y: number, stage = 1): Machine {
    return this.machine('stone-furnace', recipe, x, y, stage);
  }

  assembler(recipe: string, x: number, y: number, stage = 1): Machine {
    return this.machine('assembling-machine-1', recipe, x, y, stage);
  }

  /** An inserter at (x, y) dropping towards `dir`. Endpoints are resolved by `finish()`. */
  inserter(x: number, y: number, dir: Dir, stage = 1, lane?: 0 | 1, until?: number): void {
    this.pending.push({ x, y, dir, stage, lane, until });
    this.occupy(x, y, 1, { kind: 'card', id: -1 });
  }

  /** A 3x3 electric mining drill with its top-left at (x, y), outputting towards `dir` onto a belt. */
  drill(item: ItemName, x: number, y: number, dir: Dir, stage = 1): void {
    this.pendingDrills.push({ item, x, y, dir, stage });
    this.occupy(x, y, 3, { kind: 'card', id: -1 });
  }

  /** The lane on the far side of a belt tile, seen from something dropping towards `dir`. */
  private farLane(line: BeltLine, index: number, dir: Dir): 0 | 1 {
    const [dx, dy] = DIR_VEC[dir];
    const bd = DIR_VEC[line.tiles[index].dir];
    const left = [bd[1], -bd[0]];
    return -dx * left[0] - dy * left[1] > 0 ? 1 : 0;
  }

  finish(): this {
    for (const d of this.pendingDrills) {
      const [dx, dy] = DIR_VEC[d.dir];
      const ox = d.x + 1 + dx * 2;
      const oy = d.y + 1 + dy * 2;
      const out = this.endpoint(ox, oy);
      if (out?.kind !== 'belt') throw new Error(`Drill at ${d.x},${d.y} has no belt at ${ox},${oy}`);
      const lane = this.farLane(out.line, out.index, d.dir);
      const s = new Source(this.nextId++, d.item, d.x, d.y, d.dir, out.line, lane, out.index, d.stage);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) this.grid.set(key(d.x + i, d.y + j), { kind: 'source', source: s });
      this.sources.push(s);
    }
    this.pendingDrills = [];
    for (const p of this.pending) {
      const [dx, dy] = DIR_VEC[p.dir];
      const pickup = this.endpoint(p.x - dx, p.y - dy);
      const drop = this.endpoint(p.x + dx, p.y + dy);
      if (!pickup || !drop) throw new Error(`Inserter at ${p.x},${p.y} has nothing to pick from or drop to`);
      let lane: 0 | 1 = p.lane ?? 0;
      if (p.lane === undefined && drop.kind === 'belt') lane = this.farLane(drop.line, drop.index, p.dir);
      const ins = new Inserter(this.nextId++, p.x, p.y, p.dir, pickup, drop, lane, p.stage, p.until);
      this.grid.set(key(p.x, p.y), { kind: 'inserter', inserter: ins });
      this.inserters.push(ins);
    }
    this.pending = [];
    return this;
  }

  private endpoint(x: number, y: number): Endpoint | null {
    const o = this.grid.get(key(x, y));
    if (o?.kind === 'belt') return { kind: 'belt', line: o.line, index: o.index };
    if (o?.kind === 'machine') return { kind: 'machine', machine: o.machine };
    return null;
  }

  private occupy(x: number, y: number, size: number, o: Occupant): void {
    for (let i = 0; i < size; i++)
      for (let j = 0; j < size; j++) {
        const k = key(x + i, y + j);
        if (this.grid.has(k)) throw new Error(`Tile ${x + i},${y + j} is already taken`);
        this.grid.set(k, o);
      }
    if (o.kind !== 'card') this.boundsCache = null;
  }

  isFree(x: number, y: number, size = 1): boolean {
    for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) if (this.grid.has(key(x + i, y + j))) return false;
    return true;
  }

  /** Marks tiles as used by a placed card (Data Fusion hub, Charts, ...). */
  claim(x: number, y: number, size: number, id: number): void {
    this.occupy(x, y, size, { kind: 'card', id });
  }

  /** Tile bounds of the factory (not counting placed cards), inclusive min and exclusive max. */
  bounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    if (this.boundsCache) return this.boundsCache;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [k, o] of this.grid) {
      if (o.kind === 'card' && o.id !== -1) continue;
      const [x, y] = k.split(',').map(Number);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + 1);
      maxY = Math.max(maxY, y + 1);
    }
    return (this.boundsCache = { minX, minY, maxX, maxY });
  }

  // ---- Running --------------------------------------------------------------

  active(e: { stage: number; until?: number }): boolean {
    return e.stage <= this.stage && this.stage < (e.until ?? Infinity);
  }

  activeMachines(): Machine[] {
    return this.machines.filter((m) => this.active(m));
  }

  activeInserters(): Inserter[] {
    return this.inserters.filter((i) => this.active(i));
  }

  activeLines(): BeltLine[] {
    return this.lines.filter((l) => this.active(l));
  }

  /**
   * One tick of the factory. The callbacks let the threat system slow or stop things:
   * `machineSpeed` (0 = stopped), `machineOff` (off-spec chance) and `inserterOn`.
   */
  step(
    rng: Rng,
    deliver: Delivery,
    machineSpeed: (m: Machine) => number,
    machineOff: (m: Machine) => number,
    inserterOn: (i: Inserter) => boolean,
  ): void {
    for (const s of this.sources) if (this.active(s)) s.step();
    for (const line of this.lines) if (this.active(line)) line.step(deliver);
    for (const ins of this.inserters) if (this.active(ins) && inserterOn(ins)) ins.step();
    for (const m of this.machines) if (this.active(m)) m.step(machineSpeed(m), machineOff(m), rng);
  }

  /** ASCII picture of the layout, for debugging level design. */
  ascii(): string {
    const b = this.bounds();
    const rows: string[] = [];
    const arrow: Record<Dir, string> = { north: '^', east: '>', south: 'v', west: '<' };
    for (let y = b.minY; y < b.maxY; y++) {
      let row = '';
      for (let x = b.minX; x < b.maxX; x++) {
        const o = this.grid.get(key(x, y));
        if (!o) row += '.';
        else if (o.kind === 'belt') row += arrow[o.line.tiles[o.index].dir];
        else if (o.kind === 'machine') row += o.machine.isFurnace ? 'F' : 'A';
        else if (o.kind === 'inserter') row += 'i';
        else if (o.kind === 'source') row += 'D';
        else row += 'C';
      }
      rows.push(row);
    }
    return rows.join('\n');
  }
}
