import { ALL_CARDS, CARDS, type CardId } from './cards';
import { TICKS_PER_SECOND, type BeltLine, type Inserter, type Machine } from './factory';
import { THREAT_COST, type BossEvent, type LevelDef, type Order, type ThreatType } from './level';
import { ITEM_VALUE, type ItemName } from './recipes';
import { Rng } from './rng';
import { World } from './world';

export type Phase = 'build' | 'shift' | 'won' | 'lost';
export type ProblemType = 'wear' | 'clog' | 'jam' | 'drift' | 'false-alarm';

/** A problem on a piece of equipment. Unfixed problems carry over into the next shift. */
export interface Problem {
  id: number;
  type: ProblemType;
  /** World position (tile units) of the affected spot, for crews, coverage and rendering. */
  x: number;
  y: number;
  machine?: Machine;
  inserter?: Inserter;
  line?: BeltLine;
  lane?: 0 | 1;
  pos?: number;
  start: number;
  /** Bearing wear: 0 to 1, broken at 1. */
  severity: number;
  growth: number;
  detected: number | null;
  detectedBy: string | null;
  /** Tick the work order goes out to crews. */
  orderAt: number | null;
  /** Tick an Atlas AI agent finishes a remote fix. */
  remoteFixAt: number | null;
  crew: Crew | null;
  fixed: boolean;
}

export interface Crew {
  id: number;
  x: number;
  y: number;
  job: Problem | null;
  state: 'idle' | 'walk' | 'work';
  workLeft: number;
  workCost: number;
}

export interface PlacedCard {
  uid: number;
  card: CardId;
  x: number;
  y: number;
  size: number;
  radius: number;
  cx: number;
  cy: number;
}

export interface PlannedThreat {
  second: number;
  type: ThreatType;
}

export interface OrderResult extends Order {
  delivered: number;
  met: boolean;
}

export interface ShiftReport {
  round: number;
  orders: OrderResult[];
  income: number;
  repairCost: number;
  spawned: Partial<Record<ProblemType, number>>;
  detectedEarly: number;
  breakdowns: number;
  offSpecDelivered: number;
}

/** Cards that help against each threat, used to make sure a new threat comes with an answer. */
const COUNTERS: Record<ThreatType | BossEvent['type'], CardId[]> = {
  wear: ['charts', 'asset-data-insights', 'inrobot', 'maintain'],
  clog: ['charts', 'inrobot', 'flows'],
  jam: ['charts', 'inrobot', 'flows'],
  drift: ['charts', 'search', 'atlas-ai'],
  flood: ['atlas-ai'],
  trip: ['simulators'],
  'knowledge-loss': ['data-fusion'],
};

const DISPATCH_DELAY = 6 * TICKS_PER_SECOND;
const CREW_SPEED = 4 / TICKS_PER_SECOND;
const SEARCH_PERIOD = 20 * TICKS_PER_SECOND;
const TRIP_SECONDS = 12;
/** New equipment is commissioned (run without problems or deliveries) before its first shift. */
const COMMISSION_SECONDS = 60;

/** Repair time in seconds and cost, by problem. */
function repairOf(p: Problem): { seconds: number; cost: number } {
  switch (p.type) {
    case 'wear':
      return p.severity >= 1 ? { seconds: 15, cost: 60 } : { seconds: 3, cost: 10 };
    case 'clog':
      return { seconds: 4, cost: 8 };
    case 'jam':
      return { seconds: 3, cost: 6 };
    case 'drift':
      return { seconds: 4, cost: 15 };
    case 'false-alarm':
      return { seconds: 3, cost: 0 };
  }
}

/** How much a problem hurts right now, for Atlas AI's dispatch order. */
function impactOf(p: Problem): number {
  switch (p.type) {
    case 'wear':
      return p.severity >= 1 ? 100 : 10 + p.severity * 50;
    case 'jam':
      return 60;
    case 'clog':
      return 55;
    case 'drift':
      return 40;
    case 'false-alarm':
      return 0;
  }
}

/**
 * One play-through of a level. The UI and the balance bots drive it the same way: in the build
 * phase call `buy`/`reroll`, then `startShift` and `step` (or `runShift`) until the next build phase.
 */
export class Game {
  readonly world = new World();
  readonly rng: Rng;
  phase: Phase = 'build';
  round = 1;
  money: number;
  strikes = 0;
  /** Game ticks; only advances during shifts. */
  tick = 0;
  shiftTick = 0;
  orders: Order[] = [];
  offer: CardId[] = [];
  rerolls = 0;
  plan: PlannedThreat[] = [];
  events: BossEvent[] = [];
  readonly owned = new Map<CardId, number>();
  readonly placed: PlacedCard[] = [];
  readonly crews: Crew[] = [];
  readonly problems: Problem[] = [];
  readonly reports: ShiftReport[] = [];
  readonly spendLog: { round: number; card: CardId; price: number }[] = [];
  /** Spawn weight multipliers from Industrial Canvas root cause analyses. */
  readonly rca = new Map<ThreatType, number>();
  knowledgeLoss = false;
  tripUntil = -1;
  private nextId = 1;
  private nextSearch = 0;
  private delivered = new Map<ItemName, { good: number; off: number }>();
  private income = 0;
  private repairCost = 0;
  private spawned: Partial<Record<ProblemType, number>> = {};
  private detectedEarly = 0;
  private breakdowns = 0;
  private wear = new Map<Machine, Problem>();
  private drift = new Map<Machine, Problem>();
  private jams = new Map<Inserter, Problem>();

  constructor(
    readonly level: LevelDef,
    seed: number,
  ) {
    this.rng = new Rng(seed);
    level.build(this.world);
    this.world.finish();
    this.money = level.startMoney;
    for (let i = 0; i < level.crews; i++) this.addCrew();
    this.beginBuild();
  }

  // ---- Queries ---------------------------------------------------------------

  has(card: CardId): boolean {
    return (this.owned.get(card) ?? 0) > 0;
  }

  get stage(): number {
    return this.level.stages.filter((s) => s.round <= this.round).length;
  }

  get shiftTicks(): number {
    return this.level.shiftSeconds * TICKS_PER_SECOND;
  }

  /** Is the spot inside a Data Fusion hub's or an extractor's range? */
  connected(x: number, y: number): boolean {
    return this.placed.some(
      (p) => (p.card === 'data-fusion' || p.card === 'extractor') && Math.hypot(p.cx - x, p.cy - y) <= p.radius,
    );
  }

  covered(card: CardId, x: number, y: number): boolean {
    return this.placed.some((p) => p.card === card && Math.hypot(p.cx - x, p.cy - y) <= p.radius);
  }

  openProblems(): Problem[] {
    return this.problems.filter((p) => !p.fixed);
  }

  deliveredThisShift(item: ItemName): number {
    return this.delivered.get(item)?.good ?? 0;
  }

  /** What the player sees about the next shift. Without Simulators only the count is known. */
  forecast(): { count: number; threats: ThreatType[] | null; events: BossEvent[] } {
    return {
      count: this.plan.length,
      threats: this.has('simulators') ? this.plan.map((t) => t.type) : null,
      events: this.events,
    };
  }

  // ---- Build phase -----------------------------------------------------------

  private beginBuild(): void {
    this.phase = 'build';
    if (this.world.stage !== this.stage || this.round === 1) {
      this.world.stage = this.stage;
      this.commission();
    }
    this.orders = this.level.stages[this.stage - 1].orders;
    this.events = this.level.events.filter((e) => e.round === this.round);
    this.rerolls = 0;
    this.makeOffer();
    this.makePlan();
  }

  /**
   * Runs the factory for a while with problems paused and deliveries not counted, so a new stage
   * (or the plant at the start) is up to speed when the player's shift begins.
   */
  private commission(): void {
    for (let t = 0; t < COMMISSION_SECONDS * TICKS_PER_SECOND; t++)
      this.world.step(this.rng, () => {}, () => 1, () => 0, () => true);
  }

  private eligible(card: CardId): boolean {
    const def = CARDS[card];
    if (!this.level.cards.includes(card)) return false;
    if (def.unique && this.has(card)) return false;
    if (def.requires && !this.has(def.requires)) return false;
    return true;
  }

  private makeOffer(): void {
    const pool = ALL_CARDS.filter((c) => this.eligible(c));
    const offer: CardId[] = [];
    // The first offer always includes Data Fusion, since most products build on it.
    if (!this.has('data-fusion') && pool.includes('data-fusion')) offer.push('data-fusion');
    // A threat or event that is new this round comes with at least one card that answers it.
    const fresh: (ThreatType | BossEvent['type'])[] = [
      ...(Object.entries(this.level.threats) as [ThreatType, { from: number }][])
        .filter(([, v]) => v.from === this.round)
        .map(([t]) => t),
      ...this.events.map((e) => e.type),
    ];
    for (const t of fresh) {
      const answers = COUNTERS[t].filter((c) => pool.includes(c));
      if (answers.length && !answers.some((c) => offer.includes(c)) && offer.length < 3) offer.push(this.rng.pick(answers));
    }
    while (offer.length < 3 && offer.length < pool.length) {
      const c = this.rng.pick(pool);
      if (!offer.includes(c)) offer.push(c);
    }
    this.offer = offer;
  }

  rerollCost(): number {
    return 10 + 5 * this.rerolls;
  }

  reroll(): boolean {
    if (this.phase !== 'build' || this.money < this.rerollCost()) return false;
    this.money -= this.rerollCost();
    this.rerolls++;
    this.makeOffer();
    return true;
  }

  /** Why the card can't go at (x, y), or null if it can. (x, y) is the footprint's top-left tile. */
  placementError(card: CardId, x: number, y: number): string | null {
    const def = CARDS[card];
    if (!def.placed) return 'This card is not placed on the map';
    const { size } = def.placed;
    if (!this.world.isFree(x, y, size)) return 'That spot is taken';
    const b = this.world.bounds();
    if (x < b.minX - 4 || y < b.minY - 4 || x + size > b.maxX + 4 || y + size > b.maxY + 4) return 'Too far from the plant';
    if (card === 'extractor') {
      const c = [x + size / 2, y + size / 2];
      const inHub = this.placed.some((p) => p.card === 'data-fusion' && Math.hypot(p.cx - c[0], p.cy - c[1]) <= p.radius);
      if (!inHub) return 'Extractors must be inside a Data Fusion hub range';
    }
    return null;
  }

  /** Buys the offered card at `index`. Placed cards need a position. Returns an error or null. */
  buy(index: number, at?: readonly [number, number]): string | null {
    if (this.phase !== 'build') return 'Only between shifts';
    const card = this.offer[index];
    if (!card) return 'No such card';
    const def = CARDS[card];
    if (this.money < def.price) return 'Not enough money';
    if (def.placed) {
      if (!at) return 'Choose where to place it';
      const err = this.placementError(card, at[0], at[1]);
      if (err) return err;
      const { size, radius } = def.placed;
      const uid = this.nextId++;
      this.world.claim(at[0], at[1], size, uid);
      this.placed.push({ uid, card, x: at[0], y: at[1], size, radius, cx: at[0] + size / 2, cy: at[1] + size / 2 });
    }
    this.money -= def.price;
    this.owned.set(card, (this.owned.get(card) ?? 0) + 1);
    this.spendLog.push({ round: this.round, card, price: def.price });
    this.offer.splice(index, 1);
    if (card === 'crew') this.addCrew();
    if (card === 'canvas') this.rootCauseAnalysis();
    return null;
  }

  private addCrew(): void {
    const [x, y] = this.level.depot;
    this.crews.push({ id: this.nextId++, x, y, job: null, state: 'idle', workLeft: 0, workCost: 0 });
  }

  private rootCauseAnalysis(): void {
    const last = this.reports[this.reports.length - 1];
    const counts: Partial<Record<ThreatType, number>> = {};
    if (last) {
      for (const [t, n] of Object.entries(last.spawned) as [ProblemType, number][]) {
        const tt: ThreatType = t === 'false-alarm' ? 'flood' : t;
        counts[tt] = (counts[tt] ?? 0) + (t === 'false-alarm' ? n / 5 : n);
      }
    }
    let best: ThreatType | null = null;
    for (const [t, n] of Object.entries(counts) as [ThreatType, number][]) if (!best || n > counts[best]!) best = t;
    if (!best) {
      // Nothing seen yet: target the level's most likely threat.
      for (const [t, v] of Object.entries(this.level.threats) as [ThreatType, { weight: number }][])
        if (!best || v.weight > this.level.threats[best]!.weight) best = t;
    }
    if (!best) return;
    this.rca.set(best, (this.rca.get(best) ?? 1) * 0.6);
    this.makePlan();
  }

  private makePlan(): void {
    let budget = this.level.threatBudget(this.round);
    const types = (Object.entries(this.level.threats) as [ThreatType, { weight: number; from: number }][]).filter(
      ([, v]) => v.from <= this.round,
    );
    const plan: PlannedThreat[] = [];
    const planRng = new Rng(Math.floor(this.rng.next() * 2 ** 31));
    for (;;) {
      const affordable = types.filter(([t]) => THREAT_COST[t] <= budget + 1e-9);
      const pick = planRng.weighted(affordable, ([t, v]) => v.weight * (this.rca.get(t) ?? 1));
      if (!pick) break;
      budget -= THREAT_COST[pick[0]];
      plan.push({ type: pick[0], second: planRng.range(3, this.level.shiftSeconds * 0.8) });
    }
    plan.sort((a, b) => a.second - b.second);
    this.plan = plan;
  }

  // ---- Shift -----------------------------------------------------------------

  startShift(): void {
    if (this.phase !== 'build') return;
    this.phase = 'shift';
    this.shiftTick = 0;
    this.delivered.clear();
    this.income = 0;
    this.repairCost = 0;
    this.spawned = {};
    this.detectedEarly = 0;
    this.breakdowns = 0;
    this.nextSearch = this.tick + SEARCH_PERIOD;
    if (this.has('maintain')) {
      for (const p of this.openProblems())
        if (p.type === 'wear' && this.connected(p.x, p.y)) this.fix(p, 0);
    }
  }

  runShift(): void {
    if (this.phase === 'build') this.startShift();
    while (this.phase === 'shift') this.step();
  }

  step(): void {
    if (this.phase !== 'shift') return;
    const second = this.shiftTick / TICKS_PER_SECOND;
    const nextSecond = (this.shiftTick + 1) / TICKS_PER_SECOND;
    for (const t of this.plan) if (t.second >= second && t.second < nextSecond) this.spawn(t.type);
    for (const e of this.events) {
      if (e.second < second || e.second >= nextSecond) continue;
      if (e.type === 'trip') this.tripUntil = this.tick + TRIP_SECONDS * (this.has('simulators') ? 0.5 : 1) * TICKS_PER_SECOND;
      else this.knowledgeLoss = true;
    }

    const tripped = this.tick < this.tripUntil;
    this.world.step(
      this.rng,
      (item, off) => this.deliver(item, off),
      (m) => {
        if (tripped) return 0;
        const w = this.wear.get(m);
        if (!w) return 1;
        if (w.severity >= 1) return 0;
        return w.severity >= 0.5 ? 0.7 : 1;
      },
      (m) => (this.drift.has(m) ? 0.4 : 0),
      (i) => !tripped && !this.jams.has(i),
    );

    this.updateProblems();
    this.updateCrews();

    this.tick++;
    this.shiftTick++;
    if (this.shiftTick >= this.shiftTicks) this.endShift();
  }

  private deliver(item: ItemName, off: boolean): void {
    let c = this.delivered.get(item);
    if (!c) this.delivered.set(item, (c = { good: 0, off: 0 }));
    if (off) c.off++;
    else {
      c.good++;
      this.money += ITEM_VALUE[item];
      this.income += ITEM_VALUE[item];
    }
  }

  private spawn(type: ThreatType): void {
    if (type === 'flood') {
      const machines = this.world.activeMachines();
      const n = 4 + this.rng.int(3);
      for (let i = 0; i < n; i++) {
        const m = this.rng.pick(machines);
        this.addProblem('false-alarm', { machine: m, x: m.x + m.size / 2, y: m.y + m.size / 2 });
      }
      return;
    }
    if (type === 'wear' || type === 'drift') {
      const map = type === 'wear' ? this.wear : this.drift;
      const free = this.world.activeMachines().filter((m) => !map.has(m));
      if (!free.length) return;
      const m = this.rng.pick(free);
      const p = this.addProblem(type, { machine: m, x: m.x + m.size / 2, y: m.y + m.size / 2 });
      if (type === 'wear') p.growth = 1 / (this.rng.range(40, 70) * TICKS_PER_SECOND);
      map.set(m, p);
      return;
    }
    if (type === 'jam') {
      const free = this.world.activeInserters().filter((i) => !this.jams.has(i));
      if (!free.length) return;
      const i = this.rng.pick(free);
      this.jams.set(i, this.addProblem('jam', { inserter: i, x: i.x + 0.5, y: i.y + 0.5 }));
      return;
    }
    // Clog: somewhere on a lane that carries items.
    const lines = this.world.activeLines();
    const line = this.rng.weighted(lines, (l) => l.length * (l.itemCount() > 0 ? 1 : 0.1));
    if (!line) return;
    const lane: 0 | 1 = this.rng.weighted([0, 1] as const, (l) => line.lanes[l].length + 0.1) ?? 0;
    const index = this.rng.int(line.length);
    const pos = index + 0.5;
    line.blocks[lane].push(pos);
    const t = line.tiles[index];
    this.addProblem('clog', { line, lane, pos, x: t.x + 0.5, y: t.y + 0.5 });
  }

  private addProblem(type: ProblemType, where: Partial<Problem> & { x: number; y: number }): Problem {
    const p: Problem = {
      id: this.nextId++,
      type,
      start: this.tick,
      severity: 0,
      growth: 0,
      detected: null,
      detectedBy: null,
      orderAt: null,
      remoteFixAt: null,
      crew: null,
      fixed: false,
      ...where,
    };
    this.problems.push(p);
    this.spawned[type] = (this.spawned[type] ?? 0) + 1;
    return p;
  }

  private detection(p: Problem): string | null {
    const age = (this.tick - p.start) / TICKS_PER_SECOND;
    const conn = this.connected(p.x, p.y);
    const charts = conn && this.covered('charts', p.x, p.y);
    const robot = this.covered('inrobot', p.x, p.y);
    switch (p.type) {
      case 'false-alarm':
        return 'alarm';
      case 'wear':
        if (p.severity >= 1) return 'breakdown';
        if (charts && p.severity >= 0.15) return 'charts';
        if (conn && this.has('asset-data-insights') && p.severity >= 0.3) return 'asset-data-insights';
        if (robot && p.severity >= 0.35) return 'inrobot';
        return null;
      case 'clog':
      case 'jam': {
        if (charts && age >= 1) return 'charts';
        if (robot && age >= 3) return 'inrobot';
        const obvious = (p.type === 'clog' ? 12 : 8) * (conn ? 0.5 : 1);
        return age >= obvious ? 'operator' : null;
      }
      case 'drift':
        return charts && age >= 5 ? 'charts' : null;
    }
  }

  private markDetected(p: Problem, by: string): void {
    p.detected = this.tick;
    p.detectedBy = by;
    p.orderAt = this.tick + (this.has('flows') ? 0 : DISPATCH_DELAY);
    if (by !== 'breakdown' && by !== 'operator' && by !== 'alarm' && by !== 'quality-report') this.detectedEarly++;
    if (this.has('atlas-ai')) {
      if (p.type === 'false-alarm') this.fix(p, 0);
      else if (p.type === 'drift') p.remoteFixAt = this.tick + 5 * TICKS_PER_SECOND;
    }
  }

  private updateProblems(): void {
    const search = this.has('search') && this.tick >= this.nextSearch;
    if (search) this.nextSearch = this.tick + SEARCH_PERIOD;
    let oldestHidden: Problem | null = null;
    for (const p of this.problems) {
      if (p.fixed) continue;
      if (p.type === 'wear' && p.severity < 1 && p.crew?.state !== 'work') {
        p.severity = Math.min(1, p.severity + p.growth);
        if (p.severity >= 1) this.breakdowns++;
      }
      if (p.remoteFixAt !== null && this.tick >= p.remoteFixAt) {
        this.fix(p, 5);
        continue;
      }
      if (p.detected === null) {
        const by = this.detection(p);
        if (by) this.markDetected(p, by);
        else if (p.type !== 'false-alarm' && (!oldestHidden || p.start < oldestHidden.start)) oldestHidden = p;
      }
    }
    if (search && oldestHidden) this.markDetected(oldestHidden, 'search');
  }

  private fix(p: Problem, cost: number): void {
    if (p.fixed) return;
    p.fixed = true;
    this.money -= cost;
    this.repairCost += cost;
    if (p.crew) {
      const c = p.crew;
      c.job = null;
      c.state = 'idle';
      p.crew = null;
    }
    if (p.type === 'wear' && p.machine) this.wear.delete(p.machine);
    if (p.type === 'drift' && p.machine) this.drift.delete(p.machine);
    if (p.type === 'jam' && p.inserter) this.jams.delete(p.inserter);
    if (p.type === 'clog' && p.line) {
      const blocks = p.line.blocks[p.lane!];
      const i = blocks.indexOf(p.pos!);
      if (i >= 0) blocks.splice(i, 1);
    }
  }

  private nextJob(crew: Crew): Problem | null {
    let best: Problem | null = null;
    let bestScore = -Infinity;
    const atlas = this.has('atlas-ai');
    for (const p of this.problems) {
      if (p.fixed || p.crew || p.orderAt === null || p.orderAt > this.tick || p.remoteFixAt !== null) continue;
      const dist = Math.hypot(p.x - crew.x, p.y - crew.y);
      const score = atlas ? impactOf(p) * 10 - dist : -p.orderAt * 10 - dist;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  }

  private updateCrews(): void {
    const speed = CREW_SPEED * (this.has('infield') ? 1.5 : 1);
    for (const c of this.crews) {
      if (c.state === 'idle') {
        const job = this.nextJob(c);
        if (!job) continue;
        c.job = job;
        job.crew = c;
        c.state = 'walk';
      }
      const p = c.job!;
      if (c.state === 'walk') {
        const dx = p.x - c.x;
        const dy = p.y - c.y;
        const d = Math.hypot(dx, dy);
        if (d > speed) {
          c.x += (dx / d) * speed;
          c.y += (dy / d) * speed;
          continue;
        }
        c.x = p.x;
        c.y = p.y;
        const r = repairOf(p);
        let seconds = r.seconds;
        if (p.machine && this.has('asset-data-insights') && this.connected(p.x, p.y)) seconds *= 0.6;
        if (this.knowledgeLoss && !this.has('data-fusion')) seconds *= 1.5;
        c.workLeft = Math.round(seconds * TICKS_PER_SECOND);
        c.workCost = r.cost * (this.has('infield') ? 0.75 : 1);
        c.state = 'work';
      }
      if (c.state === 'work' && --c.workLeft <= 0) this.fix(p, c.workCost);
    }
  }

  private endShift(): void {
    // The quality lab finds drifting sensors from the shift's off-spec output, too late to save it.
    for (const p of this.problems)
      if (p.type === 'drift' && !p.fixed && p.detected === null && this.tick - p.start > 30 * TICKS_PER_SECOND)
        this.markDetected(p, 'quality-report');
    const orders: OrderResult[] = this.orders.map((o) => {
      const delivered = this.deliveredThisShift(o.item);
      return { ...o, delivered, met: delivered >= o.perShift };
    });
    let offSpec = 0;
    for (const c of this.delivered.values()) offSpec += c.off;
    this.reports.push({
      round: this.round,
      orders,
      income: this.income,
      repairCost: this.repairCost,
      spawned: this.spawned,
      detectedEarly: this.detectedEarly,
      breakdowns: this.breakdowns,
      offSpecDelivered: offSpec,
    });
    // Fixed problems are history now.
    const open = this.openProblems();
    this.problems.length = 0;
    this.problems.push(...open);
    if (orders.some((o) => !o.met)) this.strikes++;
    if (this.strikes >= 3) {
      this.phase = 'lost';
      return;
    }
    if (this.round >= this.level.rounds) {
      this.phase = 'won';
      return;
    }
    this.round++;
    this.beginBuild();
  }

  /** Stars for a won level: 3 with no strikes, down to 1. */
  get stars(): number {
    return this.phase === 'won' ? 3 - this.strikes : 0;
  }
}
