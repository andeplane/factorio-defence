import { assembler, copperSmelter, ironSmelter } from './blocks';
import type { CardId } from './cards';
import type { LevelDef } from './level';

/** Cards unlock across the campaign, roughly one or two per level, next to the threat they answer. */
const CARDS_BY_LEVEL: CardId[][] = [
  ['crew', 'data-fusion', 'extractor', 'charts', 'flows'],
  ['inrobot', 'infield'],
  ['asset-data-insights', 'canvas'],
  ['search'],
  ['atlas-ai'],
  ['maintain'],
  ['simulators'],
  [],
  [],
  [],
];
const cardsUpTo = (level: number): CardId[] => CARDS_BY_LEVEL.slice(0, level).flat();

const DEPOT: [number, number] = [-2, 8];

export const LEVELS: LevelDef[] = [
  {
    id: 'gear-works',
    name: 'Gear Works',
    text: 'A small smelting line making iron gears. Keep the gears flowing.',
    rounds: 6,
    shiftSeconds: 90,
    startMoney: 120,
    crews: 1,
    depot: DEPOT,
    cards: cardsUpTo(1),
    build(w) {
      ironSmelter(w, [1, 1, 1, 1, 2, 2], [1, 1, 1, 2], 16);
      assembler(w, 'iron-gear-wheel', 6, { top: ['in', 'out', 'in'] });
      assembler(w, 'iron-gear-wheel', 10, { top: ['in', 'out', 'in'], stage: 2 });
    },
    stages: [
      { round: 1, title: 'Iron gears', text: 'Four furnaces feed one gear assembler.', orders: [{ item: 'iron-gear-wheel', perShift: 33 }] },
      {
        round: 4,
        title: 'Second gear assembler',
        text: 'Two more furnaces and a second gear assembler double the order.',
        orders: [{ item: 'iron-gear-wheel', perShift: 64 }],
      },
    ],
    threatBudget: (r) => 3 + r * 2,
    threats: { wear: { weight: 3, from: 1 }, clog: { weight: 2, from: 1 } },
    events: [],
  },
  {
    id: 'copper-lane',
    name: 'Copper Lane',
    text: 'Gears on the iron belt, and copper cable joins on its own belt. Watch the inserters.',
    rounds: 7,
    shiftSeconds: 90,
    startMoney: 130,
    crews: 1,
    depot: DEPOT,
    cards: cardsUpTo(2),
    build(w) {
      ironSmelter(w, [1, 1, 1, 1], [1, 1, 1], 18);
      copperSmelter(w, [2, 2, 2], [2, 2], 18);
      assembler(w, 'iron-gear-wheel', 6, { top: ['in', 'out', 'in'] });
      assembler(w, 'copper-cable', 12, { bottom: [null, 'in', 'out'], stage: 2 });
    },
    stages: [
      { round: 1, title: 'Gears', text: 'The gear line from before.', orders: [{ item: 'iron-gear-wheel', perShift: 33 }] },
      {
        round: 3,
        title: 'Copper cable',
        text: 'A copper smelter and a cable assembler come online on the second belt.',
        orders: [
          { item: 'iron-gear-wheel', perShift: 33 },
          { item: 'copper-cable', perShift: 56 },
        ],
      },
    ],
    threatBudget: (r) => 4 + r * 2.5,
    threats: { wear: { weight: 3, from: 1 }, clog: { weight: 2, from: 1 }, jam: { weight: 2, from: 2 } },
    events: [],
  },
  {
    id: 'red-science',
    name: 'Red Science',
    text: 'Gears and copper plates become automation science packs.',
    rounds: 8,
    shiftSeconds: 90,
    startMoney: 140,
    crews: 1,
    depot: DEPOT,
    cards: cardsUpTo(3),
    build(w) {
      ironSmelter(w, [1, 1, 1], [1, 1], 18);
      copperSmelter(w, [1, 1], [1, 1], 18);
      assembler(w, 'automation-science-pack', 4, { from: ['right'], top: [null, 'out'], bottom: [null, 'in'] });
      assembler(w, 'iron-gear-wheel', 8, { top: ['in', null, 'in'] });
      assembler(w, 'automation-science-pack', 12, { from: ['left'], top: [null, 'out'], bottom: [null, 'in'], stage: 2 });
    },
    stages: [
      {
        round: 1,
        title: 'Red science',
        text: 'A gear assembler hands gears straight to a science assembler.',
        orders: [{ item: 'automation-science-pack', perShift: 7 }],
      },
      {
        round: 4,
        title: 'Second science assembler',
        text: 'The gear assembler now feeds two science assemblers.',
        orders: [{ item: 'automation-science-pack', perShift: 14 }],
      },
    ],
    threatBudget: (r) => 5 + r * 2.5,
    threats: { wear: { weight: 3, from: 1 }, clog: { weight: 2, from: 1 }, jam: { weight: 2, from: 1 } },
    events: [],
  },
  {
    id: 'circuit-plant',
    name: 'Circuit Plant',
    text: 'Cable assemblers hand cable straight to a circuit assembler. Some sensors start lying.',
    rounds: 8,
    shiftSeconds: 90,
    startMoney: 150,
    crews: 1,
    depot: DEPOT,
    cards: cardsUpTo(4),
    build(w) {
      ironSmelter(w, [1, 1], [1], 22);
      copperSmelter(w, [1, 1, 1, 2, 2, 2], [1, 1, 2, 2], 22);
      assembler(w, 'copper-cable', 8, { bottom: [null, 'in'] });
      assembler(w, 'electronic-circuit', 12, { from: ['left'], top: [null, 'in'], bottom: [null, 'out'] });
      assembler(w, 'copper-cable', 16, { bottom: [null, 'in'], stage: 2 });
      w.inserter(15, 8, 'west', 2);
    },
    stages: [
      {
        round: 1,
        title: 'Circuits',
        text: 'One cable assembler feeds one circuit assembler.',
        orders: [{ item: 'electronic-circuit', perShift: 19 }],
      },
      {
        round: 4,
        title: 'More cable',
        text: 'A second cable assembler and three more copper furnaces double the cable.',
        orders: [{ item: 'electronic-circuit', perShift: 26 }],
      },
    ],
    threatBudget: (r) => 6 + r * 2.5,
    threats: {
      wear: { weight: 3, from: 1 },
      clog: { weight: 2, from: 1 },
      jam: { weight: 2, from: 1 },
      drift: { weight: 2, from: 2 },
    },
    events: [],
  },
  {
    id: 'control-room',
    name: 'Control Room',
    text: 'Two circuit assemblers and a wall of alarms. Most of them are noise.',
    rounds: 8,
    shiftSeconds: 90,
    startMoney: 160,
    crews: 2,
    depot: DEPOT,
    cards: cardsUpTo(5),
    build(w) {
      ironSmelter(w, [1, 1, 2], [1, 2], 30);
      copperSmelter(w, [1, 1, 1, 1, 1, 1, 2, 2, 2], [1, 1, 1, 1, 2, 2], 30);
      assembler(w, 'copper-cable', 8, { bottom: [null, 'in'] });
      assembler(w, 'electronic-circuit', 12, { from: ['left', 'right'], top: [null, 'in'], bottom: [null, 'out'] });
      assembler(w, 'copper-cable', 16, { bottom: [null, 'in'] });
      assembler(w, 'electronic-circuit', 20, { from: ['right'], top: [null, 'in'], bottom: [null, 'out'], stage: 2 });
      assembler(w, 'copper-cable', 24, { bottom: [null, 'in'], stage: 2 });
    },
    stages: [
      {
        round: 1,
        title: 'Circuits',
        text: 'Two cable assemblers feed one circuit assembler.',
        orders: [{ item: 'electronic-circuit', perShift: 26 }],
      },
      {
        round: 4,
        title: 'Second circuit line',
        text: 'A second circuit assembler with its own cable assembler.',
        orders: [{ item: 'electronic-circuit', perShift: 56 }],
      },
    ],
    threatBudget: (r) => 7 + r * 3,
    threats: {
      wear: { weight: 3, from: 1 },
      clog: { weight: 2, from: 1 },
      jam: { weight: 2, from: 1 },
      drift: { weight: 2, from: 1 },
      flood: { weight: 2, from: 2 },
    },
    events: [],
  },
  {
    id: 'belt-works',
    name: 'Belt Works',
    text: 'Gears and plates become transport belts. Halfway through, your most experienced operator retires.',
    rounds: 8,
    shiftSeconds: 90,
    startMoney: 170,
    crews: 2,
    depot: DEPOT,
    cards: cardsUpTo(6),
    build(w) {
      ironSmelter(w, [1, 1, 1, 1, 2, 2, 2, 2], [1, 1, 1, 2, 2], 26);
      assembler(w, 'iron-gear-wheel', 4, { top: ['in', null, 'in'] });
      assembler(w, 'transport-belt', 8, { from: ['left'], top: ['in', 'out'] });
      assembler(w, 'iron-gear-wheel', 14, { top: ['in', null, 'in'], stage: 2 });
      assembler(w, 'transport-belt', 18, { from: ['left'], top: ['in', 'out'], stage: 2 });
    },
    stages: [
      {
        round: 1,
        title: 'Transport belts',
        text: 'A gear assembler feeds a belt assembler.',
        orders: [{ item: 'transport-belt', perShift: 54 }],
      },
      {
        round: 4,
        title: 'Second belt line',
        text: 'Four more furnaces and a second gear and belt pair.',
        orders: [{ item: 'transport-belt', perShift: 112 }],
      },
    ],
    threatBudget: (r) => 7 + r * 3,
    threats: {
      wear: { weight: 3, from: 1 },
      clog: { weight: 2, from: 1 },
      jam: { weight: 2, from: 1 },
      drift: { weight: 1.5, from: 1 },
      flood: { weight: 1.5, from: 2 },
    },
    events: [{ round: 5, type: 'knowledge-loss', second: 20 }],
  },
  {
    id: 'power-trip',
    name: 'Power Trip',
    text: 'A big red science line on a weak grid. Expect the power to trip.',
    rounds: 8,
    shiftSeconds: 90,
    startMoney: 180,
    crews: 2,
    depot: DEPOT,
    cards: cardsUpTo(7),
    build(w) {
      ironSmelter(w, [1, 1, 1, 2, 2, 2], [1, 1, 2, 2], 30);
      copperSmelter(w, [1, 1, 2, 2], [1, 2], 30);
      assembler(w, 'automation-science-pack', 4, { from: ['right'], top: [null, 'out'], bottom: [null, 'in'] });
      assembler(w, 'iron-gear-wheel', 8, { top: ['in', null, 'in'] });
      assembler(w, 'automation-science-pack', 12, { from: ['left'], top: [null, 'out'], bottom: [null, 'in'] });
      assembler(w, 'automation-science-pack', 16, { from: ['right'], top: [null, 'out'], bottom: [null, 'in'], stage: 2 });
      assembler(w, 'iron-gear-wheel', 20, { top: ['in', null, 'in'], stage: 2 });
      assembler(w, 'automation-science-pack', 24, { from: ['left'], top: [null, 'out'], bottom: [null, 'in'], stage: 2 });
    },
    stages: [
      {
        round: 1,
        title: 'Red science',
        text: 'One gear assembler feeds two science assemblers.',
        orders: [{ item: 'automation-science-pack', perShift: 14 }],
      },
      {
        round: 4,
        title: 'Double the line',
        text: 'A second gear assembler with two more science assemblers.',
        orders: [{ item: 'automation-science-pack', perShift: 28 }],
      },
    ],
    threatBudget: (r) => 8 + r * 3,
    threats: {
      wear: { weight: 3, from: 1 },
      clog: { weight: 2, from: 1 },
      jam: { weight: 2, from: 1 },
      drift: { weight: 1.5, from: 1 },
      flood: { weight: 1.5, from: 1 },
    },
    events: [
      { round: 3, type: 'trip', second: 45 },
      { round: 6, type: 'trip', second: 30 },
      { round: 8, type: 'trip', second: 50 },
    ],
  },
  {
    id: 'green-science',
    name: 'Green Science',
    text: 'Inserters and transport belts, then logistic science packs from both.',
    rounds: 9,
    shiftSeconds: 90,
    startMoney: 190,
    crews: 2,
    depot: DEPOT,
    cards: cardsUpTo(8),
    build(w) {
      ironSmelter(w, [1, 1, 1, 1, 1, 1], [1, 1, 1, 1], 30);
      copperSmelter(w, [1, 1], [1], 30);
      // Gears ride the far side of the copper belt to the inserter and belt assemblers.
      assembler(w, 'iron-gear-wheel', 4, { top: ['in', null, 'in'], bottom: [null, 'out'] });
      assembler(w, 'copper-cable', 8, { bottom: [null, 'in'] });
      assembler(w, 'electronic-circuit', 12, { from: ['left'], top: [null, 'in'] });
      assembler(w, 'inserter', 16, { from: ['left'], top: [null, 'in'], bottom: [null, 'in'] });
      assembler(w, 'logistic-science-pack', 20, { from: ['left', 'right'], top: [null, 'out'], stage: 2 });
      assembler(w, 'transport-belt', 24, { top: [null, 'in'], bottom: [null, 'in'] });
      // Until the science assembler arrives, inserters and belts ship straight to the dock.
      w.inserter(18, 6, 'north', 1, undefined, 2);
      w.inserter(26, 6, 'north', 1, undefined, 2);
    },
    stages: [
      {
        round: 1,
        title: 'Inserters and belts',
        text: 'Cable, circuits and gears come together into inserters, next to a belt assembler.',
        orders: [
          { item: 'inserter', perShift: 16 },
          { item: 'transport-belt', perShift: 30 },
        ],
      },
      {
        round: 4,
        title: 'Green science',
        text: 'A science assembler between them turns inserters and belts into logistic science packs.',
        orders: [{ item: 'logistic-science-pack', perShift: 6 }],
      },
    ],
    threatBudget: (r) => 8 + r * 3,
    threats: {
      wear: { weight: 3, from: 1 },
      clog: { weight: 2, from: 1 },
      jam: { weight: 2, from: 1 },
      drift: { weight: 2, from: 1 },
      flood: { weight: 1.5, from: 1 },
    },
    events: [{ round: 6, type: 'trip', second: 40 }],
  },
  {
    id: 'science-lab',
    name: 'Science Lab',
    text: 'Red science first, then the long green science chain. Expect a plant trip and a retirement.',
    rounds: 9,
    shiftSeconds: 90,
    startMoney: 200,
    crews: 2,
    depot: DEPOT,
    cards: cardsUpTo(9),
    build(w) {
      ironSmelter(w, [1, 1, 1, 2, 2, 2, 2, 2], [1, 1, 2, 2, 2], 42);
      copperSmelter(w, [1, 1, 2], [1, 2], 42);
      assembler(w, 'automation-science-pack', 4, { from: ['right'], top: [null, 'out'], bottom: [null, 'in'] });
      assembler(w, 'iron-gear-wheel', 8, { top: ['in', null, 'in'] });
      assembler(w, 'automation-science-pack', 12, { from: ['left'], top: [null, 'out'], bottom: [null, 'in'] });
      assembler(w, 'iron-gear-wheel', 16, { top: ['in', null, 'in'], bottom: [null, 'out'], stage: 2 });
      assembler(w, 'copper-cable', 20, { bottom: [null, 'in'], stage: 2 });
      assembler(w, 'electronic-circuit', 24, { from: ['left'], top: [null, 'in'], stage: 2 });
      assembler(w, 'inserter', 28, { from: ['left'], top: [null, 'in'], bottom: [null, 'in'], stage: 2 });
      assembler(w, 'logistic-science-pack', 32, { from: ['left', 'right'], top: [null, 'out'], stage: 2 });
      assembler(w, 'transport-belt', 36, { top: [null, 'in'], bottom: [null, 'in'], stage: 2 });
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
          { item: 'logistic-science-pack', perShift: 6 },
        ],
      },
    ],
    threatBudget: (r) => 9 + r * 3,
    threats: {
      wear: { weight: 3, from: 1 },
      clog: { weight: 2, from: 1 },
      jam: { weight: 2, from: 1 },
      drift: { weight: 2, from: 1 },
      flood: { weight: 1.5, from: 1 },
    },
    events: [
      { round: 5, type: 'knowledge-loss', second: 30 },
      { round: 7, type: 'trip', second: 40 },
      { round: 9, type: 'trip', second: 20 },
    ],
  },
  {
    id: 'megafactory',
    name: 'Megafactory',
    text: 'Everything at once: red science, green science and circuits for export. Every problem, every event.',
    rounds: 10,
    shiftSeconds: 90,
    startMoney: 220,
    crews: 2,
    depot: DEPOT,
    cards: cardsUpTo(10),
    build(w) {
      ironSmelter(w, [1, 1, 1, 1, 2, 2, 2, 2, 3, 3], [1, 1, 1, 2, 2, 3], 50);
      copperSmelter(w, [1, 1, 2, 3, 3, 3], [1, 2, 3, 3], 50);
      assembler(w, 'automation-science-pack', 4, { from: ['right'], top: [null, 'out'], bottom: [null, 'in'] });
      assembler(w, 'iron-gear-wheel', 8, { top: ['in', null, 'in'] });
      assembler(w, 'automation-science-pack', 12, { from: ['left'], top: [null, 'out'], bottom: [null, 'in'] });
      assembler(w, 'iron-gear-wheel', 16, { top: ['in', null, 'in'], bottom: [null, 'out'], stage: 2 });
      assembler(w, 'copper-cable', 20, { bottom: [null, 'in'], stage: 2 });
      assembler(w, 'electronic-circuit', 24, { from: ['left'], top: [null, 'in'], stage: 2 });
      assembler(w, 'inserter', 28, { from: ['left'], top: [null, 'in'], bottom: [null, 'in'], stage: 2 });
      assembler(w, 'logistic-science-pack', 32, { from: ['left', 'right'], top: [null, 'out'], stage: 2 });
      assembler(w, 'transport-belt', 36, { top: [null, 'in'], bottom: [null, 'in'], stage: 2 });
      assembler(w, 'copper-cable', 40, { bottom: [null, 'in'], stage: 3 });
      assembler(w, 'electronic-circuit', 44, { from: ['left'], top: [null, 'in'], bottom: [null, 'out'], stage: 3 });
    },
    stages: [
      {
        round: 1,
        title: 'Red science',
        text: 'Two science assemblers share one gear assembler.',
        orders: [{ item: 'automation-science-pack', perShift: 14 }],
      },
      {
        round: 3,
        title: 'Green science',
        text: 'The green science chain comes online.',
        orders: [
          { item: 'automation-science-pack', perShift: 14 },
          { item: 'logistic-science-pack', perShift: 6 },
        ],
      },
      {
        round: 6,
        title: 'Circuits for export',
        text: 'A circuit line at the end of the row ships circuits to customers.',
        orders: [
          { item: 'automation-science-pack', perShift: 14 },
          { item: 'logistic-science-pack', perShift: 6 },
          { item: 'electronic-circuit', perShift: 19 },
        ],
      },
    ],
    threatBudget: (r) => 10 + r * 3,
    threats: {
      wear: { weight: 3, from: 1 },
      clog: { weight: 2, from: 1 },
      jam: { weight: 2, from: 1 },
      drift: { weight: 2, from: 1 },
      flood: { weight: 1.5, from: 1 },
    },
    events: [
      { round: 4, type: 'knowledge-loss', second: 30 },
      { round: 5, type: 'trip', second: 50 },
      { round: 8, type: 'trip', second: 30 },
      { round: 10, type: 'trip', second: 20 },
    ],
  },
];
