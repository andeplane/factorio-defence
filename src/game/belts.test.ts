import { describe, expect, it } from 'vitest';
import type { AssetStore } from '../engine/Assets';
import { EntityManager } from '../engine/Entities';
import { PROTOTYPES } from './prototypes';

const belt = PROTOTYPES.find((p) => p.name === 'transport-belt')!;

// Sprite creation needs textures; layer selection is what's under test.
const assets = { animation: () => ({ def: { width: 1, height: 1 }, frames: [undefined] }) } as unknown as AssetStore;

describe('belt shapes', () => {
  it('curves when fed from one side only', () => {
    const w = new EntityManager(assets);
    const corner = w.place(belt, 1, 0, 'south')!;
    expect(corner.layerKeys).toEqual(['transport-belt/south']);
    w.place(belt, 0, 0, 'east');
    expect(corner.layerKeys).toEqual(['transport-belt/east_to_south']);
  });

  it('stays straight when fed from behind or from both sides', () => {
    const w = new EntityManager(assets);
    const b = w.place(belt, 1, 1, 'south')!;
    w.place(belt, 0, 1, 'east');
    w.place(belt, 2, 1, 'west');
    expect(b.layerKeys).toEqual(['transport-belt/south']);
    const c = w.place(belt, 5, 1, 'south')!;
    w.place(belt, 5, 0, 'south');
    w.place(belt, 4, 1, 'east');
    expect(c.layerKeys).toEqual(['transport-belt/south']);
  });

  it('straightens again when the feeder is removed', () => {
    const w = new EntityManager(assets);
    const corner = w.place(belt, 1, 0, 'north')!;
    const feeder = w.place(belt, 2, 0, 'west')!;
    expect(corner.layerKeys).toEqual(['transport-belt/west_to_north']);
    w.remove(feeder);
    expect(corner.layerKeys).toEqual(['transport-belt/north']);
  });
});
