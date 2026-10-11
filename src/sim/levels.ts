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

/**
 * Level 2: electronic circuits. Iron plates run along the top belt, copper plates along the bottom
 * one, and cable assemblers hand cable straight to circuit assemblers between them. Circuits ride
 * the far side of the copper belt to the dock.
 */
export const CIRCUIT_PLANT: LevelDef = {
  id: 'circuit-plant',
  name: 'Circuit Plant',
  text: 'Two smelting lines feed a row of cable and circuit assemblers. Hidden sensor faults start to appear.',
  rounds: 8,
  shiftSeconds: 90,
  startMoney: 150,
  crews: 1,
  depot: [4, 8],
  cards: [
    'crew',
    'data-fusion',
    'extractor',
    'charts',
    'asset-data-insights',
    'infield',
    'inrobot',
    'atlas-ai',
    'canvas',
    'search',
    'flows',
  ],
  build(w) {
    const ironOre = w.belt([
      [0, 0],
      [9, 0],
    ]);
    w.source('iron-ore', 0.7, -2, 0, ironOre, 0, 1);
    w.source('iron-ore', 0.4, -2, -2, ironOre, 0, 0, 3);
    for (const [x, stage] of [
      [0, 1],
      [2, 1],
      [4, 3],
    ]) {
      w.furnace('iron-plate', x, 2, stage);
      w.inserter(x, 1, 'south', stage);
      w.inserter(x, 4, 'south', stage);
    }
    w.belt(
      [
        [0, 5],
        [30, 5],
      ],
      { sink: true },
    );
    w.belt(
      [
        [0, 11],
        [30, 11],
      ],
      { sink: true },
    );
    const copperOre = w.belt([
      [0, 16],
      [15, 16],
    ]);
    w.source('copper-ore', 1.0, -2, 16, copperOre, 0, 1);
    w.source('copper-ore', 1.0, -2, 14, copperOre, 0, 0, 2);
    w.source('copper-ore', 0.6, 3, 17, copperOre, 3, 1, 3);
    for (const [x, stage] of [
      [0, 1],
      [2, 1],
      [4, 1],
      [6, 2],
      [8, 2],
      [10, 2],
      [12, 3],
      [14, 3],
    ]) {
      w.furnace('copper-plate', x, 13, stage);
      w.inserter(x, 15, 'north', stage);
      w.inserter(x, 12, 'north', stage);
    }
    // Cable assemblers A, B, C and circuit assemblers 1, 2 alternate along the row.
    w.assembler('copper-cable', 10, 7);
    w.inserter(11, 10, 'north');
    w.assembler('electronic-circuit', 14, 7);
    w.inserter(13, 8, 'east');
    w.inserter(15, 6, 'south');
    w.inserter(15, 10, 'south');
    w.assembler('copper-cable', 18, 7, 2);
    w.inserter(19, 10, 'north', 2);
    w.inserter(17, 8, 'west', 2);
    w.assembler('electronic-circuit', 22, 7, 3);
    w.inserter(21, 8, 'east', 3);
    w.inserter(23, 6, 'south', 3);
    w.inserter(23, 10, 'south', 3);
    w.assembler('copper-cable', 26, 7, 3);
    w.inserter(27, 10, 'north', 3);
    w.inserter(25, 8, 'west', 3);
  },
  stages: [
    {
      round: 1,
      title: 'Circuits',
      text: 'One cable assembler feeds one circuit assembler.',
      orders: [{ item: 'electronic-circuit', perShift: 20 }],
    },
    {
      round: 3,
      title: 'More cable',
      text: 'A second cable assembler and three copper furnaces double the cable supply.',
      orders: [{ item: 'electronic-circuit', perShift: 30 }],
    },
    {
      round: 6,
      title: 'Second circuit line',
      text: 'A second circuit assembler with its own cable supply.',
      orders: [{ item: 'electronic-circuit', perShift: 48 }],
    },
  ],
  threatBudget: (round) => 6 + round * 3,
  threats: {
    wear: { weight: 3, from: 1 },
    clog: { weight: 2, from: 1 },
    jam: { weight: 2, from: 1 },
    drift: { weight: 2, from: 2 },
    flood: { weight: 1.5, from: 3 },
  },
  events: [],
};

/**
 * Level 3: red science, then green science. Gears for green science ride the far side of the
 * copper belt; science packs ride the far side of the iron belt to the dock.
 */
export const SCIENCE_LAB: LevelDef = {
  id: 'science-lab',
  name: 'Science Lab',
  text: 'Red science first, then the long green science chain. Expect a plant trip and a retirement.',
  rounds: 9,
  shiftSeconds: 90,
  startMoney: 180,
  crews: 2,
  depot: [2, 8],
  cards: [
    'crew',
    'data-fusion',
    'extractor',
    'charts',
    'asset-data-insights',
    'infield',
    'inrobot',
    'atlas-ai',
    'canvas',
    'maintain',
    'simulators',
    'search',
    'flows',
  ],
  build(w) {
    const ironOre = w.belt([
      [0, 0],
      [11, 0],
    ]);
    w.source('iron-ore', 1.0, -2, 0, ironOre, 0, 1);
    w.source('iron-ore', 1.0, -2, -2, ironOre, 0, 0, 2);
    for (const [x, stage] of [
      [0, 1],
      [2, 1],
      [4, 1],
      [6, 2],
      [8, 2],
      [10, 2],
    ]) {
      w.furnace('iron-plate', x, 2, stage);
      w.inserter(x, 1, 'south', stage);
      w.inserter(x, 4, 'south', stage);
    }
    w.belt(
      [
        [0, 5],
        [44, 5],
      ],
      { sink: true },
    );
    w.belt(
      [
        [0, 11],
        [44, 11],
      ],
      { sink: true },
    );
    const copperOre = w.belt([
      [0, 16],
      [7, 16],
    ]);
    w.source('copper-ore', 0.7, -2, 16, copperOre, 0, 1);
    w.source('copper-ore', 0.4, -2, 14, copperOre, 0, 0, 2);
    for (const [x, stage] of [
      [0, 1],
      [2, 1],
      [4, 2],
    ]) {
      w.furnace('copper-plate', x, 13, stage);
      w.inserter(x, 15, 'north', stage);
      w.inserter(x, 12, 'north', stage);
    }
    // Red science: R1 and R2 share the gear assembler G1 between them.
    w.assembler('automation-science-pack', 12, 7);
    w.inserter(13, 10, 'north');
    w.inserter(13, 6, 'north');
    w.inserter(15, 8, 'west');
    w.assembler('iron-gear-wheel', 16, 7);
    w.inserter(17, 6, 'south');
    w.assembler('automation-science-pack', 20, 7);
    w.inserter(19, 8, 'east');
    w.inserter(21, 10, 'north');
    w.inserter(21, 6, 'north');
    // Green science: gears from G2 ride the copper belt to the inserter and belt assemblers.
    w.assembler('iron-gear-wheel', 8, 7, 2);
    w.inserter(9, 6, 'south', 2);
    w.inserter(9, 10, 'south', 2);
    w.assembler('copper-cable', 24, 7, 2);
    w.inserter(25, 10, 'north', 2);
    w.assembler('electronic-circuit', 28, 7, 2);
    w.inserter(27, 8, 'east', 2);
    w.inserter(29, 6, 'south', 2);
    w.assembler('inserter', 32, 7, 2);
    w.inserter(31, 8, 'east', 2);
    w.inserter(33, 6, 'south', 2);
    w.inserter(33, 10, 'north', 2);
    w.assembler('logistic-science-pack', 36, 7, 2);
    w.inserter(35, 8, 'east', 2);
    w.inserter(37, 6, 'north', 2);
    w.assembler('transport-belt', 40, 7, 2);
    w.inserter(39, 8, 'west', 2);
    w.inserter(41, 6, 'south', 2);
    w.inserter(41, 10, 'north', 2);
  },
  stages: [
    {
      round: 1,
      title: 'Red science',
      text: 'Two science assemblers share one gear assembler.',
      orders: [{ item: 'automation-science-pack', perShift: 14 }],
    },
    {
      round: 4,
      title: 'Green science',
      text: 'Cable, circuits, inserters and belts come together into logistic science packs.',
      orders: [
        { item: 'automation-science-pack', perShift: 14 },
        { item: 'logistic-science-pack', perShift: 5 },
      ],
    },
  ],
  threatBudget: (round) => 8 + round * 3,
  threats: {
    wear: { weight: 3, from: 1 },
    clog: { weight: 2, from: 1 },
    jam: { weight: 2, from: 1 },
    drift: { weight: 2, from: 1 },
    flood: { weight: 1.5, from: 2 },
  },
  events: [
    { round: 5, type: 'knowledge-loss', second: 30 },
    { round: 7, type: 'trip', second: 40 },
    { round: 9, type: 'trip', second: 20 },
  ],
};

export const LEVELS: LevelDef[] = [GEAR_WORKS, CIRCUIT_PLANT, SCIENCE_LAB];
