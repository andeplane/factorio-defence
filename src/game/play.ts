import { Container, Graphics, Text } from 'pixi.js';
import { TILE_PX } from '../engine/Camera';
import { Engine } from '../engine/Engine';
import { prototypeKeys, type Direction, type Entity, type EntityPrototype } from '../engine/Entities';
import { FactoryView, factoryViewKeys } from '../engine/FactoryView';
import { valueNoise } from '../engine/TileMap';
import { CARDS, type CardId } from '../sim/cards';
import { DIR_VEC, TICKS_PER_SECOND, type Machine } from '../sim/factory';
import { Game, type ShiftReport } from '../sim/game';
import { LEVELS } from '../sim/levels';
import type { LevelDef } from '../sim/level';
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
const SHORT_PROBLEM: Record<string, string> = { wear: 'Wear', clog: 'Clog', jam: 'Jam', drift: 'Sensor drift', 'false-alarm': 'Alarm?' };

/** Shift speeds, also on keys 1, 2 and 3. */
const SPEEDS = [1, 2, 4];

const itemLabel = (item: string) => ITEM_LABEL[item] ?? item.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

const PROBLEM_LABEL: Record<string, string> = {
  wear: 'Bearing wear',
  clog: 'Clog',
  jam: 'Inserter jam',
  drift: 'Sensor drift',
  'false-alarm': 'False alarm',
  flood: 'Alarm flood',
};

const CARD_COLOR: Partial<Record<CardId, number>> = {
  extractor: 0x4fc3f7,
  charts: 0x7cb342,
  inrobot: 0xffb300,
};

const CARD_BADGE: Partial<Record<CardId, string>> = { extractor: 'EX', charts: 'CH', inrobot: 'IR' };

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/** Mirrors a Game's factory into the engine's entities and draws everything the sim knows on top. */
class LevelScene {
  readonly game: Game;
  private readonly view: FactoryView;
  private readonly mirrored = new Map<object, Entity | null>();
  private readonly fog = new Graphics();
  private readonly marks = new Graphics();
  private readonly labels = new Container();
  private readonly ghost = new Graphics();
  private fogStamp = '';

  constructor(
    private readonly engine: Engine,
    level: LevelDef,
    seed: number,
  ) {
    this.game = new Game(level, seed);
    this.view = new FactoryView(engine.assets, engine.entities, engine.itemLayer, engine.highLayer, (belt) =>
      beltCurveFrom(belt, engine.entities),
    );
    engine.overlay.addChild(this.fog, this.marks, this.labels, this.ghost);
    this.sync();
  }

  destroy(): void {
    for (const e of this.mirrored.values()) if (e) this.engine.entities.remove(e);
    this.mirrored.clear();
    for (const g of [this.fog, this.marks, this.labels, this.ghost]) g.destroy({ children: true });
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
      g.roundRect(c.x * TILE_PX + 3, c.y * TILE_PX + 3, c.size * TILE_PX - 6, c.size * TILE_PX - 6, 6).fill({ color, alpha: 0.9 });
      g.circle(c.cx * TILE_PX, c.cy * TILE_PX, c.radius * TILE_PX).stroke({ color, alpha: 0.25, width: 2 });
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
      const name = p.type === 'wear' ? (p.severity >= 1 ? 'BROKEN' : `Wear ${Math.round(p.severity * 100)}%`) : SHORT_PROBLEM[p.type];
      this.label(name + (p.crewed ? ' · crew coming' : ''), p.x, p.y - 30 / TILE_PX, 0xffffff, 12, true);
      if (p.type === 'wear' && p.severity < 1) {
        g.rect(x - 16, y + 6, 32, 5).fill({ color: 0x1b1b1b });
        g.rect(x - 16, y + 6, 32 * p.severity, 5).fill({ color: 0xff7043 });
      }
    }
    for (const c of snap.crews) {
      const x = c.x * TILE_PX;
      const y = c.y * TILE_PX;
      if (c.state === 'work') g.circle(x, y, 10 + 4 * pulse).stroke({ color: 0xffa726, width: 2, alpha: 0.8 });
      g.circle(x, y, 7).fill({ color: 0xffa726 }).stroke({ color: 0x1b1b1b, width: 2 });
      const doing = c.state === 'idle' ? 'waiting for a work order' : `${c.state === 'walk' ? 'going to' : 'fixing'} ${SHORT_PROBLEM[c.job!].toLowerCase()}`;
      this.label(`${c.name} · ${doing}`, c.x, c.y + 20 / TILE_PX, 0xfff3e0, 12, true);
    }
  }

  private label(text: string, x: number, y: number, color: number, size: number, outline = false): void {
    const style = { fill: color, fontSize: size, fontWeight: 'bold' as const, fontFamily: 'system-ui, sans-serif', ...(outline ? { stroke: { color: 0x1b1b1b, width: 3 } } : {}) };
    const t = new Text({ text, style });
    t.anchor.set(0.5);
    t.position.set(x * TILE_PX, y * TILE_PX);
    this.labels.addChild(t);
  }

  /** Grey fog over everything not connected to Cognite Data Fusion: the data silos. */
  private drawFog(): void {
    const stamp = this.game.placed.map((p) => p.uid).join(',') + ':' + this.game.stage;
    if (stamp === this.fogStamp) return;
    this.fogStamp = stamp;
    const b = this.game.world.bounds();
    const f = this.fog;
    f.clear();
    for (let y = b.minY - 2; y < b.maxY + 2; y++)
      for (let x = b.minX - 2; x < b.maxX + 2; x++)
        if (!this.game.connected(x + 0.5, y + 0.5)) f.rect(x * TILE_PX, y * TILE_PX, TILE_PX, TILE_PX);
    f.fill({ color: 0x8a8f96, alpha: 0.28 });
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
  await engine.init({
    parent,
    tileNames: TILE_NAMES,
    generateTile,
    animationKeys: [...PROTOTYPES.flatMap(prototypeKeys), ...factoryViewKeys(ITEM_NAMES)],
  });

  const ui = el('div', 'ui');
  document.body.appendChild(ui);
  let scene: LevelScene | null = null;
  let speed = 1;
  let paused = false;
  let placing: { index: number; card: CardId } | null = null;
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

  // ---- Level select ----------------------------------------------------------

  function showLevelSelect(): void {
    scene?.destroy();
    scene = null;
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
    panel.appendChild(grid);
    ui.appendChild(panel);
  }

  // ---- Level -----------------------------------------------------------------

  const hud = el('div', 'panel hud');
  const orders = el('div', 'panel orders');
  const shop = el('div', 'panel shop');
  const modal = el('div', 'panel modal');
  const info = el('div', 'panel info');

  function startLevel(level: LevelDef): void {
    scene?.destroy();
    scene = new LevelScene(engine, level, (Date.now() % 1_000_000) + 1);
    shownReports = 0;
    placing = null;
    paused = false;
    inspected = null;
    ui.replaceChildren(hud, orders, shop);
    const b = scene.game.world.bounds();
    camera.x = ((b.minX + b.maxX) / 2) * TILE_PX;
    camera.y = ((b.minY + b.maxY) / 2) * TILE_PX;
    const fit = Math.min(camera.viewWidth / ((b.maxX - b.minX + 8) * TILE_PX), (camera.viewHeight - 260) / ((b.maxY - b.minY + 6) * TILE_PX));
    camera.zoomAt(Math.max(0.3, Math.min(1.5, fit)) / camera.zoom, camera.viewWidth / 2, camera.viewHeight / 2);
    const stage = level.stages[0];
    const howTo =
      LEVELS.indexOf(level) === 0
        ? `<p>Each round is a shift. Deliver the order to the dock before the shift ends. Miss three orders and the level is lost.</p>` +
          `<p>Problems will hit your machines, belts and inserters. Crews only fix what someone has noticed. ` +
          `Between shifts, buy Cognite cards to see problems sooner and fix them faster. The grey haze is equipment nobody has data on.</p>`
        : '';
    showModal(`${level.name}`, `<p>${level.text}</p><p><b>New:</b> ${level.introduces}</p>${howTo}<p><b>${stage.title}.</b> ${stage.text}</p>`, 'Start');
    renderShop();
  }

  function showModal(title: string, html: string, button: string, onClose?: () => void, second?: [string, () => void]): void {
    modal.innerHTML = `<h2>${title}</h2>${html}`;
    const row = el('div', 'row');
    const ok = el('button', 'primary', button);
    ok.addEventListener('click', () => {
      modal.remove();
      onClose?.();
    });
    row.appendChild(ok);
    if (second) {
      const b = el('button', '', second[0]);
      b.addEventListener('click', () => {
        modal.remove();
        second[1]();
      });
      row.appendChild(b);
    }
    modal.appendChild(row);
    ui.appendChild(modal);
  }

  function renderHud(): void {
    if (!scene) return;
    const g = scene.game;
    const strikes = '●'.repeat(g.strikes) + '○'.repeat(3 - g.strikes);
    const phase = g.phase === 'shift' ? `Shift ${Math.ceil((g.shiftTicks - g.shiftTick) / 60)}s left` : 'Between shifts';
    hud.innerHTML =
      `<b>${g.level.name}</b> · Round ${g.round}/${g.level.rounds} · ${phase}` +
      `<br>Money <b>$${Math.floor(g.money)}</b> · Missed orders <span class="strikes">${strikes}</span> · Crew: ${g.crews.map((c) => c.name).join(', ')}`;
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
    const close = '<button class="close" title="Close (Esc)">×</button>';
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
      info.innerHTML = `${close}<b>Delivery chest</b><ul>${rows}</ul><small>Every good item here is paid for. Off-spec items earn nothing.</small>`;
    } else {
      const m = inspected.machine;
      const name = m.isFurnace ? 'Stone furnace' : 'Assembling machine';
      const product = itemLabel(m.recipe.result);
      const inputs = [...m.input].map(([item, c]) => `${itemLabel(item)} ${c.good + c.off}`).join(', ');
      const known = g.openProblems().filter((p) => p.machine === m && p.detected !== null);
      const state = m.working ? 'Working' : g.phase === 'shift' ? '<span class="warn">Idle</span>' : 'Stopped between shifts';
      const problems = known.length
        ? known.map((p) => `<li class="warn">${PROBLEM_LABEL[p.type]}${p.type === 'wear' ? ` ${Math.round(p.severity * 100)}%` : ''}</li>`).join('')
        : '<li>No known problems</li>';
      info.innerHTML =
        `${close}<b>${name}</b> making ${product}` +
        `<ul><li>${state}${m.crafting ? `, ${Math.round(m.progress * 100)}% done` : ''}</li><li>Inputs: ${inputs || 'none'}</li>` +
        `<li>Output waiting: ${m.output.good + m.output.off}</li>${problems}</ul>` +
        (g.connected(m.x + m.size / 2, m.y + m.size / 2) ? '' : '<small>Not connected to Data Fusion: hidden problems stay hidden.</small>');
    }
    info.querySelector('.close')!.addEventListener('click', () => {
      inspected = null;
      renderInfo();
    });
    if (!info.isConnected) ui.appendChild(info);
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
      const p = el('button', paused ? 'active' : '', 'Pause');
      p.addEventListener('click', () => {
        paused = !paused;
        renderShop();
      });
      row.appendChild(p);
      shop.append(el('div', 'title', 'Shift running · keys 1, 2, 3 set the speed, space pauses'), row);
      return;
    }
    const f = g.forecast();
    const forecast = f.threats
      ? f.threats.map((t) => PROBLEM_LABEL[t] ?? t).join(', ')
      : `${f.count} problem${f.count === 1 ? '' : 's'} expected (Simulators shows which)`;
    const events = f.events.map((e) => (e.type === 'trip' ? `Power trip at ${e.second}s` : `Senior operator retires at ${e.second}s`));
    const head = el('div', 'title');
    head.innerHTML =
      `<div class="loop">A problem gets fixed only after someone <b>spots</b> it. Then a crew is <b>dispatched</b>, walks there and <b>fixes</b> it. ` +
      `Caught early it is quick and cheap; once a machine breaks it is slow and costly. Cognite helps at each step.</div>` +
      `<b>Next shift</b>: ${forecast}${events.length ? `<br><span class="warn">${events.join(' · ')}</span>` : ''}`;
    const cards = el('div', 'cards');
    g.offer.forEach((id, i) => {
      const def = CARDS[id];
      const c = el('button', 'card');
      const price = g.priceOf(id);
      c.disabled = g.money < price;
      c.append(el('b', '', def.name), el('span', 'price', `$${price}`), el('span', 'helps', def.helps), el('small', '', def.text));
      c.addEventListener('click', () => {
        if (def.placed) {
          placing = { index: i, card: id };
          renderShop();
        } else {
          const err = g.buy(i);
          if (err) flash(err);
          scene!.sync();
          renderShop();
        }
      });
      if (placing?.index === i) c.classList.add('active');
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
    });
    row.append(reroll, go);
    const owned = [...g.owned.entries()].map(([c, n]) => (n > 1 ? `${CARDS[c].name} x${n}` : CARDS[c].name)).join(', ');
    shop.append(head, cards, row);
    if (placing) shop.append(el('div', 'hint', `Click the map to place ${CARDS[placing.card].name}. Esc cancels.`));
    if (owned) shop.append(el('div', 'owned', `Owned: ${owned}`));
  }

  function flash(text: string): void {
    const t = el('div', 'panel flash', text);
    ui.appendChild(t);
    setTimeout(() => t.remove(), 1800);
  }

  function reportHtml(r: ShiftReport): string {
    const rows = r.orders
      .map((o) => `<li>${ITEM_LABEL[o.item] ?? o.item}: ${o.delivered}/${o.perShift} ${o.met ? '✓' : '<span class="warn">missed</span>'}</li>`)
      .join('');
    const lines = [
      `Income $${Math.round(r.income)}, repairs $${Math.round(r.repairCost)}, crew wages $${r.wages}`,
      `${r.detectedEarly} problems caught early, ${r.breakdowns} breakdowns`,
    ];
    const fixes = Object.entries(r.fixesBy).sort((x, y) => y[1] - x[1]);
    if (fixes.length) lines.push('Repairs: ' + fixes.map(([name, n]) => `${name} ${n}`).join(', '));
    if (r.offSpecDelivered) lines.push(`${r.offSpecDelivered} off-spec items shipped and rejected`);
    if (r.hidden) lines.push(`<span class="warn">${r.hidden} problem${r.hidden === 1 ? ' is' : 's are'} still hidden somewhere in the plant</span>`);
    return `<ul>${rows}</ul><p>${lines.join('<br>')}</p>`;
  }

  function afterShift(): void {
    if (!scene) return;
    const g = scene.game;
    const r = g.reports[g.reports.length - 1];
    scene.sync();
    renderShop();
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
      const err = scene.game.buy(placing.index, [t.x, t.y]);
      if (err) flash(err);
      else {
        placing = null;
        scene.drawGhost(null, 0, 0);
        scene.sync();
      }
      renderShop();
    } else if (click && scene) {
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

  showLevelSelect();
  (window as unknown as { game: () => Game | undefined }).game = () => scene?.game;
  (window as unknown as { engine: Engine }).engine = engine;
}
