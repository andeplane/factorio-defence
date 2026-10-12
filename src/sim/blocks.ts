import type { Dir } from './factory';
import type { ItemName } from './recipes';
import type { World } from './world';

/**
 * Building blocks every level shares, so all levels read the same way:
 *
 *   y=-3..-1  iron drills (left of the furnaces, feeding the ore belt)
 *   y=0       iron ore belt
 *   y=2..3    iron furnaces
 *   y=5       iron belt: iron plates on the south lane, products on the north lane
 *   y=7..9    assembler row (inserters at y=6 reach the iron belt, at y=10 the copper belt)
 *   y=11      copper belt: copper plates on the north lane, products on the south lane
 *   y=13..14  copper furnaces
 *   y=16      copper ore belt
 *   y=17..19  copper drills
 *
 * Both product belts end at the dock on the east side.
 */
export const IRON_BELT_Y = 5;
export const COPPER_BELT_Y = 11;
export const ROW_Y = 7;

/**
 * Iron smelting: one entry per furnace and per drill, giving the stage it is built in.
 * Furnaces sit at x = 0, 2, 4, ...; drills at x = -3, -6, ... feed the ore belt upstream of them.
 */
export function ironSmelter(w: World, furnaces: number[], drills: number[], beltEnd: number): void {
  smelter(w, 'iron-ore', 'iron-plate', furnaces, drills, beltEnd, 'north');
}

export function copperSmelter(w: World, furnaces: number[], drills: number[], beltEnd: number): void {
  smelter(w, 'copper-ore', 'copper-plate', furnaces, drills, beltEnd, 'south');
}

function smelter(
  w: World,
  ore: ItemName,
  plate: string,
  furnaces: number[],
  drills: number[],
  beltEnd: number,
  side: 'north' | 'south',
): void {
  const top = side === 'north';
  const oreY = top ? 0 : 16;
  const plateY = top ? IRON_BELT_Y : COPPER_BELT_Y;
  const toPlates: Dir = top ? 'south' : 'north';
  const oreStart = -3 * drills.length;
  const oreEnd = Math.max(2 * furnaces.length - 1, 1);
  const stageOf = (stages: number[]) => Math.min(...stages);
  w.belt(
    [
      [oreStart, oreY],
      [oreEnd, oreY],
    ],
    { stage: stageOf(drills) },
  );
  drills.forEach((stage, i) => w.drill(ore, -3 * (i + 1), top ? -3 : 17, top ? 'south' : 'north', stage));
  furnaces.forEach((stage, i) => {
    const x = 2 * i;
    w.furnace(plate, x, top ? 2 : 13, stage);
    w.inserter(x, top ? 1 : 15, toPlates, stage);
    w.inserter(x, top ? 4 : 12, toPlates, stage);
  });
  w.belt(
    [
      [0, plateY],
      [beltEnd, plateY],
    ],
    { sink: true, stage: stageOf(furnaces) },
  );
}

/** What an inserter on the top (iron belt) or bottom (copper belt) edge of an assembler does. */
export type Port = 'in' | 'out' | null;

export interface AssemblerSpec {
  stage?: number;
  /** Inserters at columns 0..2 of the top edge: 'in' takes from the iron belt, 'out' puts products on it. */
  top?: Port[];
  /** The same for the bottom edge and the copper belt. */
  bottom?: Port[];
  /** Takes the output of the assembler to the left (west) or right (east), 1 tile apart. */
  from?: ('left' | 'right')[];
}

/** An assembling machine 1 in the assembler row with its top-left x. Assemblers sit 4 tiles apart. */
export function assembler(w: World, recipe: string, x: number, spec: AssemblerSpec = {}): void {
  const stage = spec.stage ?? 1;
  w.assembler(recipe, x, ROW_Y, stage);
  spec.top?.forEach((p, c) => {
    if (p) w.inserter(x + c, ROW_Y - 1, p === 'in' ? 'south' : 'north', stage);
  });
  spec.bottom?.forEach((p, c) => {
    if (p) w.inserter(x + c, ROW_Y + 3, p === 'in' ? 'north' : 'south', stage);
  });
  for (const f of spec.from ?? []) {
    if (f === 'left') w.inserter(x - 1, ROW_Y + 1, 'east', stage);
    else w.inserter(x + 3, ROW_Y + 1, 'west', stage);
  }
}
