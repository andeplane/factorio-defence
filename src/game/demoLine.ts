import type { Direction, EntityManager, EntityPrototype } from '../engine/Entities';
import type { Lane } from '../engine/beltGeometry';
import type { FactoryViewState } from '../engine/FactoryView';

/**
 * Lays out the first production line from the design notes (ore, furnaces,
 * plates, an assembler making gears, a dock) and animates it with a purely
 * visual driver: items glide along fixed loops and inserters swing on a
 * timer. There are no game rules here; the real simulation (src/sim) will
 * produce FactoryViewState instead.
 */
export function buildGearLine(entities: EntityManager, proto: (name: string) => EntityPrototype, ox: number, oy: number) {
  const place = (name: string, x: number, y: number, dir: Direction = 'north') => entities.place(proto(name), ox + x, oy + y, dir);

  // Ore: three drills feed a belt running east.
  place('electric-mining-drill', 0, -3, 'south');
  place('electric-mining-drill', 3, -3, 'south');
  place('electric-mining-drill', 0, 1, 'north');
  for (let x = 0; x <= 12; x++) place('transport-belt', x, 0, 'east');
  // Smelting: inserters pull ore into four furnaces and put plates on a second belt.
  for (const x of [4, 6, 8, 10]) {
    place('inserter', x, 1, 'south');
    place('stone-furnace', x, 2);
    place('inserter', x + 1, 4, 'south');
  }
  for (let x = 4; x <= 16; x++) place('transport-belt', x, 5, 'east');
  // Gears: two inserters feed the assembler, one takes gears out to the dock belt.
  place('inserter', 14, 6, 'south');
  place('inserter', 15, 6, 'south');
  place('assembling-machine-1', 14, 7);
  place('inserter', 15, 10, 'south');
  for (let x = 15; x <= 21; x++) place('transport-belt', x, 11, 'east');
  place('inserter', 22, 11, 'east');
  place('wooden-chest', 23, 11);

  const streams: { y: number; x0: number; x1: number; lanes: Lane[]; item: string; spacing: number }[] = [
    { y: 0, x0: 0, x1: 12, lanes: [0, 1], item: 'iron-ore', spacing: 0.5 },
    { y: 5, x0: 4, x1: 16, lanes: [1], item: 'iron-plate', spacing: 0.75 },
    { y: 11, x0: 15, x1: 21, lanes: [1], item: 'iron-gear-wheel', spacing: 1.25 },
  ];
  const inserters: { x: number; y: number; item: string; phase: number }[] = [
    ...[4, 6, 8, 10].map((x, i) => ({ x, y: 1, item: 'iron-ore', phase: i * 17 })),
    ...[5, 7, 9, 11].map((x, i) => ({ x, y: 4, item: 'iron-plate', phase: 40 + i * 23 })),
    { x: 14, y: 6, item: 'iron-plate', phase: 0 },
    { x: 15, y: 6, item: 'iron-plate', phase: 36 },
    { x: 15, y: 10, item: 'iron-gear-wheel', phase: 10 },
    { x: 22, y: 11, item: 'iron-gear-wheel', phase: 50 },
  ];
  const machines = [
    ...[4, 6, 8, 10].map((x) => ({ x: ox + x, y: oy + 2 })),
    { x: ox + 14, y: oy + 7 },
    { x: ox, y: oy - 3 },
    { x: ox + 3, y: oy - 3 },
    { x: ox, y: oy + 1 },
  ];
  const BELT_SPEED = 0.03125; // tiles per tick, Factorio's yellow belt
  const SWING_TICKS = 36; // half a turn at 0.014 turns per tick

  return function state(tick: number): FactoryViewState {
    const beltItems: FactoryViewState['beltItems'] = [];
    for (const s of streams) {
      const length = s.x1 - s.x0 + 1;
      for (const lane of s.lanes) {
        const shift = (tick * BELT_SPEED + lane * s.spacing * 0.5) % s.spacing;
        for (let d = shift; d < length; d += s.spacing) {
          const tile = Math.floor(d);
          beltItems.push({ x: ox + s.x0 + tile, y: oy + s.y, lane, pos: d - tile, item: s.item });
        }
      }
    }
    const inserterStates = inserters.map((ins) => {
      const t = (tick + ins.phase) % (SWING_TICKS * 2);
      const outbound = t < SWING_TICKS;
      return {
        x: ox + ins.x,
        y: oy + ins.y,
        swing: outbound ? t / SWING_TICKS : 2 - t / SWING_TICKS,
        held: outbound ? ins.item : null,
      };
    });
    return {
      beltItems,
      inserters: inserterStates,
      machines: machines.map((m) => ({ ...m, working: true })),
    };
  };
}
