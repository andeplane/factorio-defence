import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { TILE_PX } from '../engine/Camera';
import { Engine } from '../engine/Engine';
import { prototypeKeys, type Direction, type Entity, type EntityPrototype } from '../engine/Entities';
import { FactoryView, factoryViewKeys } from '../engine/FactoryView';
import { expandKey, orientationOf, SpriteStack } from '../engine/SpriteStack';
import { valueNoise } from '../engine/TileMap';
import { CARDS, cardText, type CardId } from '../sim/cards';
import { DIR_VEC, TICKS_PER_SECOND, type Machine } from '../sim/factory';
import { greedyBot } from '../sim/bots';
import { Game, describe, type ShiftReport } from '../sim/game';
import { LEVELS } from '../sim/levels';
import type { LevelDef } from '../sim/level';
import { PROBLEMS, RULE, SPOTTER_NAME, spotWhen, type ProblemType, type Spotter } from '../sim/rules';
import { snapshot } from '../sim/snapshot';
import { beltCurveFrom } from './belts';
import { ITEM_NAMES, PROTOTYPES, TILE_NAMES } from './prototypes';

const proto = (name: string): EntityPrototype => PROTOTYPES.find((p) => p.name === name)!;

const STAR_KEY = 'factorio-defence-stars';

function loadStars(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(STAR_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

function saveStars(levelId: string, stars: number): void {
  try {
    const all = loadStars();
    all[levelId] = Math.max(all[levelId] ?? 0, stars);
    localStorage.setItem(STAR_KEY, JSON.stringify(all));
  } catch {
    // Stars just won't persist.
  }
}

function generateTile(x: number, y: number): number {
  const n = valueNoise(x / 24, y / 24, 1) * 0.7 + valueNoise(x / 7, y / 7, 2) * 0.3;
  if (n > 0.7) return 2;
  if (n > 0.58) return 1;
  return 0;
}

const ITEM_LABEL: Record<string, string> = {
  'iron-gear-wheel': 'Iron gears',
  'copper-cable': 'Copper cable',
  'electronic-circuit': 'Circuits',
  'automation-science-pack': 'Red science',
  'logistic-science-pack': 'Green science',
  inserter: 'Inserters',
  'transport-belt': 'Transport belts',
};

/** Problem names short enough for a label on the map. */


/** Shift speeds, also on keys 1, 2 and 3. */
const SPEEDS = [1, 2, 4];

const itemLabel = (item: string) => ITEM_LABEL[item] ?? item.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** Problem and threat names, all from the rules table. Threats are what the forecast lists. */
const PROBLEM_LABEL: Record<string, string> = {
  ...Object.fromEntries(Object.entries(PROBLEMS).map(([k, v]) => [k, v.name])),
  flood: 'Alarm flood',
};

/** Who spotted a problem, for the shift report. */
const SPOTTED_NAME: Record<string, string> = {
  operator: 'operators',
  breakdown: 'breakdowns',
  search: 'Search',
  ...SPOTTER_NAME,
};

/** The problem types a level can throw, for its card texts. */
const levelProblems = (level: LevelDef): ProblemType[] =>
  Object.keys(level.threats).map((t) => (t === 'flood' ? 'false-alarm' : t) as ProblemType);

/** The label on a problem: "Bearing wear 40%", "Seized: bearing wear", "Clogged belt". */
function problemLabel(type: string, severity: number): string {
  if (type !== 'wear') return PROBLEM_LABEL[type];
  return severity >= 1 ? 'Seized: bearing wear' : `Bearing wear ${Math.round(severity * 100)}%`;
}

const CARD_COLOR: Partial<Record<CardId, number>> = {
  extractor: 0x4fc3f7,
  charts: 0x7cb342,
  inrobot: 0xffb300,
};

/** Colour multiplier for unconnected equipment. */
const OFFLINE_TINT = 0x9aa3b4;

const CARD_BADGE: Partial<Record<CardId, string>> = { extractor: 'EX', charts: 'CH', inrobot: 'IR' };

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/** Mirrors a Game's factory into the engine's entities and draws everything the sim knows on top. */
type CrewAnim = 'idle' | 'running' | 'mining_with_tool';

/** The Factorio character's layers for a crew animation: body, colour mask, shadow. */
const crewLayers = (anim: CrewAnim) => [`character/${anim}/shadow/dir/{dir}`, `character/${anim}/dir/{dir}`, `character/${anim}/2/dir/{dir}`];
const CREW_ANIMS: CrewAnim[] = ['idle', 'running', 'mining_with_tool'];

/** Where each crew member stands relative to its sim position, in tiles, so no two overlap. */
const CREW_OFFSETS: [number, number][] = [[0, 0], [0.9, 0.3], [-0.9, 0.3], [0.5, -0.8], [-0.5, -0.8], [0, 1], [1.4, -0.5], [-1.4, -0.5], [1.3, 1.1], [-1.3, 1.1]];

/** One player colour per crew member, in hiring order: hues a golden angle apart, so neighbours differ. */
const CREW_COLORS = Array.from({ length: 18 }, (_, i) => hsl((30 + i * 137.508) % 360, i % 2 ? 0.55 : 0.75, i % 3 === 2 ? 0.45 : 0.58));

function hsl(h: number, s: number, l: number): number {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}

class LevelScene {
  readonly game: Game;
  private readonly view: FactoryView;
  private readonly mirrored = new Map<object, Entity | null>();
  private readonly fog = new Graphics();
  private readonly marks = new Graphics();
  private readonly labels = new Container();
  private readonly ghost = new Graphics();
  /** InRobot's inspection robots, by placed card uid. */
  private readonly robots = new Map<number, Sprite>();
  private readonly robotLayer = new Container();
  private fogStamp = '';
  /** Entities not connected to Data Fusion, drawn greyed out. */
  private readonly offline = new Set<Entity>();
  /** Crew members drawn as the Factorio character, by name. */
  private readonly crewSprites = new Map<string, { state: CrewAnim; stack: SpriteStack; x: number; y: number; orientation: number }>();

  constructor(
    private readonly engine: Engine,
    level: LevelDef,
    seed: number,
  ) {
    this.game = new Game(level, seed);
    this.view = new FactoryView(engine.assets, engine.entities, engine.itemLayer, engine.highLayer, (belt) =>
      beltCurveFrom(belt, engine.entities),
    );
    engine.overlay.addChild(this.fog, this.marks, this.robotLayer, this.labels, this.ghost);
    this.sync();
  }

  destroy(): void {
    for (const e of this.mirrored.values()) if (e) this.engine.entities.remove(e);
    this.mirrored.clear();
    for (const c of this.crewSprites.values()) c.stack.destroy();
    this.crewSprites.clear();
    for (const g of [this.fog, this.marks, this.robotLayer, this.labels, this.ghost]) g.destroy({ children: true });
    this.robots.clear();
    this.view.render({ beltItems: [], inserters: [], machines: [] });
  }

  /** Places newly built entities and removes retired ones, after each stage change or purchase. */
  sync(): void {
    const w = this.game.world;
    const ents = this.engine.entities;
    const add = (key: object, name: string, x: number, y: number, dir: Direction = 'north') => {
      if (!this.mirrored.has(key)) this.mirrored.set(key, ents.place(proto(name), x, y, dir));
    };
    const drop = (key: object) => {
      const e = this.mirrored.get(key);
      if (e) ents.remove(e);
      this.mirrored.delete(key);
    };
    for (const line of w.lines) {
      if (!w.active(line)) continue;
      line.tiles.forEach((t) => add(t, 'transport-belt', t.x, t.y, t.dir));
      if (line.sink) {
        const last = line.tiles[line.length - 1];
        const [dx, dy] = DIR_VEC[last.dir];
        add(line, 'wooden-chest', last.x + dx, last.y + dy);
      }
    }
    for (const m of w.machines) if (w.active(m)) add(m, m.isFurnace ? 'stone-furnace' : 'assembling-machine-1', m.x, m.y);
    for (const s of w.sources) if (w.active(s)) add(s, 'electric-mining-drill', s.x, s.y, s.dir);
    for (const i of w.inserters) {
      if (w.active(i)) add(i, 'inserter', i.x, i.y, i.dir);
      else if (this.mirrored.has(i)) drop(i);
    }
    for (const c of this.game.placed) if (c.card === 'data-fusion') add(c, 'radar', c.x, c.y);
  }

  /** One frame: hand the sim state to the factory view and redraw the overlays. */
  render(time: number): void {
    const snap = snapshot(this.game);
    this.view.render(snap);
    this.drawFog();
    const g = this.marks;
    g.clear();
    this.labels.removeChildren().forEach((c) => c.destroy());
    // Cards that are not entities: a badge on their footprint and a faint range ring.
    for (const c of this.game.placed) {
      const color = CARD_COLOR[c.card];
      if (color === undefined) {
        g.circle(c.cx * TILE_PX, c.cy * TILE_PX, c.radius * TILE_PX).stroke({ color: 0x4fc3f7, alpha: 0.25, width: 2 });
        continue;
      }
      g.circle(c.cx * TILE_PX, c.cy * TILE_PX, c.radius * TILE_PX).stroke({ color, alpha: 0.25, width: 2 });
      if (c.card === 'inrobot') {
        this.drawRobot(c, time);
        continue;
      }
      g.roundRect(c.x * TILE_PX + 3, c.y * TILE_PX + 3, c.size * TILE_PX - 6, c.size * TILE_PX - 6, 6).fill({ color, alpha: 0.9 });
      this.label(CARD_BADGE[c.card] ?? '', c.cx, c.cy, 0x101010, 12);
    }
    // Problems the plant knows about: a pulsing alert. Hidden ones show only through their effects.
    const pulse = 0.6 + 0.4 * Math.sin(time / 150);
    for (const p of snap.problems) {
      if (!p.detected) continue;
      const x = p.x * TILE_PX;
      const y = p.y * TILE_PX;
      const color = p.type === 'false-alarm' ? 0xffd54f : p.type === 'wear' && p.severity >= 1 ? 0xff1744 : 0xff7043;
      g.circle(x, y - 10, 11).fill({ color, alpha: pulse }).stroke({ color: 0x1b1b1b, width: 2 });
      this.label('!', p.x, p.y - 10 / TILE_PX, 0x1b1b1b, 15);
      const name = problemLabel(p.type, p.severity);
      this.label(name + (p.crew === 'work' ? ' · crew working' : p.crew === 'walk' ? ' · crew coming' : ''), p.x, p.y - 30 / TILE_PX, 0xffffff, 12, true);
      if (p.type === 'wear' && p.severity < 1) {
        g.rect(x - 16, y + 6, 32, 5).fill({ color: 0x1b1b1b });
        g.rect(x - 16, y + 6, 32 * p.severity, 5).fill({ color: 0xff7043 });
      }
    }
    // Crews share spots (the depot, a machine with two problems), so each stands at its own offset
    // from the sim position, and labels that would overlap are pushed down a line.
    const placedLabels: { x: number; y: number }[] = [];
    for (const [i, c] of snap.crews.entries()) {
      const [ox, oy] = CREW_OFFSETS[i % CREW_OFFSETS.length];
      const pos = { ...c, x: c.x + ox, y: c.y + oy };
      this.drawCrew(pos, CREW_COLORS[i % CREW_COLORS.length]);
      const doing = c.state === 'idle' ? 'waiting for a work order' : `${c.state === 'walk' ? 'going to' : 'fixing'} ${PROBLEM_LABEL[c.job!].toLowerCase()}`;
      // At work the crew stands on the problem, whose bar sits just below it, so drop the name lower.
      let ly = pos.y + (c.state === 'work' ? 26 : 14) / TILE_PX;
      while (placedLabels.some((l) => Math.abs(l.x - pos.x) < 5 && Math.abs(l.y - ly) < 0.5)) ly += 0.5;
      placedLabels.push({ x: pos.x, y: ly });
      this.label(`${c.name} · ${doing}`, pos.x, ly, 0xfff3e0, 12, true);
    }
  }

  /**
   * InRobot: a charging pad, and a robot that patrols its range, hovering with its shadow below it,
   * the way a Factorio construction robot flies.
   */
  private drawRobot(c: { uid: number; x: number; y: number; cx: number; cy: number; size: number; radius: number }, time: number): void {
    const g = this.marks;
    const px = c.x * TILE_PX;
    const py = c.y * TILE_PX;
    const side = c.size * TILE_PX;
    g.roundRect(px + 4, py + 4, side - 8, side - 8, 5).fill({ color: 0x3a3d42 }).stroke({ color: 0x1b1b1b, width: 2 });
    for (let i = 0; i < 4; i++) g.rect(px + 8 + i * ((side - 16) / 4), py + side - 11, (side - 16) / 8, 4).fill({ color: 0xffb300 });
    g.circle(c.cx * TILE_PX, c.cy * TILE_PX, 4).fill({ color: 0x66bb6a, alpha: 0.5 + 0.5 * Math.sin(time / 300) });
    const tex = this.engine.assets.animation('icon/construction-robot')?.frames[0];
    let robot = this.robots.get(c.uid);
    if (!robot) {
      robot = new Sprite(tex);
      robot.visible = tex !== undefined;
      robot.anchor.set(0.5);
      robot.width = robot.height = TILE_PX * 0.9;
      this.robotLayer.addChild(robot);
      this.robots.set(c.uid, robot);
    }
    // A slow loop around the pad, out to half the range, with a gentle bob.
    const a = time / 4000 + c.uid;
    const r = Math.min(4, c.radius * 0.5) * (0.75 + 0.25 * Math.sin(time / 2300 + c.uid));
    const gx = (c.cx + Math.cos(a) * r) * TILE_PX;
    const gy = (c.cy + Math.sin(a) * r * 0.8) * TILE_PX;
    g.ellipse(gx, gy, 9, 4).fill({ color: 0x000000, alpha: 0.3 });
    const hover = 22 + Math.sin(time / 350) * 3;
    robot.position.set(gx, gy - hover);
    // Without the Factorio sprites, a simple drone shape.
    if (!tex) g.ellipse(gx, gy - hover, 9, 6).fill({ color: 0xcfd8dc }).stroke({ color: 0x1b1b1b, width: 2 }).circle(gx, gy - hover, 2.5).fill({ color: 0xffb300 });
  }

  /** Moves a crew member's character sprite, switching between idle, running and repairing. */
  private drawCrew(c: { name: string; x: number; y: number; state: 'idle' | 'walk' | 'work' }, color: number): void {
    const anim: CrewAnim = c.state === 'walk' ? 'running' : c.state === 'work' ? 'mining_with_tool' : 'idle';
    let s = this.crewSprites.get(c.name);
    if (s && (Math.abs(c.x - s.x) > 1e-4 || Math.abs(c.y - s.y) > 1e-4)) s.orientation = orientationOf(c.x - s.x, c.y - s.y);
    if (!s || s.state !== anim) {
      s?.stack.destroy();
      const stack = new SpriteStack(
        this.engine.assets,
        crewLayers(anim),
        8,
        this.engine.entities.shadowLayer,
        this.engine.entities.objectLayer,
        new Set(),
        color,
      );
      s = { state: anim, stack, x: c.x, y: c.y, orientation: s?.orientation ?? 0.5 };
      this.crewSprites.set(c.name, s);
    }
    s.x = c.x;
    s.y = c.y;
    s.stack.setPosition(c.x * TILE_PX, c.y * TILE_PX, c.y + 0.5);
    s.stack.update(this.engine.animationTick, s.orientation);
  }

  private label(text: string, x: number, y: number, color: number, size: number, outline = false): void {
    const style = { fill: color, fontSize: size, fontWeight: 'bold' as const, fontFamily: 'system-ui, sans-serif', ...(outline ? { stroke: { color: 0x1b1b1b, width: 3 } } : {}) };
    const t = new Text({ text, style });
    t.anchor.set(0.5);
    t.position.set(x * TILE_PX, y * TILE_PX);
    this.labels.addChild(t);
  }

  /**
   * Equipment Data Fusion does not connect is drawn in a cold, washed-out grey: its data stays in a
   * silo. It regains its colours once a hub or extractor connects it.
   */
  private drawFog(): void {
    const stamp = this.game.placed.map((p) => p.uid).join(',') + ':' + this.game.stage;
    if (stamp !== this.fogStamp) {
      this.fogStamp = stamp;
      this.offline.clear();
      for (const e of this.mirrored.values())
        if (e && !this.game.connected(e.x + e.width / 2, e.y + e.height / 2)) this.offline.add(e);
    }
    for (const e of this.mirrored.values()) e?.stack?.setTint(e && this.offline.has(e) ? OFFLINE_TINT : null);
  }

  /** Draws where a placed card would go and its range; returns whether it may go there. */
  drawGhost(card: CardId | null, x: number, y: number): boolean {
    const g = this.ghost;
    g.clear();
    if (!card) return false;
    const def = CARDS[card].placed!;
    const ok = this.game.placementError(card, x, y) === null;
    const color = ok ? 0x66bb6a : 0xef5350;
    g.rect(x * TILE_PX, y * TILE_PX, def.size * TILE_PX, def.size * TILE_PX).fill({ color, alpha: 0.45 });
    g.circle((x + def.size / 2) * TILE_PX, (y + def.size / 2) * TILE_PX, def.radius * TILE_PX)
      .fill({ color, alpha: 0.08 })
      .stroke({ color, alpha: 0.6, width: 2 });
    return ok;
  }
}

/** The game: level select, then a level with its HUD, card shop and shift controls. */
export async function startGame(parent: HTMLElement): Promise<void> {
  const engine = new Engine();
  const loading = document.getElementById('loading');
  const setLoading = (pct: number, text: string) => {
    loading?.style.setProperty('--progress', `${Math.round(pct * 100)}%`);
    const label = loading?.querySelector('.label');
    if (label) label.textContent = text;
  };
  await engine.init({
    onProgress: (done, total) => setLoading(total ? done / total : 1, `Loading sprites ${done} / ${total}`),
    parent,
    tileNames: TILE_NAMES,
    generateTile,
    animationKeys: [
      ...PROTOTYPES.flatMap(prototypeKeys),
      ...factoryViewKeys(ITEM_NAMES),
      ...CREW_ANIMS.flatMap((a) => crewLayers(a).flatMap((k) => expandKey(k, 8))),
      'icon/construction-robot',
    ],
  });

  const ui = el('div', 'ui');
  document.body.appendChild(ui);
  let scene: LevelScene | null = null;
  let speed = 1;
  let paused = false;
  let placing: { slot: number; card: CardId } | null = null;
  /** The offer as shown: a bought card leaves a "Bought" slot instead of closing the gap. */
  let shownOffer: (CardId | null)[] = [];
  /** What the info panel shows: the delivery chest or a machine, picked by clicking it. */
  let inspected: { kind: 'chest' } | { kind: 'machine'; machine: Machine } | null = null;
  let mouse = { x: 0, y: 0 };
  let shownReports = 0;

  const camera = engine.camera;
  const canvas = engine.app.canvas;

  const hoverTile = (size: number) => {
    const w = camera.screenToWorld(mouse.x, mouse.y);
    return { x: Math.floor(w.x / TILE_PX - (size - 1) / 2), y: Math.floor(w.y / TILE_PX - (size - 1) / 2) };
  };

  // ---- Main menu -------------------------------------------------------------

  /** True while a bot plays a plant behind the menus. */
  let demo = false;
  const demoStart = performance.now();

  /** A bot runs Green Science at its final stage behind the menus. */
  function startDemo(): void {
    if (demo && scene) return;
    scene?.destroy();
    const level = LEVELS.find((l) => l.id === 'green-science') ?? LEVELS[0];
    scene = new LevelScene(engine, level, (Date.now() % 1_000_000) + 1);
    const g = scene.game;
    while (g.phase === 'build' && g.stage < level.stages.length) {
      greedyBot.build(g);
      g.runShift();
    }
    demo = true;
    paused = false;
    inspected = null;
    placing = null;
    scene.sync();
    const b = g.world.bounds();
    const fit = Math.min(camera.viewWidth / ((b.maxX - b.minX + 4) * TILE_PX), camera.viewHeight / ((b.maxY - b.minY + 6) * TILE_PX));
    camera.zoomAt(Math.max(0.6, Math.min(1.3, fit * 1.8)) / camera.zoom, camera.viewWidth / 2, camera.viewHeight / 2);
  }

  /** Keeps the menu's plant running: the bot buys cards between shifts and starts the next one. */
  function stepDemo(): void {
    const g = scene!.game;
    if (g.phase === 'won' || g.phase === 'lost') {
      demo = false;
      startDemo();
      return;
    }
    if (g.phase === 'build') {
      greedyBot.build(g);
      g.startShift();
      scene!.sync();
    }
    for (let i = 0; i < 2 && g.phase === 'shift'; i++, engine.timeScale++) g.step();
  }

  /** The level to continue from: the first one without stars. */
  const nextLevel = () => {
    const stars = loadStars();
    return LEVELS.find((l) => !stars[l.id]) ?? LEVELS[LEVELS.length - 1];
  };

  function showMainMenu(): void {
    startDemo();
    ui.replaceChildren();
    const panel = el('div', 'panel mainmenu');
    const played = Object.keys(loadStars()).length > 0;
    const next = nextLevel();
    const play = el('button', 'primary', played ? `Continue: ${LEVELS.indexOf(next) + 1}. ${next.name}` : 'New game');
    play.addEventListener('click', () => startLevel(next));
    const levels = el('button', '', 'Levels');
    levels.addEventListener('click', showLevelSelect);
    const how = el('button', '', 'How to play');
    how.addEventListener('click', showHowToPlay);
    panel.append(
      el('h1', '', 'Factorio Defence'),
      el('p', 'sub', 'Keep the factory running. Problems will come. Cognite helps you see them first.'),
      play,
      levels,
      how,
      el('small', 'credit', 'A fan-made Cognite demo. Factorio graphics © Wube Software, not affiliated.'),
    );
    ui.appendChild(panel);
  }

  function showHowToPlay(): void {
    showModal(
      'How to play',
      `<p>Each level is a plant that has to deliver an order every shift. Miss three orders and the level is lost; fewer misses means more stars.</p>` +
        `<p>During a shift, problems hit machines, belts and inserters. Your crew fixes them, but only once someone has <b>spotted</b> them. ` +
        `Between shifts you buy Cognite products: they connect the plant's data, spot problems early, get crews there faster and prevent problems altogether.</p>` +
        `<p><b>Controls:</b> drag or WASD to pan, mouse wheel to zoom, click a machine or the delivery chest to inspect it. Keys 1, 2, 3 set the shift speed, space pauses, G opens the guide.</p>` +
        guideHtml(LEVELS[LEVELS.length - 1]),
      'Back',
    );
    modal.classList.add('wide');
  }

  // ---- Level select ----------------------------------------------------------

  function showLevelSelect(): void {
    startDemo();
    ui.replaceChildren();
    const stars = loadStars();
    const panel = el('div', 'panel menu');
    panel.append(el('h1', '', 'Factorio Defence'), el('p', 'sub', 'Keep the factory running. Problems will come. Cognite helps you see them first.'));
    const grid = el('div', 'levels');
    LEVELS.forEach((level, i) => {
      const unlocked = i === 0 || (stars[LEVELS[i - 1].id] ?? 0) > 0 || location.search.includes('unlock');
      const b = el('button', 'level' + (unlocked ? '' : ' locked'));
      const s = stars[level.id] ?? 0;
      b.append(el('b', '', `${i + 1}. ${level.name}`), el('span', 'stars', '★'.repeat(s) + '☆'.repeat(3 - s)), el('small', '', level.text), el('small', 'new', `New: ${level.introduces}`));
      b.disabled = !unlocked;
      b.addEventListener('click', () => startLevel(level));
      grid.appendChild(b);
    });
    const back = el('button', '', 'Back');
    back.addEventListener('click', showMainMenu);
    const row = el('div', 'row');
    row.appendChild(back);
    panel.append(grid, row);
    ui.appendChild(panel);
  }

  // ---- Level -----------------------------------------------------------------

  const hud = el('div', 'panel hud');
  const orders = el('div', 'panel orders');
  const shop = el('div', 'panel shop');
  const modal = el('div', 'panel modal');
  const info = el('div', 'panel info');
  const scrim = el('div', 'scrim');
  // The info panel keeps one close button and only rewrites its body when the text changes,
  // so a click on × is never lost to the 10-per-second refresh.
  const infoClose = el('button', 'close', '×');
  infoClose.title = 'Close (Esc)';
  const infoBody = el('div');
  info.append(infoClose, infoBody);
  infoClose.addEventListener('click', () => {
    inspected = null;
    renderInfo();
  });

  /** Fits the plant into the space between the HUD and the shop. Called whenever the shop changes size. */
  function fitCamera(): void {
    if (!scene) return;
    const b = scene.game.world.bounds();
    const below = shop.getBoundingClientRect().height + 20;
    const above = 70;
    const fit = Math.min(
      camera.viewWidth / ((b.maxX - b.minX + 8) * TILE_PX),
      Math.max(80, camera.viewHeight - below - above) / ((b.maxY - b.minY + 3) * TILE_PX),
    );
    camera.zoomAt(Math.max(0.3, Math.min(1.5, fit)) / camera.zoom, camera.viewWidth / 2, camera.viewHeight / 2);
    camera.x = ((b.minX + b.maxX) / 2) * TILE_PX;
    camera.y = ((b.minY + b.maxY) / 2) * TILE_PX + (below - above) / 2 / camera.zoom;
  }

  function startLevel(level: LevelDef): void {
    demo = false;
    scene?.destroy();
    scene = new LevelScene(engine, level, (Date.now() % 1_000_000) + 1);
    shownReports = 0;
    placing = null;
    paused = false;
    inspected = null;
    ui.replaceChildren(hud, orders, shop);
    renderShop();
    fitCamera();
    const stage = level.stages[0];
    const howTo =
      LEVELS.indexOf(level) === 0
        ? `<p>Each round is a shift. Deliver the order to the dock before the shift ends. Miss three orders and the level is lost.</p>` +
          `<p>Problems will hit your machines, belts and inserters. Crews only fix what someone has noticed. ` +
          `Between shifts, buy Cognite cards to see problems sooner and fix them faster. Equipment drawn in cold grey is not connected: nobody has data on it yet. Press G any time for the guide to every problem and its counters.</p>`
        : '';
    showModal(`${level.name}`, `<p>${level.text}</p><p><b>New:</b> ${level.introduces}</p>${howTo}<p><b>${stage.title}.</b> ${stage.text}</p>`, 'Start');
    renderShop();
  }

  function showModal(title: string, html: string, button: string, onClose?: () => void, second?: [string, () => void]): void {
    // A scrim behind the modal keeps the shop and the map from taking clicks meant for it.
    ui.appendChild(scrim);
    modal.classList.remove('wide');
    modal.innerHTML = `<h2>${title}</h2>${html}`;
    const row = el('div', 'row');
    const ok = el('button', 'primary', button);
    ok.addEventListener('click', () => {
      modal.remove();
      scrim.remove();
      onClose?.();
    });
    row.appendChild(ok);
    if (second) {
      const b = el('button', '', second[0]);
      b.addEventListener('click', () => {
        modal.remove();
        scrim.remove();
        second[1]();
      });
      row.appendChild(b);
    }
    modal.appendChild(row);
    ui.appendChild(modal);
  }

  /** The rules of the repair loop, generated from the same table the simulation uses. */
  function guideHtml(level: LevelDef): string {
    const has = (c: CardId) => level.cards.includes(c);
    const card = (c: CardId) => (has(c) ? `<b>${CARDS[c].name}</b>` : `<span class="dim">${CARDS[c].name} (later levels)</span>`);
    const threats = new Set(Object.keys(level.threats).map((t) => (t === 'flood' ? 'false-alarm' : t)));
    const rows = (Object.keys(PROBLEMS) as ProblemType[])
      .map((t) => {
        const r = PROBLEMS[t];
        const spot = r.spot.map((x) => `${card(x.by)} ${spotWhen(t, x.at)}`);
        if (r.connectedHelpsOperators) spot.push(`${card('data-fusion')} halves the time operators take on connected equipment`);
        if (t !== 'false-alarm') spot.push(`${card('search')} turns up the oldest hidden problem every ${RULE.searchPeriod} s`);
        const fix = r.repair.late
          ? `${r.repair.seconds} s and $${r.repair.cost} if caught early; ${r.repair.late.seconds} s and $${r.repair.late.cost} once seized`
          : `${r.repair.seconds} s, $${r.repair.cost}`;
        const extra =
          t === 'wear' ? `<br>Prevent: ${card('maintain')} services connected machines before each shift. ${card('canvas')} makes the most common problem rarer.` :
          t === 'drift' ? `<br>${card('atlas-ai')} recalibrates it remotely ${RULE.atlasRecalibrate} s after it is spotted.` :
          t === 'false-alarm' ? `<br>${card('atlas-ai')} dismisses false alarms so no crew goes out.` : '';
        return (
          `<div class="rule${threats.has(t) ? '' : ' dim'}"><b>${r.name}</b> <small>on ${r.on}${threats.has(t) ? '' : ' · not in this level'}</small>` +
          `<br>${r.what}<br><i>Without Cognite:</i> ${r.unaided}` +
          (spot.length ? `<br><i>Spotted early by:</i> ${spot.join('; ')}.` : '') +
          `<br><i>Crew repair:</i> ${fix}.${extra}</div>`
        );
      })
      .join('');
    return (
      `<p>A problem gets fixed only after it is <b>spotted</b>. A work order then goes out after ${RULE.dispatchDelay} s (${card('flows')}: at once), ` +
      `and the nearest free crew member walks there and <b>fixes</b> it. Crews are the only ones who repair things. ` +
      `More crews (${card('crew')}) means more fixes at once; ${card('infield')} makes them walk faster and repair cheaper.</p>` +
      `<p>Cognite products that read data (Charts, Asset Data Insights, Atlas AI, Maintain) only see equipment <b>connected</b> by a Data Fusion hub or an Extractor. Unconnected equipment is drawn in cold grey and gets its colours back once connected. InRobot inspects in person, so it also sees unconnected equipment, but it reports through Data Fusion. Charts and InRobot must be placed inside a hub's range.</p>` +
      rows +
      `<div class="rule"><b>Events</b><br>` +
      `<b>Plant trip</b>: the power goes and the whole plant stops for ${RULE.tripSeconds} s. Bearings do not wear while it is down. ${card('simulators')} rehearses the restart, so trips last ${Math.round((1 - RULE.simulatorsTrip) * 100)}% less, and shows which problems the next shift brings and when.` +
      `<br><b>Knowledge loss</b>: an experienced operator retires. From then on, repairs on equipment ${card('data-fusion')} does not connect take ${Math.round((RULE.knowledgeLoss - 1) * 100)}% longer.` +
      `<br><b>Alarm flood</b>: false alarms on healthy machines; each one sends a crew out for nothing unless ${card('atlas-ai')} dismisses it.` +
      `<br>${card('canvas')} runs a root cause analysis on the problem seen most so far: it happens ${Math.round((1 - RULE.canvasRate) * 100)}% less often from then on.</div>`
    );
  }

  function showGuide(): void {
    if (!scene) return;
    const wasPaused = paused;
    paused = true;
    showModal('How problems get fixed', guideHtml(scene.game.level), 'Back to the plant', () => {
      paused = wasPaused;
      renderShop();
    });
    modal.classList.add('wide');
  }

  function renderHud(): void {
    if (!scene) return;
    const g = scene.game;
    const strikes = '●'.repeat(g.strikes) + '○'.repeat(3 - g.strikes);
    const phase = g.phase === 'shift' ? `Shift ${Math.ceil((g.shiftTicks - g.shiftTick) / 60)}s left` : 'Between shifts';
    hud.innerHTML =
      `<b>${g.level.name}</b> · Round ${g.round}/${g.level.rounds} · ${phase}` +
      (g.tripLeft() > 0 ? `<br><b class="warn">Plant trip: power back in ${Math.ceil(g.tripLeft())} s</b>` : '') +
      `<br>Money <b${g.money < 0 ? ' class="warn" title="Repairs and wages ran over budget. Buy nothing until income catches up."' : ''}>${g.money < 0 ? '-' : ''}$${Math.abs(Math.floor(g.money))}</b> · Missed orders <span class="strikes">${strikes}</span> · Crew: ${g.crews.map((c) => c.name).join(', ')}`;
    const rows = g.orders
      .map((o) => {
        const got = g.phase === 'shift' ? g.deliveredThisShift(o.item) : 0;
        const pct = Math.min(100, (got / o.perShift) * 100);
        return `<div class="order"><span>${ITEM_LABEL[o.item] ?? o.item}</span><span>${got}/${o.perShift}</span><div class="bar"><i style="width:${pct}%"></i></div></div>`;
      })
      .join('');
    const open = g.openProblems();
    const known = open.filter((p) => p.detected !== null && p.type !== 'false-alarm').length;
    const alarms = open.filter((p) => p.type === 'false-alarm').length;
    const feed = g.feed
      .slice(-5)
      .reverse()
      .map((e) => `<li class="${e.kind}">${e.text}</li>`)
      .join('');
    orders.innerHTML =
      `<b>Order per shift</b>${rows}` +
      `<div class="problems">Known problems: ${known}${alarms ? ` · alarms: ${alarms}` : ''}</div>` +
      (feed ? `<ul class="feed">${feed}</ul>` : '');
    renderInfo();
  }

  /** The info panel for whatever the player clicked, refreshed with the HUD. */
  function renderInfo(): void {
    if (!scene || !inspected) {
      info.remove();
      return;
    }
    const g = scene.game;
    let html: string;
    if (inspected.kind === 'chest') {
      const minutes = g.shiftTick / TICKS_PER_SECOND / 60;
      const last = g.reports[g.reports.length - 1];
      const rows = g.orders
        .map((o) => {
          if (g.phase !== 'shift') {
            const r = last?.orders.find((x) => x.item === o.item);
            return `<li>${itemLabel(o.item)}: ${r ? `${r.delivered}/${o.perShift} last shift` : `0/${o.perShift}`}</li>`;
          }
          const got = g.deliveredThisShift(o.item);
          const off = g.offSpecThisShift(o.item);
          const rate = minutes > 0.05 ? `, ${(got / minutes).toFixed(0)}/min` : '';
          const need = ((o.perShift / g.shiftTicks) * TICKS_PER_SECOND * 60).toFixed(0);
          return `<li>${itemLabel(o.item)}: <b>${got}</b>/${o.perShift}${rate} (need ${need}/min)${off ? `, <span class="warn">${off} off-spec</span>` : ''}</li>`;
        })
        .join('');
      html = `<b>Delivery chest</b><ul>${rows}</ul><small>Every good item here is paid for. Off-spec items earn nothing.</small>`;
    } else {
      const m = inspected.machine;
      const name = m.isFurnace ? 'Stone furnace' : 'Assembling machine';
      const product = itemLabel(m.recipe.result);
      const inputs = [...m.input].map(([item, c]) => `${itemLabel(item)} ${c.good + c.off}`).join(', ');
      const known = g.openProblems().filter((p) => p.machine === m && p.detected !== null);
      const state = g.phase !== 'shift' ? 'Stopped between shifts' : m.working ? 'Working' : '<span class="warn">Idle: waiting for input or blocked</span>';
      const problems = known.length
        ? known.map((p) => `<li class="warn">${problemLabel(p.type, p.severity)}</li>`).join('')
        : '<li>No known problems</li>';
      html =
        `<b>${name}</b> making ${product}` +
        `<ul><li>${state}${g.phase === 'shift' && m.crafting ? `, ${Math.min(99, Math.round((m.progress / m.recipe.time) * 100))}% done` : ''}</li><li>Inputs: ${inputs || 'none'}</li>` +
        `<li>Output waiting: ${m.output.good + m.output.off}</li>${problems}</ul>` +
        `<small>${watchers(m.x + m.size / 2, m.y + m.size / 2)}</small>`;
    }
    if (infoBody.innerHTML !== html) infoBody.innerHTML = html;
    if (!info.isConnected) ui.appendChild(info);
  }

  /** Who would spot a hidden problem on equipment at x, y, in words. */
  function watchers(x: number, y: number): string {
    const g = scene!.game;
    const conn = g.connected(x, y);
    const who = ['operators'];
    const spotters: Spotter[] = ['charts', 'asset-data-insights', 'inrobot'];
    for (const s of spotters) {
      const ok = s === 'inrobot' ? g.covered('inrobot', x, y) : conn && (s === 'charts' ? g.covered('charts', x, y) : g.has(s));
      if (ok) who.push(SPOTTER_NAME[s]);
    }
    if (g.has('search')) who.push('Search');
    const text = `Watching it: ${who.join(', ')}.`;
    return conn ? `Connected to Data Fusion. ${text}` : `<span class="warn">Not connected:</span> Charts and other data apps cannot see it. ${text}`;
  }

  /** The chest or machine under the cursor, if any. */
  function pickAt(): typeof inspected {
    if (!scene) return null;
    const w = scene.game.world;
    const { x, y } = hoverTile(1);
    for (const line of w.lines) {
      if (!line.sink || !w.active(line)) continue;
      const last = line.tiles[line.length - 1];
      const [dx, dy] = DIR_VEC[last.dir];
      if (last.x + dx === x && last.y + dy === y) return { kind: 'chest' };
    }
    for (const m of w.machines) if (w.active(m) && x >= m.x && x < m.x + m.size && y >= m.y && y < m.y + m.size) return { kind: 'machine', machine: m };
    return null;
  }

  function renderShop(): void {
    if (!scene) return;
    const g = scene.game;
    shop.replaceChildren();
    if (g.phase !== 'build') {
      const row = el('div', 'row');
      for (const s of SPEEDS) {
        const b = el('button', speed === s && !paused ? 'active' : '', `${s}x`);
        b.addEventListener('click', () => {
          speed = s;
          paused = false;
          renderShop();
        });
        row.appendChild(b);
      }
      const p = el('button', paused ? 'active' : '', paused ? 'Resume' : 'Pause');
      p.addEventListener('click', () => {
        paused = !paused;
        renderShop();
      });
      row.appendChild(p);
      const guide = el('button', '', 'Guide (G)');
      guide.addEventListener('click', showGuide);
      row.append(guide, menuButton());
      shop.append(el('div', 'title', `${paused ? 'Shift paused' : 'Shift running'} · keys 1, 2, 3 set the speed, space pauses`), row);
      return;
    }
    const f = g.forecast();
    const forecast = f.threats
      ? f.threats.length
        ? f.threats.map((t) => `${PROBLEM_LABEL[t.type] ?? t.type} at ${t.second}s`).join(', ')
        : 'no problems'
      : `${f.count} problem${f.count === 1 ? '' : 's'} expected${g.level.cards.includes('simulators') ? ' (Simulators shows which)' : ''}`;
    const events = f.events.map((e) => (e.type === 'trip' ? `Plant trip at ${e.second}s` : `Knowledge loss: a senior operator retires at ${e.second}s`));
    const head = el('div', 'title');
    head.innerHTML =
      `<div class="loop">A problem gets fixed only after someone <b>spots</b> it. Then a crew is <b>dispatched</b>, walks there and <b>fixes</b> it. ` +
      `Caught early it is quick and cheap; once a machine seizes it is slow and costly. Cognite helps at each step.</div>` +
      `<b>Next shift</b>: ${forecast}${events.length ? `<br><span class="warn">${events.join(' · ')}</span>` : ''}`;
    const cards = el('div', 'cards');
    if (shownOffer.filter((c) => c !== null).join() !== g.offer.join()) shownOffer = [...g.offer];
    const problems = levelProblems(g.level);
    shownOffer.forEach((id, i) => {
      if (id === null) {
        const sold = el('button', 'card', 'Bought');
        sold.disabled = true;
        sold.append(el('small', '', 'You can buy as many cards per round as you can afford.'));
        cards.appendChild(sold);
        return;
      }
      const def = CARDS[id];
      const c = el('button', 'card');
      const price = g.priceOf(id);
      c.disabled = g.money < price;
      c.append(el('b', '', def.name), el('span', 'price', `$${price}`), el('span', 'helps', def.helps), el('small', '', cardText(def, problems)));
      c.addEventListener('click', () => {
        if (def.placed) {
          placing = { slot: i, card: id };
          renderShop();
        } else {
          const err = buyAt(i);
          if (err) flash(err);
          scene!.sync();
          renderShop();
        }
      });
      if (placing?.slot === i) c.classList.add('active');
      cards.appendChild(c);
    });
    const row = el('div', 'row');
    const reroll = el('button', '', `New cards ($${g.rerollCost()})`);
    reroll.disabled = g.money < g.rerollCost() || !g.canReroll();
    if (!g.canReroll()) reroll.title = 'No other cards are available yet';
    reroll.addEventListener('click', () => {
      g.reroll();
      placing = null;
      renderShop();
    });
    const go = el('button', 'primary', 'Start shift');
    go.addEventListener('click', () => {
      placing = null;
      scene!.drawGhost(null, 0, 0);
      g.startShift();
      paused = false;
      renderShop();
      fitCamera();
    });
    const guide = el('button', '', 'Guide (G)');
    guide.addEventListener('click', showGuide);
    row.append(reroll, go, guide, menuButton());
    const owned = [...g.owned.entries()].map(([c, n]) => (n > 1 ? `${CARDS[c].name} x${n}` : CARDS[c].name)).join(', ');
    shop.append(head, cards, row);
    if (placing) shop.append(el('div', 'hint', `Click the map to place ${CARDS[placing.card].name}. Esc cancels.`));
    if (owned) shop.append(el('div', 'owned', `Owned: ${owned}`));
  }

  function menuButton(): HTMLButtonElement {
    const b = el('button', '', 'Menu');
    b.addEventListener('click', () => {
      paused = true;
      showModal('Leave this level?', '<p>Progress in this level is lost.</p>', 'Keep playing', () => (paused = false), ['Main menu', showMainMenu]);
    });
    return b;
  }

  /** Buys the card in a shown offer slot, leaving a "Bought" slot behind. */
  function buyAt(slot: number, at?: [number, number]): string | null {
    const index = shownOffer.slice(0, slot).filter((c) => c !== null).length;
    const err = scene!.game.buy(index, at);
    if (!err) shownOffer[slot] = null;
    return err;
  }

  function flash(text: string): void {
    const t = el('div', 'panel flash', text);
    ui.appendChild(t);
    setTimeout(() => t.remove(), 1800);
  }

  function reportHtml(r: ShiftReport): string {
    const g = scene!.game;
    const rows = r.orders
      .map((o) => `<li>${itemLabel(o.item)}: ${o.delivered}/${o.perShift} ${o.met ? '✓' : '<span class="warn">missed</span>'}</li>`)
      .join('');
    const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
    const lines = [
      `Income $${Math.round(r.income)}, repairs $${Math.round(r.repairCost)}, crew wages $${r.wages}`,
      `${n(r.detectedEarly, 'problem', 'problems')} spotted early by Cognite, ${n(r.breakdowns, 'machine', 'machines')} seized`,
    ];
    const spotted = Object.entries(r.spottedBy).sort((x, y) => y[1] - x[1]);
    if (spotted.length) lines.push('Spotted by: ' + spotted.map(([by, k]) => `${SPOTTED_NAME[by] ?? by} ${k}`).join(', '));
    if (r.predictive) lines.push(`<span class="good">${n(r.predictive, 'worn bearing', 'worn bearings')} replaced before seizing: predictive maintenance</span>`);
    const fixes = Object.entries(r.fixesBy).sort((x, y) => y[1] - x[1]);
    if (fixes.length) lines.push('Repairs finished: ' + fixes.map(([name, k]) => `${name} ${k}`).join(', '));
    if (r.offSpecDelivered) lines.push(`<span class="warn">${n(r.offSpecDelivered, 'off-spec item', 'off-spec items')} shipped and rejected</span>`);
    const known = g.openProblems().filter((p) => p.detected !== null && p.type !== 'false-alarm');
    if (known.length) lines.push(`<span class="warn">Still open: ${known.map((p) => describe(p)).join(', ')}</span>`);
    if (r.hidden) lines.push(`<span class="warn">${n(r.hidden, 'problem is', 'problems are')} still hidden somewhere in the plant</span>`);
    // Events always make the list; the rest of the shift's story fills it up to 8 lines.
    const shift = g.feed.filter((e) => e.tick >= r.startTick && e.kind !== 'crew');
    const keep = new Set([...shift.filter((e) => e.kind === 'event'), ...shift.filter((e) => e.kind !== 'event').slice(-8)]);
    const events = shift
      .filter((e) => keep.has(e))
      .map((e) => `<li class="${e.kind}">${e.text}</li>`)
      .join('');
    return `<ul>${rows}</ul><p>${lines.join('<br>')}</p>${events ? `<b>What happened</b><ul class="feed">${events}</ul>` : ''}`;
  }

  function afterShift(): void {
    if (!scene) return;
    const g = scene.game;
    const r = g.reports[g.reports.length - 1];
    scene.sync();
    renderShop();
    fitCamera();
    if (g.phase === 'won') {
      saveStars(g.level.id, g.stars);
      const next = LEVELS[LEVELS.indexOf(g.level) + 1];
      showModal(
        `Level complete ${'★'.repeat(g.stars)}${'☆'.repeat(3 - g.stars)}`,
        reportHtml(r) + `<p>You kept the plant running with ${g.strikes} missed order${g.strikes === 1 ? '' : 's'}.</p>`,
        next ? 'Next level' : 'Levels',
        () => (next ? startLevel(next) : showLevelSelect()),
        ['Levels', showLevelSelect],
      );
    } else if (g.phase === 'lost') {
      showModal('The plant missed three orders', reportHtml(r), 'Try again', () => startLevel(g.level), ['Levels', showLevelSelect]);
    } else {
      const stage = g.level.stages[g.stage - 1];
      const newStage = stage.round === g.round ? `<p><b>New: ${stage.title}.</b> ${stage.text}</p>` : '';
      showModal(`Shift ${r.round} done`, reportHtml(r) + newStage, 'Continue');
    }
  }

  // ---- Input -----------------------------------------------------------------

  let dragging: { x: number; y: number; moved: number } | null = null;
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
  canvas.addEventListener('pointerdown', (ev) => {
    mouse = { x: ev.offsetX, y: ev.offsetY };
    canvas.setPointerCapture(ev.pointerId);
    if (ev.button === 2 && placing) {
      placing = null;
      renderShop();
      return;
    }
    dragging = { x: ev.clientX, y: ev.clientY, moved: 0 };
  });
  canvas.addEventListener('pointermove', (ev) => {
    mouse = { x: ev.offsetX, y: ev.offsetY };
    if (dragging) {
      const dx = ev.clientX - dragging.x;
      const dy = ev.clientY - dragging.y;
      dragging.moved += Math.abs(dx) + Math.abs(dy);
      camera.panScreen(dx, dy);
      dragging.x = ev.clientX;
      dragging.y = ev.clientY;
    }
  });
  canvas.addEventListener('pointerup', () => {
    const click = dragging && dragging.moved < 6;
    dragging = null;
    if (click && placing && scene) {
      const size = CARDS[placing.card].placed!.size;
      const t = hoverTile(size);
      const err = buyAt(placing.slot, [t.x, t.y]);
      if (err) flash(err);
      else {
        placing = null;
        scene.drawGhost(null, 0, 0);
        scene.sync();
      }
      renderShop();
    } else if (click && scene && !demo) {
      inspected = pickAt();
      renderInfo();
    }
  });
  canvas.addEventListener(
    'wheel',
    (ev) => {
      ev.preventDefault();
      camera.zoomAt(Math.exp(-ev.deltaY * 0.0015), ev.offsetX, ev.offsetY);
    },
    { passive: false },
  );
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && placing) {
      placing = null;
      renderShop();
    } else if (ev.key === 'Escape' && inspected) {
      inspected = null;
      renderInfo();
    }
    if (demo) return;
    if ((ev.key === 'g' || ev.key === 'G') && scene && !modal.isConnected) showGuide();
    const speedKey = ['1', '2', '3'].indexOf(ev.key);
    if (speedKey >= 0 && scene?.game.phase === 'shift') {
      speed = SPEEDS[speedKey];
      paused = false;
      renderShop();
    }
    if (ev.key === ' ' && scene?.game.phase === 'shift') {
      paused = !paused;
      renderShop();
      ev.preventDefault();
    }
  });

  // ---- Loop ------------------------------------------------------------------

  engine.onTick(() => {
    // Animations follow the simulation: frozen while it is stopped, faster when it is sped up.
    engine.timeScale = 0;
    if (scene && demo) return stepDemo();
    if (!scene || paused || modal.isConnected) return;
    const g = scene.game;
    if (g.phase !== 'shift') return;
    for (let i = 0; i < speed && g.phase === 'shift'; i++, engine.timeScale++) g.step();
    if (g.reports.length > shownReports) {
      shownReports = g.reports.length;
      afterShift();
    }
  });
  let hudTimer = 0;
  engine.onFrame((dt) => {
    if (!scene) return;
    scene.render(performance.now());
    if (demo) {
      // Drift slowly along the plant behind the menu.
      const b = scene.game.world.bounds();
      const t = (performance.now() - demoStart) / 1000;
      // Keep the plant in the space right of the menu panel.
      const menuRight = (ui.querySelector('.mainmenu, .menu')?.getBoundingClientRect().right ?? 0) * 0.5;
      camera.x = ((b.minX + b.maxX) / 2 + Math.sin(t / 14) * (b.maxX - b.minX) * 0.2) * TILE_PX - menuRight / camera.zoom;
      camera.y = ((b.minY + b.maxY) / 2 + Math.cos(t / 19) * 2) * TILE_PX;
      return;
    }
    if (placing) {
      const size = CARDS[placing.card].placed!.size;
      const t = hoverTile(size);
      scene.drawGhost(placing.card, t.x, t.y);
    } else scene.drawGhost(null, 0, 0);
    hudTimer += dt;
    if (hudTimer > 100) {
      hudTimer = 0;
      renderHud();
    }
  });

  showMainMenu();
  loading?.classList.add('done');
  setTimeout(() => loading?.remove(), 600);
  (window as unknown as { game: () => Game | undefined }).game = () => scene?.game;
  (window as unknown as { engine: Engine }).engine = engine;
}
