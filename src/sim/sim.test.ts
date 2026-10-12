import { describe, expect, it } from 'vitest';
import { greedyBot } from './bots';
import { BeltLine, ITEM_GAP } from './factory';
import { Game } from './game';
import { LEVELS } from './levels';
import { World } from './world';

describe('belts', () => {
  it('moves items to the end, keeps them apart and delivers at a sink', () => {
    const line = new BeltLine(1, [0, 1, 2].map((x) => ({ x, y: 0, dir: 'east' as const })), true, 1);
    const got: string[] = [];
    expect(line.insert(0, 0.5, { item: 'iron-plate', off: false })).toBe(true);
    expect(line.insert(0, 0.6, { item: 'iron-plate', off: false })).toBe(false);
    expect(line.insert(0, 0.5 - ITEM_GAP, { item: 'copper-plate', off: false })).toBe(true);
    for (let t = 0; t < 120; t++) line.step((i) => got.push(i));
    expect(got).toEqual(['iron-plate', 'copper-plate']);
  });

  it('stops items behind a clog', () => {
    const line = new BeltLine(1, [0, 1, 2, 3].map((x) => ({ x, y: 0, dir: 'east' as const })), true, 1);
    line.blocks[1].push(2.5);
    line.insert(1, 0.5, { item: 'iron-plate', off: false });
    const got: string[] = [];
    for (let t = 0; t < 300; t++) line.step((i) => got.push(i));
    expect(got).toEqual([]);
    expect(line.lanes[1][0].pos).toBeCloseTo(2.375);
  });
});

describe('inserters', () => {
  it('drop onto the far lane of a belt', () => {
    const w = new World();
    const belt = w.belt([
      [0, 2],
      [3, 2],
    ]);
    w.assembler('iron-gear-wheel', 0, -2);
    w.inserter(1, 1, 'south');
    w.finish();
    // The belt runs east, so its left lane (0) is the north side and the far lane is 1.
    expect(w.inserters[0].dropLane).toBe(1);
    expect(w.inserters[0].drop).toMatchObject({ kind: 'belt', line: belt, index: 1 });
  });
});

describe('levels', () => {
  for (const level of LEVELS) {
    it(`${level.name} meets every order when nothing goes wrong`, () => {
      const g = new Game({ ...level, threatBudget: () => 0, events: [] }, 1);
      while (g.phase === 'build') g.runShift();
      expect(g.phase).toBe('won');
      expect(g.strikes).toBe(0);
    });
  }
});

describe('game', () => {
  it('is deterministic and replays from its action log', () => {
    const play = () => {
      const g = new Game(LEVELS[0], 42);
      for (let r = 0; r < 3 && g.phase === 'build'; r++) {
        greedyBot.build(g);
        g.runShift();
      }
      return g;
    };
    const a = play();
    const b = play();
    expect(b.money).toBe(a.money);
    expect(b.reports).toEqual(a.reports);
    const c = Game.replay(LEVELS[0], 42, a.log);
    expect(c.money).toBe(a.money);
    expect(c.round).toBe(a.round);
  });

  it('catches bearing wear early under Charts', () => {
    const level = { ...LEVELS[0], threats: { wear: { weight: 1, from: 1 } }, threatBudget: () => 3, startMoney: 1000 };
    const g = new Game(level, 3);
    const hub = g.offer.indexOf('data-fusion');
    expect(g.buy(hub, [0, 7])).toBeNull();
    g.offer.push('charts');
    expect(g.buy(g.offer.indexOf('charts'), [3, 6])).toBeNull();
    g.runShift();
    const r = g.reports[0];
    expect(r.spawned.wear).toBe(1);
    expect(r.breakdowns).toBe(0);
    expect(r.detectedEarly).toBe(1);
  });
});

describe('reroll', () => {
  it('deals cards not in the current offer, or is unavailable when there are none', () => {
    for (const level of LEVELS) {
      const g = new Game(level, 7);
      g.money = 1000;
      const before = [...g.offer];
      if (!g.canReroll()) {
        expect(g.reroll()).toBe(false);
        continue;
      }
      expect(g.reroll()).toBe(true);
      expect(g.offer.some((c) => !before.includes(c))).toBe(true);
    }
  });
});
