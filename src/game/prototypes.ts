import type { EntityPrototype } from '../engine/Entities';
import type { UnitPrototype } from '../engine/Units';
import { BELT_CURVE_KEYS, beltLayers } from './belts';

export const PROTOTYPES: EntityPrototype[] = [
  {
    name: 'transport-belt',
    size: [1, 1],
    rotatable: true,
    layers: {
      north: ['transport-belt/north'],
      east: ['transport-belt/east'],
      south: ['transport-belt/south'],
      west: ['transport-belt/west'],
    },
    connectedLayers: beltLayers,
    extraKeys: BELT_CURVE_KEYS,
    renderLayer: 'ground',
    syncAnimation: true,
  },
  {
    name: 'assembling-machine-1',
    size: [3, 3],
    rotatable: false,
    layers: ['assembling-machine-1/shadow', 'assembling-machine-1'],
  },
  {
    name: 'radar',
    size: [3, 3],
    rotatable: false,
    layers: ['radar/shadow', 'radar'],
  },
  {
    name: 'wooden-chest',
    size: [1, 1],
    rotatable: false,
    layers: ['wooden-chest'],
  },
];

const perDirection = (f: (d: string) => string[]) =>
  ({ north: f('north'), east: f('east'), south: f('south'), west: f('west') });

PROTOTYPES.push(
  {
    name: 'inserter',
    size: [1, 1],
    rotatable: true,
    // Direction is the side the inserter drops to.
    layers: perDirection((d) => [`inserter/platform/${d}`]),
  },
  {
    name: 'stone-furnace',
    size: [2, 2],
    rotatable: false,
    layers: ['stone-furnace/shadow', 'stone-furnace'],
    workingLayers: ['stone-furnace/fire', 'stone-furnace/fire/light', 'stone-furnace/ground_light'],
  },
  {
    name: 'electric-mining-drill',
    size: [3, 3],
    rotatable: true,
    // Direction is the side the drill outputs to.
    // The body is only the frame; the head and output chute are separate animated layers.
    layers: perDirection((d) => [
      `electric-mining-drill/${d}/shadow`,
      `electric-mining-drill/${d}/drill/shadow`,
      `electric-mining-drill/${d}`,
      `electric-mining-drill/${d}/drill`,
      // Factorio 1.1 has no output chute for a south-facing drill.
      ...(d === 'south' ? [] : [`electric-mining-drill/${d}/output`]),
    ]),
  },
  {
    name: 'pumpjack',
    size: [3, 3],
    rotatable: false,
    layers: ['pumpjack/shadow', 'pumpjack', 'pumpjack/north/shadow', 'pumpjack/north'],
  },
  {
    name: 'gun-turret',
    size: [2, 2],
    rotatable: false,
    directionCount: 64,
    layers: [
      'gun-turret',
      'gun-turret/2',
      'gun-turret/attacking_animation/shadow/dir/{dir}',
      'gun-turret/attacking_animation/dir/{dir}',
      'gun-turret/attacking_animation/2/dir/{dir}',
    ],
  },
);

function biter(name: string, speed: number): UnitPrototype {
  return {
    name,
    directionCount: 16,
    speed,
    layers: [`${name}/shadow/dir/{dir}`, `${name}/dir/{dir}`, `${name}/2/dir/{dir}`, `${name}/3/dir/{dir}`],
  };
}

export const UNITS = {
  smallBiter: biter('small-biter', 0.05),
  mediumBiter: biter('medium-biter', 0.04),
};

/** Items the views may draw (icons are preloaded for these). */
export const ITEM_NAMES = ['iron-ore', 'iron-plate', 'iron-gear-wheel', 'copper-ore', 'copper-plate', 'copper-cable'];

export const TILE_NAMES = ['grass-1', 'dirt-1', 'sand-1'];
