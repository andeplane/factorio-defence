import type { Direction } from './Entities';

/** 0 = left lane, 1 = right lane, seen in the direction of travel (Factorio's lane order). */
export type Lane = 0 | 1;

const VEC: Record<Direction, [number, number]> = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] };
const LEFT: Record<Direction, Direction> = { north: 'west', east: 'north', south: 'east', west: 'south' };

/** Distance of each lane from the belt's centre line, in tiles. */
export const LANE_OFFSET = 0.25;

/**
 * Where an item at `pos` (0 = entering the tile, 1 = leaving it) on `lane`
 * of a belt tile sits, as an offset in tiles from the tile's centre. `from`
 * is the direction items enter a curved belt with (undefined if straight);
 * lanes keep their side through curves, as in Factorio.
 */
export function lanePoint(dir: Direction, from: Direction | undefined, lane: Lane, pos: number): [number, number] {
  const side = lane === 0 ? LANE_OFFSET : -LANE_OFFSET;
  const [vx, vy] = VEC[dir];
  const [lx, ly] = VEC[LEFT[dir]];
  if (!from || from === dir) {
    return [vx * (pos - 0.5) + lx * side, vy * (pos - 0.5) + ly * side];
  }
  const [fx, fy] = VEC[from];
  const [flx, fly] = VEC[LEFT[from]];
  // The arc turns around the tile corner shared by the entry and exit edges.
  const cx = -fx * 0.5 + vx * 0.5;
  const cy = -fy * 0.5 + vy * 0.5;
  const entry: [number, number] = [-fx * 0.5 + flx * side, -fy * 0.5 + fly * side];
  const exit: [number, number] = [vx * 0.5 + lx * side, vy * 0.5 + ly * side];
  const r = Math.hypot(entry[0] - cx, entry[1] - cy);
  const a0 = Math.atan2(entry[1] - cy, entry[0] - cx);
  let delta = Math.atan2(exit[1] - cy, exit[0] - cx) - a0;
  if (delta > Math.PI) delta -= 2 * Math.PI;
  if (delta < -Math.PI) delta += 2 * Math.PI;
  const a = a0 + delta * pos;
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
}
