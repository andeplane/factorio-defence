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

PROTOTYPES.push(
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

export const TILE_NAMES = ['grass-1', 'dirt-1', 'sand-1'];
