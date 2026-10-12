import { ALL_CARDS, CARDS, type CardId } from './cards';
import { TICKS_PER_SECOND, type BeltLine, type Inserter, type Machine } from './factory';
import { THREAT_COST, type BossEvent, type LevelDef, type Order, type ThreatType } from './level';
import { ITEM_VALUE, type ItemName } from './recipes';
import { Rng } from './rng';
import { PROBLEMS, RULE, type ProblemType } from './rules';
import { World } from './world';

export type Phase = 'build' | 'shift' | 'won' | 'lost';
export type { ProblemType } from './rules';

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

/** Crews are named after people at Cognite, hired in this order. */
export const CREW_NAMES = ['Anders', 'Kristoffer', 'Lars', 'Shehan', 'Niek', 'Stein', 'Geir', 'John Markus', 'Petteri', 'Halvard'];

export interface FeedEntry {
  tick: number;
  text: string;
  kind: 'spotted' | 'crew' | 'fixed' | 'wasted' | 'bad' | 'event';
}

/** Who notices a problem, in words. */
const DETECTED_BY: Record<string, string> = {
  breakdown: 'It broke down',
  operator: 'An operator noticed',
  alarm: 'Alarm',
  charts: 'Charts caught',
  inrobot: 'InRobot spotted',
  'asset-data-insights': 'Asset Data Insights caught',
  search: 'Search found',
  'atlas-ai': 'Atlas AI flagged',
};

/** A problem in words: "bearing wear on the iron gear wheel assembler", "a clogged belt". */
export function describe(p: Problem): string {
  const noun = p.type === 'wear' && p.severity >= 1 ? 'a seized bearing' : PROBLEMS[p.type].noun;
  return p.machine ? `${noun} on ${placeOf(p)}` : noun;
}

/** Where a problem is, in words: "the iron gear wheel assembler". */
export function placeOf(p: Problem): string {
  if (p.machine) return machineName(p.machine);
  if (p.inserter) return 'an inserter';
  return 'a belt';
}

/** Numbers for machines that share a name, so "furnace #2" is a specific one. */
const MACHINE_NO = new WeakMap<Machine, number>();

/** A machine in words: "the iron gear wheel assembler", "the iron plate furnace #3" when there are several. */
export function machineName(m: Machine): string {
  const no = MACHINE_NO.get(m);
  return `the ${m.recipe.result.replace(/-/g, ' ')} ${m.isFurnace ? 'furnace' : 'assembler'}${no ? ` #${no}` : ''}`;
}

function numberMachines(machines: Machine[]): void {
  const groups = new Map<string, Machine[]>();
  for (const m of machines) {
    const key = `${m.recipe.result}:${m.isFurnace}`;
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a.y - b.y || a.x - b.x);
    list.forEach((m, i) => (list.length > 1 ? MACHINE_NO.set(m, i + 1) : MACHINE_NO.delete(m)));
  }
}

export interface Crew {
  id: number;
  name: string;
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

/** A player action, enough to replay a game from its seed. */
export type Action = { type: 'buy'; index: number; at?: readonly [number, number] } | { type: 'reroll' } | { type: 'shift' };

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
  wages: number;
  spawned: Partial<Record<ProblemType, number>>;
  detectedEarly: number;
  breakdowns: number;
  offSpecDelivered: number;
  /** Problems still open and unnoticed when the shift ended. */
  hidden: number;
  /** Repairs per crew member this shift. */
  fixesBy: Record<string, number>;
  /** Worn bearings replaced before they seized. */
  predictive: number;
  /** Who spotted the problems found this shift: operators, Charts, breakdowns... */
  spottedBy: Record<string, number>;
  /** Game tick the shift started, to pick its entries out of the feed. */
  startTick: number;
}

/** Cards that help against each threat, used to make sure a new threat comes with an answer. */
const COUNTERS: Record<ThreatType | BossEvent['type'], CardId[]> = {
  wear: ['charts', 'asset-data-insights', 'inrobot', 'maintain'],
  clog: ['charts', 'inrobot', 'flows'],
  jam: ['charts', 'inrobot', 'flows'],
  drift: ['charts', 'search'],
  flood: ['atlas-ai'],
  trip: ['simulators'],
  'knowledge-loss': ['data-fusion'],
};

/** Paid per crew at the end of every shift. */
export const CREW_WAGE = RULE.crewWage;
const CREW_PRICE_STEP = RULE.crewPriceStep;

const DISPATCH_DELAY = RULE.dispatchDelay * TICKS_PER_SECOND;
const CREW_SPEED = RULE.crewSpeed / TICKS_PER_SECOND;
const SEARCH_PERIOD = RULE.searchPeriod * TICKS_PER_SECOND;
/** New equipment is commissioned (run without problems or deliveries) before its first shift. */
const COMMISSION_SECONDS = 60;

/** Repair time in seconds and cost, by problem. */
function repairOf(p: Problem): { seconds: number; cost: number } {
  const r = PROBLEMS[p.type].repair;
  return p.type === 'wear' && p.severity >= 1 && r.late ? r.late : r;
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
  /** Every successful action, in order. `Game.replay` rebuilds the same state from it. */
  readonly log: Action[] = [];
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
  private fixesBy: Record<string, number> = {};
  private spottedBy: Record<string, number> = {};
  private predictive = 0;
  /** What happened this level, newest last, for the in-game feed: spotted, dispatched, fixed, broken. */
  readonly feed: FeedEntry[] = [];
  private breakdowns = 0;
  private wear = new Map<Machine, Problem>();
  private drift = new Map<Machine, Problem>();
  private jams = new Map<Inserter, Problem>();

  constructor(
    readonly level: LevelDef,
    readonly seed: number,
  ) {
    this.rng = new Rng(seed);
    level.build(this.world);
    this.world.finish();
    this.money = level.startMoney;
    for (let i = 0; i < level.crews; i++) this.addCrew();
    this.beginBuild();
  }

  /** Rebuilds a game from its seed and action log, ending in the build phase after the last action. */
  static replay(level: LevelDef, seed: number, actions: readonly Action[]): Game {
    const g = new Game(level, seed);
    for (const a of actions) {
      if (a.type === 'buy') g.buy(a.index, a.at);
      else if (a.type === 'reroll') g.reroll();
      else g.runShift();
    }
    return g;
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

  /** Off-spec items of this type shipped this shift; they earn nothing. */
  offSpecThisShift(item: ItemName): number {
    return this.delivered.get(item)?.off ?? 0;
  }

  /** What the player sees about the next shift. Without Simulators only the count is known. */
  forecast(): { count: number; threats: { type: ThreatType; second: number }[] | null; events: BossEvent[] } {
    return {
      count: this.plan.length,
      threats: this.has('simulators') ? this.plan.map((t) => ({ type: t.type, second: Math.round(t.second) })).sort((a, b) => a.second - b.second) : null,
      events: this.events,
    };
  }

  /** Seconds until power is back after a plant trip, or 0. */
  tripLeft(): number {
    return Math.max(0, (this.tripUntil - this.tick) / TICKS_PER_SECOND);
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
    numberMachines(this.world.machines.filter((m) => this.world.active(m)));
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

  /** Builds a 3-card offer. A reroll skips the guaranteed cards and shows unseen cards first. */
  private makeOffer(reroll = false): void {
    const pool = ALL_CARDS.filter((c) => this.eligible(c));
    const offer: CardId[] = [];
    if (reroll) {
      const unseen = pool.filter((c) => !this.offer.includes(c));
      while (offer.length < 3 && offer.length < unseen.length) {
        const c = this.rng.pick(unseen);
        if (!offer.includes(c)) offer.push(c);
      }
      while (offer.length < 3 && offer.length < pool.length) {
        const c = this.rng.pick(pool);
        if (!offer.includes(c)) offer.push(c);
      }
      this.offer = offer;
      return;
    }
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

  /** Card price; each extra crew costs more to hire than the last. */
  priceOf(card: CardId): number {
    const base = CARDS[card].price;
    return card === 'crew' ? base + CREW_PRICE_STEP * (this.owned.get('crew') ?? 0) : base;
  }

  rerollCost(): number {
    return 10 + 5 * this.rerolls;
  }

  /** A reroll only makes sense when some eligible card isn't already on offer. */
  canReroll(): boolean {
    return this.phase === 'build' && ALL_CARDS.some((c) => this.eligible(c) && !this.offer.includes(c));
  }

  reroll(): boolean {
    if (!this.canReroll() || this.money < this.rerollCost()) return false;
    this.money -= this.rerollCost();
    this.rerolls++;
    this.log.push({ type: 'reroll' });
    this.makeOffer(true);
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
    if ((card === 'charts' || card === 'inrobot') && !this.connected(x + size / 2, y + size / 2))
      return `${def.name} must sit where Data Fusion connects: inside a hub or extractor range`;
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
    const price = this.priceOf(card);
    if (this.money < price) return 'Not enough money';
    if (def.placed) {
      if (!at) return 'Choose where to place it';
      const err = this.placementError(card, at[0], at[1]);
      if (err) return err;
      const { size, radius } = def.placed;
      const uid = this.nextId++;
      this.world.claim(at[0], at[1], size, uid);
      this.placed.push({ uid, card, x: at[0], y: at[1], size, radius, cx: at[0] + size / 2, cy: at[1] + size / 2 });
    }
    this.log.push({ type: 'buy', index, at });
    this.money -= price;
    this.owned.set(card, (this.owned.get(card) ?? 0) + 1);
    this.spendLog.push({ round: this.round, card, price });
    this.offer.splice(index, 1);
    if (card === 'crew') this.addCrew();
    if (card === 'canvas') this.rootCauseAnalysis();
    return null;
  }

  private addCrew(): void {
    const [x, y] = this.level.depot;
    const n = this.crews.length;
    const name = CREW_NAMES[n % CREW_NAMES.length] + (n >= CREW_NAMES.length ? ` ${Math.floor(n / CREW_NAMES.length) + 1}` : '');
    this.crews.push({ id: this.nextId++, name, x, y, job: null, state: 'idle', workLeft: 0, workCost: 0 });
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
    this.rca.set(best, (this.rca.get(best) ?? 1) * RULE.canvasRate);
    const name = best === 'flood' ? 'Alarm floods' : PROBLEMS[best].name;
    this.note('event', `Industrial Canvas: root cause found. ${name} will happen ${Math.round((1 - RULE.canvasRate) * 100)}% less often.`);
    this.makePlan();
  }

  private makePlan(): void {
    let budget = this.level.threatBudget(this.round) * (this.level.difficulty ?? 1);
    const types = (Object.entries(this.level.threats) as [ThreatType, { weight: number; from: number }][]).filter(
      ([, v]) => v.from <= this.round,
    );
    const plan: PlannedThreat[] = [];
    const planRng = new Rng(Math.floor(this.rng.next() * 2 ** 31));
    for (;;) {
      const affordable = types.filter(([t]) => THREAT_COST[t] <= budget + 1e-9);
      const pick = planRng.weighted(affordable, ([, v]) => v.weight);
      if (!pick) break;
      budget -= THREAT_COST[pick[0]];
      // A root-caused threat is prevented outright some of the time; its budget is not spent elsewhere.
      if (planRng.next() >= (this.rca.get(pick[0]) ?? 1)) continue;
      plan.push({ type: pick[0], second: planRng.range(3, this.level.shiftSeconds * 0.8) });
    }
    plan.sort((a, b) => a.second - b.second);
    this.plan = plan;
  }

  // ---- Shift -----------------------------------------------------------------

  startShift(): void {
    if (this.phase !== 'build') return;
    this.log.push({ type: 'shift' });
    this.phase = 'shift';
    this.shiftTick = 0;
    this.delivered.clear();
    this.income = 0;
    this.repairCost = 0;
    this.spawned = {};
    this.detectedEarly = 0;
    this.fixesBy = {};
    this.spottedBy = {};
    this.predictive = 0;
    this.breakdowns = 0;
    this.nextSearch = this.tick + SEARCH_PERIOD;
    if (this.has('maintain')) {
      // Planned maintenance replaces worn bearings on connected machines at the early-repair cost.
      // A seized machine still needs a crew to rebuild it.
      const worn = this.openProblems().filter((p) => p.type === 'wear' && p.severity < 1 && this.connected(p.x, p.y));
      for (const p of worn) this.fix(p, PROBLEMS.wear.repair.cost);
      if (worn.length) this.note('fixed', `Cognite Maintain: planned maintenance replaced ${worn.length} worn bearing${worn.length === 1 ? '' : 's'} before the shift.`);
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
      this.note('event', e.type === 'trip' ? 'Plant trip! Everything stops until power is restored. Bearings stop wearing while it is down.' : 'Knowledge loss: an experienced operator retired. Repairs on equipment Data Fusion does not connect now take 50% longer.');
      if (e.type === 'trip') this.tripUntil = this.tick + RULE.tripSeconds * (this.has('simulators') ? RULE.simulatorsTrip : 1) * TICKS_PER_SECOND;
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
        return w.severity >= RULE.wearSlowAt ? RULE.wearSlowSpeed : 1;
      },
      (m) => (this.drift.has(m) ? RULE.driftOffSpec : 0),
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

  /** Who spots a hidden problem this tick, if anyone, following PROBLEMS in rules.ts. */
  private detection(p: Problem): string | null {
    const rule = PROBLEMS[p.type];
    if (p.type === 'false-alarm') return 'alarm';
    if (p.type === 'wear' && p.severity >= 1) return 'breakdown';
    const age = (this.tick - p.start) / TICKS_PER_SECOND;
    const progress = p.type === 'wear' ? p.severity : age;
    const conn = this.connected(p.x, p.y);
    for (const { by, at } of rule.spot) {
      if (progress < at) continue;
      // InRobot inspects in person; the others read data, so the equipment must be connected.
      const ok = by === 'inrobot' ? this.covered('inrobot', p.x, p.y) : conn && (by === 'charts' ? this.covered('charts', p.x, p.y) : this.has(by));
      if (ok) return by;
    }
    if (rule.operatorAt !== null && progress >= rule.operatorAt * (conn && rule.connectedHelpsOperators ? RULE.connectedOperator : 1)) return 'operator';
    return null;
  }

  private fixText(c: Crew, p: Problem): string {
    if (p.type === 'false-alarm') return `${c.name} checked the alarm on ${placeOf(p)}: nothing wrong. Time wasted.`;
    if (p.type === 'wear') {
      const { late } = PROBLEMS.wear.repair;
      if (p.severity >= 1) return `${c.name} rebuilt the seized ${placeOf(p).replace(/^the /, '')}. That took ${late!.seconds} s.`;
      return `${c.name} replaced a worn bearing on ${placeOf(p)} before it seized. Predictive maintenance!`;
    }
    return `${c.name} fixed ${describe(p)}.`;
  }

  private note(kind: FeedEntry['kind'], text: string): void {
    this.feed.push({ tick: this.tick, text, kind });
    if (this.feed.length > 200) this.feed.splice(0, 100);
  }

  private markDetected(p: Problem, by: string): void {
    p.detected = this.tick;
    p.detectedBy = by;
    if (p.type !== 'false-alarm') this.spottedBy[by] = (this.spottedBy[by] ?? 0) + 1;
    if (p.type === 'false-alarm') this.note('spotted', `Alarm on ${placeOf(p)}. Could be nothing.`);
    else if (by === 'breakdown') this.note('bad', `${placeOf(p).replace(/^./, (c) => c.toUpperCase())} seized: ${PROBLEMS[p.type].noun}.`);
    else this.note('spotted', `${DETECTED_BY[by] ?? by} ${describe(p)}.`);
    p.orderAt = this.tick + (this.has('flows') ? 0 : DISPATCH_DELAY);
    if (by !== 'breakdown' && by !== 'operator' && by !== 'alarm') this.detectedEarly++;
    // Atlas AI works on plant data, so only on connected equipment.
    if (this.has('atlas-ai') && this.connected(p.x, p.y)) {
      if (p.type === 'false-alarm') {
        this.note('fixed', `Atlas AI dismissed a false alarm on ${placeOf(p)}.`);
        this.fix(p, 0);
      }
      else if (p.type === 'drift') p.remoteFixAt = this.tick + RULE.atlasRecalibrate * TICKS_PER_SECOND;
    }
  }

  private updateProblems(): void {
    const search = this.has('search') && this.tick >= this.nextSearch;
    if (search) this.nextSearch = this.tick + SEARCH_PERIOD;
    let oldestHidden: Problem | null = null;
    for (const p of this.problems) {
      if (p.fixed) continue;
      if (p.type === 'wear' && p.severity < 1 && p.crew?.state !== 'work' && this.tick >= this.tripUntil) {
        p.severity = Math.min(1, p.severity + p.growth);
        if (p.severity >= 1) {
          this.breakdowns++;
          if (p.detected !== null) this.note('bad', `${placeOf(p).replace(/^./, (c) => c.toUpperCase())} broke down. The repair now takes much longer.`);
        }
      }
      if (p.remoteFixAt !== null && this.tick >= p.remoteFixAt) {
        this.note('fixed', `Atlas AI recalibrated the drifting sensor on ${placeOf(p)} remotely.`);
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
    const speed = CREW_SPEED * (this.has('infield') ? RULE.infieldSpeed : 1);
    for (const c of this.crews) {
      if (c.state === 'idle') {
        const job = this.nextJob(c);
        if (!job) continue;
        c.job = job;
        job.crew = c;
        c.state = 'walk';
        this.note('crew', `${c.name} is heading to ${describe(job)}.`);
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
        if (p.machine && this.has('asset-data-insights') && this.connected(p.x, p.y)) seconds *= RULE.adiRepair;
        if (this.knowledgeLoss && !this.connected(p.x, p.y)) seconds *= RULE.knowledgeLoss;
        c.workLeft = Math.round(seconds * TICKS_PER_SECOND);
        c.workCost = r.cost * (this.has('infield') ? RULE.infieldCost : 1);
        c.state = 'work';
      }
      if (c.state === 'work' && --c.workLeft <= 0) {
        this.note(p.type === 'false-alarm' ? 'wasted' : 'fixed', this.fixText(c, p));
        if (p.type === 'wear' && p.severity < 1) this.predictive++;
        this.fixesBy[c.name] = (this.fixesBy[c.name] ?? 0) + 1;
        this.fix(p, c.workCost);
      }
    }
  }

  private endShift(): void {
    const wages = CREW_WAGE * this.crews.length;
    this.money -= wages;
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
      wages,
      spawned: this.spawned,
      detectedEarly: this.detectedEarly,
      breakdowns: this.breakdowns,
      offSpecDelivered: offSpec,
      hidden: this.openProblems().filter((p) => p.detected === null).length,
      fixesBy: this.fixesBy,
      spottedBy: this.spottedBy,
      predictive: this.predictive,
      startTick: this.tick - this.shiftTick,
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
