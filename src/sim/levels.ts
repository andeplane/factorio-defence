import type { LevelDef } from './level';

/**
 * Level 1: iron gears, then copper cable on the other side of the same belts, then red science.
 *
 *   y=0   iron and copper ore belt (iron on the south lane, copper on the north lane)
 *   y=2   furnaces, fed from the ore belt and emptied onto the plate belt
 *   y=5   plate belt (iron south lane, copper north lane), ends at the dock
 *   y=7   gear, cable and science assemblers
 *   y=11  product belt (gears south lane, cable north lane), ends at the dock
 */
export const GEAR_WORKS: LevelDef = {
  id: 'gear-works',
  name: 'Gear Works',
  text: 'A small smelting line making iron gears. Keep the gears flowing as the line grows.',
  rounds: 8,
  shiftSeconds: 90,
  startMoney: 120,
  crews: 1,
  depot: [4, 9],
  cards: ['crew', 'data-fusion', 'extractor', 'charts', 'asset-data-insights', 'infield', 'inrobot', 'canvas', 'flows'],
  build(w) {
    const ore = w.belt([
      [0, 0],
      [16, 0],
    ]);
    w.source('iron-ore', 1.3, -2, 0, ore, 0, 1);
    w.source('copper-ore', 0.7, -2, -2, ore, 0, 0, 2);
    for (const x of [0, 2, 4, 6]) {
      w.furnace('iron-plate', x, 2);
      w.inserter(x, 1, 'south');
      w.inserter(x, 4, 'south');
    }
    for (const x of [8, 10]) {
      w.furnace('copper-plate', x, 2, 2);
      w.inserter(x, 1, 'south', 2);
      w.inserter(x, 4, 'south', 2, 0);
    }
    w.belt(
      [
        [0, 5],
        [20, 5],
      ],
      { sink: true },
    );
    w.assembler('iron-gear-wheel', 10, 7);
    w.inserter(10, 6, 'south');
    w.inserter(12, 6, 'south');
    w.inserter(11, 10, 'south');
    w.assembler('copper-cable', 14, 7, 2);
    w.inserter(15, 6, 'south', 2);
    w.inserter(15, 10, 'south', 2, 0);
    w.belt(
      [
        [8, 11],
        [20, 11],
      ],
      { sink: true },
    );
    w.assembler('automation-science-pack', 18, 7, 3);
    w.inserter(19, 6, 'south', 3);
    w.inserter(19, 10, 'north', 3);
    w.inserter(21, 8, 'east', 3);
    w.belt(
      [
        [22, 8],
        [22, 13],
      ],
      { sink: true, stage: 3 },
    );
  },
  stages: [
    {
      round: 1,
      title: 'Iron gears',
      text: 'Four furnaces smelt iron ore, and an assembler turns the plates into gears.',
      orders: [{ item: 'iron-gear-wheel', perShift: 34 }],
    },
    {
      round: 4,
      title: 'Copper cable',
      text: 'Copper ore rides the other side of the belt. Two new furnaces and a cable assembler join the line.',
      orders: [
        { item: 'iron-gear-wheel', perShift: 30 },
        { item: 'copper-cable', perShift: 44 },
      ],
    },
    {
      round: 7,
      title: 'Red science',
      text: 'Gears and copper plates combine into automation science packs.',
      orders: [
        { item: 'iron-gear-wheel', perShift: 22 },
        { item: 'copper-cable', perShift: 36 },
        { item: 'automation-science-pack', perShift: 6 },
      ],
    },
  ],
  threatBudget: (round) => 4 + round * 2.5,
  threats: {
    wear: { weight: 3, from: 1 },
    clog: { weight: 2, from: 1 },
    jam: { weight: 2, from: 2 },
  },
  events: [],
};

export const LEVELS: LevelDef[] = [GEAR_WORKS];
