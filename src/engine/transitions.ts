/**
 * Factorio-style tile transitions. A cell next to a tile of a higher layer
 * gets overlay pieces cut from that higher tile, chosen from which of the
 * cell's 4 edges and 4 corners touch it. See docs/ASSETS.md for the keys.
 */

export type Edge = 'north' | 'east' | 'south' | 'west';
export type Corner = 'ne' | 'se' | 'sw' | 'nw';

export const EDGES: Edge[] = ['north', 'east', 'south', 'west'];
export const CORNERS: Corner[] = ['ne', 'se', 'sw', 'nw'];

export const EDGE_OFFSET: Record<Edge, [number, number]> = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] };
export const CORNER_OFFSET: Record<Corner, [number, number]> = { ne: [1, -1], se: [1, 1], sw: [-1, 1], nw: [-1, -1] };
const CORNER_EDGES: Record<Corner, [Edge, Edge]> = { ne: ['north', 'east'], se: ['south', 'east'], sw: ['south', 'west'], nw: ['north', 'west'] };

/** Every piece suffix a tile can provide, e.g. "side/north". */
export const TRANSITION_PIECES: string[] = [
  ...EDGES.map((e) => `side/${e}`),
  ...CORNERS.map((c) => `outer_corner/${c}`),
  ...CORNERS.map((c) => `inner_corner/${c}`),
  ...EDGES.map((e) => `u_transition/${e}`),
  'o_transition',
];

/**
 * Pieces covering a cell whose `edges` and `corners` touch the higher tile.
 * Edges decide the main piece; corners only add outer corners where neither
 * adjacent edge already covers them.
 */
export function transitionPieces(edges: Set<Edge>, corners: Set<Corner>): string[] {
  const pieces: string[] = [];
  const n = edges.size;
  if (n === 4) {
    pieces.push('o_transition');
  } else if (n === 3) {
    pieces.push(`u_transition/${EDGES.find((e) => !edges.has(e))}`);
  } else if (n === 2) {
    const corner = CORNERS.find((c) => CORNER_EDGES[c].every((e) => edges.has(e)));
    if (corner) pieces.push(`inner_corner/${corner}`);
    else for (const e of EDGES) if (edges.has(e)) pieces.push(`side/${e}`);
  } else if (n === 1) {
    pieces.push(`side/${[...edges][0]}`);
  }
  for (const c of CORNERS) {
    if (corners.has(c) && !CORNER_EDGES[c].some((e) => edges.has(e))) pieces.push(`outer_corner/${c}`);
  }
  return pieces;
}

/** Which edges/corners each piece covers, for drawing placeholder art. */
export function pieceCoverage(piece: string): { edges: Edge[]; corners: Corner[] } {
  const [kind, where] = piece.split('/') as [string, string | undefined];
  switch (kind) {
    case 'side':
      return { edges: [where as Edge], corners: [] };
    case 'outer_corner':
      return { edges: [], corners: [where as Corner] };
    case 'inner_corner':
      return { edges: [...CORNER_EDGES[where as Corner]], corners: [] };
    case 'u_transition':
      return { edges: EDGES.filter((e) => e !== where), corners: [] };
    default:
      return { edges: [...EDGES], corners: [] };
  }
}

/**
 * Overlay pieces for the cell at (x, y). `tileAt` gives tile indices,
 * `layerOf` their layer. Returns [higher tile index, piece] pairs, lower
 * layers first so higher transitions draw on top.
 */
export function cellTransitions(
  x: number,
  y: number,
  tileAt: (x: number, y: number) => number,
  layerOf: (tile: number) => number,
): [number, string][] {
  const own = layerOf(tileAt(x, y));
  const higher = new Set<number>();
  const around = [...EDGES.map((e) => EDGE_OFFSET[e]), ...CORNERS.map((c) => CORNER_OFFSET[c])];
  for (const [dx, dy] of around) {
    const t = tileAt(x + dx, y + dy);
    if (layerOf(t) > own) higher.add(t);
  }
  const out: [number, string][] = [];
  for (const h of [...higher].sort((a, b) => layerOf(a) - layerOf(b))) {
    // Anything at or above h's layer counts, so h's border runs on under even higher tiles.
    const hits = (dx: number, dy: number) => layerOf(tileAt(x + dx, y + dy)) >= layerOf(h);
    const edges = new Set(EDGES.filter((e) => hits(...EDGE_OFFSET[e])));
    const corners = new Set(CORNERS.filter((c) => hits(...CORNER_OFFSET[c])));
    for (const p of transitionPieces(edges, corners)) out.push([h, p]);
  }
  return out;
}
