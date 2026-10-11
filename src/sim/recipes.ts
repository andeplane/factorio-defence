/** Factorio 1.1 items and recipes used by the levels. */
export type ItemName =
  | 'iron-ore'
  | 'copper-ore'
  | 'iron-plate'
  | 'copper-plate'
  | 'iron-gear-wheel'
  | 'copper-cable'
  | 'electronic-circuit'
  | 'automation-science-pack'
  | 'inserter'
  | 'transport-belt'
  | 'logistic-science-pack';

export interface Recipe {
  name: string;
  /** Crafting time in seconds at crafting speed 1. */
  time: number;
  ingredients: [ItemName, number][];
  result: ItemName;
  count: number;
}

const r = (name: ItemName, time: number, ingredients: [ItemName, number][], count = 1): Recipe => ({
  name,
  time,
  ingredients,
  result: name,
  count,
});

export const RECIPES: Record<string, Recipe> = {
  'iron-plate': r('iron-plate', 3.2, [['iron-ore', 1]]),
  'copper-plate': r('copper-plate', 3.2, [['copper-ore', 1]]),
  'iron-gear-wheel': r('iron-gear-wheel', 0.5, [['iron-plate', 2]]),
  'copper-cable': r('copper-cable', 0.5, [['copper-plate', 1]], 2),
  'electronic-circuit': r('electronic-circuit', 0.5, [
    ['iron-plate', 1],
    ['copper-cable', 3],
  ]),
  'automation-science-pack': r('automation-science-pack', 5, [
    ['copper-plate', 1],
    ['iron-gear-wheel', 1],
  ]),
  inserter: r('inserter', 0.5, [
    ['electronic-circuit', 1],
    ['iron-gear-wheel', 1],
    ['iron-plate', 1],
  ]),
  'transport-belt': r(
    'transport-belt',
    0.5,
    [
      ['iron-plate', 1],
      ['iron-gear-wheel', 1],
    ],
    2,
  ),
  'logistic-science-pack': r('logistic-science-pack', 6, [
    ['inserter', 1],
    ['transport-belt', 1],
  ]),
};

/** Money paid per item that reaches the dock. Off-spec items pay nothing. */
export const ITEM_VALUE: Record<ItemName, number> = {
  'iron-ore': 0,
  'copper-ore': 0,
  'iron-plate': 0.5,
  'copper-plate': 0.5,
  'iron-gear-wheel': 3,
  'copper-cable': 1,
  'electronic-circuit': 6,
  'automation-science-pack': 12,
  inserter: 10,
  'transport-belt': 4,
  'logistic-science-pack': 30,
};

/** Crafting speeds from Factorio 1.1. */
export const CRAFTING_SPEED = { 'stone-furnace': 1, 'assembling-machine-1': 0.5, 'assembling-machine-2': 0.75 } as const;
export type MachineType = keyof typeof CRAFTING_SPEED;
