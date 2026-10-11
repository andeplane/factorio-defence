import type { EntityPrototype } from '../engine/Entities';
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

export const TILE_NAMES = ['grass-1', 'dirt-1', 'sand-1'];
