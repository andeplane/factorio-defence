import { DIRECTIONS, rotate, type Direction, type Entity, type EntityManager } from '../engine/Entities';

const VEC: Record<Direction, [number, number]> = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] };

/** transport-belt/<from>_to_<to> keys for all eight curves, as in transport-belt-pictures.lua. */
export const BELT_CURVE_KEYS = DIRECTIONS.flatMap((from) =>
  [rotate(from, 1), rotate(from, -1)].map((to) => `transport-belt/${from}_to_${to}`),
);

/**
 * Factorio's belt shape rule: a belt curves when nothing feeds it from
 * behind and exactly one belt feeds it from a side. Otherwise it is straight
 * (two side inputs make a sideload).
 */
export function beltLayers(e: Entity, world: EntityManager): string[] | undefined {
  const name = e.proto.name;
  const feeds = (dir: Direction): Entity | undefined => {
    // The neighbour on the `dir` side feeds us if it is a belt pointing back at us.
    const [dx, dy] = VEC[dir];
    const n = world.at(e.x + dx, e.y + dy);
    return n && n.proto.name === name && n.direction === rotate(dir, 2) ? n : undefined;
  };
  if (feeds(rotate(e.direction, 2))) return undefined;
  const left = feeds(rotate(e.direction, -1));
  const right = feeds(rotate(e.direction, 1));
  const side = left && !right ? left : right && !left ? right : undefined;
  return side ? [`${name}/${side.direction}_to_${e.direction}`] : undefined;
}
