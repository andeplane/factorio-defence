import { CARDS, type CardId } from './cards';
import type { Game } from './game';
import { Rng } from './rng';

/** A player strategy for the build phase. The shift itself runs on its own. */
export interface Bot {
  name: string;
  build(game: Game): void;
}

interface Target {
  x: number;
  y: number;
  weight: number;
}

/** Everything a problem can hit, weighted by how much it matters. */
function targets(game: Game): Target[] {
  const out: Target[] = [];
  for (const m of game.world.activeMachines()) out.push({ x: m.x + m.size / 2, y: m.y + m.size / 2, weight: 3 });
  for (const i of game.world.activeInserters()) out.push({ x: i.x + 0.5, y: i.y + 0.5, weight: 1 });
  for (const l of game.world.activeLines()) for (const t of l.tiles) out.push({ x: t.x + 0.5, y: t.y + 0.5, weight: 0.15 });
  return out;
}

/** Top-left tiles where the card could go. */
function spots(game: Game, card: CardId): [number, number][] {
  const b = game.world.bounds();
  const out: [number, number][] = [];
  for (let y = b.minY - 3; y < b.maxY + 3; y++)
    for (let x = b.minX - 3; x < b.maxX + 3; x++) if (!game.placementError(card, x, y)) out.push([x, y]);
  return out;
}

/** Weight of targets a card at `spot` would newly help with. */
function placementGain(game: Game, card: CardId, spot: [number, number], ts: Target[]): number {
  const def = CARDS[card].placed!;
  const cx = spot[0] + def.size / 2;
  const cy = spot[1] + def.size / 2;
  let gain = 0;
  for (const t of ts) {
    if (Math.hypot(t.x - cx, t.y - cy) > def.radius) continue;
    if (card === 'data-fusion' || card === 'extractor') {
      if (!game.connected(t.x, t.y)) gain += t.weight;
    } else if (card === 'charts') {
      if (game.connected(t.x, t.y) && !game.covered('charts', t.x, t.y)) gain += t.weight;
    } else if (card === 'inrobot') {
      if (!game.covered('inrobot', t.x, t.y) && !(game.connected(t.x, t.y) && game.covered('charts', t.x, t.y))) gain += t.weight;
    }
  }
  return gain;
}

function bestSpot(game: Game, card: CardId): { spot: [number, number]; gain: number } | null {
  const ts = targets(game);
  let best: { spot: [number, number]; gain: number } | null = null;
  for (const s of spots(game, card)) {
    const gain = placementGain(game, card, s, ts);
    if (!best || gain > best.gain) best = { spot: s, gain };
  }
  return best;
}

/** Buys only extra maintenance crews: the plant without Cognite. */
export const reactiveBot: Bot = {
  name: 'reactive',
  build(game) {
    for (;;) {
      const i = game.offer.indexOf('crew');
      if (i < 0 || game.money < CARDS.crew.price + 30 || game.crews.length >= 4) {
        if (game.crews.length < 4 && game.money >= game.rerollCost() + CARDS.crew.price + 30 && game.reroll()) continue;
        return;
      }
      game.buy(i);
    }
  },
};

/** Buys random affordable cards and puts them at random valid spots. */
export function randomBot(seed: number): Bot {
  const rng = new Rng(seed);
  return {
    name: 'random',
    build(game) {
      for (let tries = 0; tries < 10; tries++) {
        const affordable = game.offer.map((c, i) => [c, i] as const).filter(([c]) => CARDS[c].price <= game.money);
        if (!affordable.length || rng.next() < 0.25) return;
        const [card, i] = rng.pick(affordable);
        let at: [number, number] | undefined;
        if (CARDS[card].placed) {
          const s = spots(game, card);
          if (!s.length) return;
          at = rng.pick(s);
        }
        game.buy(i, at);
      }
    },
  };
}

/** How much a heuristic player wants a card right now. */
function cardValue(game: Game, card: CardId): { value: number; at?: [number, number] } {
  const lvl = game.level;
  const has = (c: CardId) => game.has(c);
  const levelHas = (t: string) => t in lvl.threats;
  switch (card) {
    case 'crew':
      return { value: game.crews.length < 2 ? 55 : game.crews.length < 3 ? 25 : 5 };
    case 'data-fusion':
    case 'extractor':
    case 'charts':
    case 'inrobot': {
      const b = bestSpot(game, card);
      if (!b) return { value: 0 };
      const scale = { 'data-fusion': 4, extractor: 3, charts: 3.5, inrobot: 2.2 }[card];
      const bonus = card === 'data-fusion' && !has('data-fusion') ? 40 : 0;
      return { value: b.gain * scale + bonus, at: b.spot };
    }
    case 'asset-data-insights':
      return { value: 45 };
    case 'infield':
      return { value: 35 };
    case 'atlas-ai':
      return { value: (levelHas('drift') ? 30 : 0) + (levelHas('flood') ? 30 : 0) + 15 };
    case 'canvas':
      return { value: 22 };
    case 'maintain':
      return { value: 50 };
    case 'simulators':
      return { value: lvl.events.some((e) => e.type === 'trip') ? 35 : 10 };
    case 'search':
      return { value: levelHas('drift') ? 40 : 10 };
    case 'flows':
      return { value: 50 };
  }
}

/** A sensible player: buys what helps most per coin, keeping a little for repairs. */
export const greedyBot: Bot = {
  name: 'greedy',
  build(game) {
    for (let guard = 0; guard < 12; guard++) {
      let best: { i: number; perCoin: number; at?: [number, number] } | null = null;
      game.offer.forEach((card, i) => {
        const price = CARDS[card].price;
        if (price > game.money - 15) return;
        const v = cardValue(game, card);
        if (CARDS[card].placed && !v.at) return;
        const perCoin = v.value / price;
        if (perCoin >= 0.4 && (!best || perCoin > best.perCoin)) best = { i, perCoin, at: v.at };
      });
      if (!best) {
        if (game.money > 160 && game.rerolls < 2 && game.reroll()) continue;
        return;
      }
      const b: { i: number; at?: [number, number] } = best;
      if (game.buy(b.i, b.at)) return;
    }
  },
};
