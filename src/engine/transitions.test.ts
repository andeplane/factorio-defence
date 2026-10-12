import { describe, expect, it } from 'vitest';
import { cellTransitions, transitionPieces, type Corner, type Edge } from './transitions';

const pieces = (edges: Edge[], corners: Corner[] = []) => transitionPieces(new Set(edges), new Set(corners));

describe('transitionPieces', () => {
  it('picks the piece from the covered edges', () => {
    expect(pieces(['north'])).toEqual(['side/north']);
    expect(pieces(['north', 'east'])).toEqual(['inner_corner/ne']);
    expect(pieces(['north', 'south'])).toEqual(['side/north', 'side/south']);
    expect(pieces(['north', 'east', 'west'])).toEqual(['u_transition/south']);
    expect(pieces(['north', 'east', 'south', 'west'])).toEqual(['o_transition']);
  });

  it('adds outer corners only where no edge covers them', () => {
    expect(pieces([], ['ne', 'sw'])).toEqual(['outer_corner/ne', 'outer_corner/sw']);
    expect(pieces(['north'], ['ne', 'se'])).toEqual(['side/north', 'outer_corner/se']);
    expect(pieces(['north', 'east'], ['sw'])).toEqual(['inner_corner/ne', 'outer_corner/sw']);
  });
});

describe('cellTransitions', () => {
  // 0 = low layer, 1 = mid, 2 = high
  const grid = (rows: string[]) => (x: number, y: number) => Number(rows[y + 1]?.[x + 1] ?? '0');
  const layer = (t: number) => t;

  it('draws a higher tile over a lower neighbour', () => {
    const at = grid(['000', '000', '111']);
    expect(cellTransitions(0, 0, at, layer)).toEqual([[1, 'side/south']]);
    expect(cellTransitions(0, 1, at, layer)).toEqual([]);
  });

  it('orders several higher tiles by layer and lets higher ones count for lower borders', () => {
    const at = grid(['200', '000', '111']);
    expect(cellTransitions(0, 0, at, layer)).toEqual([
      [1, 'side/south'],
      [1, 'outer_corner/nw'],
      [2, 'outer_corner/nw'],
    ]);
  });
});
