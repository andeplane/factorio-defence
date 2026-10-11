import type { CardId } from './cards';
import type { ItemName } from './recipes';
import type { Point, World } from './world';

export type ThreatType = 'wear' | 'clog' | 'jam' | 'drift' | 'flood';

export interface Order {
  item: ItemName;
  /** Good items that must reach the dock during one shift. */
  perShift: number;
}

export interface Stage {
  /** First round this stage is built. */
  round: number;
  title: string;
  text: string;
  orders: Order[];
}

export interface BossEvent {
  round: number;
  type: 'trip' | 'knowledge-loss';
  /** Seconds into the shift. */
  second: number;
}

export interface LevelDef {
  id: string;
  name: string;
  text: string;
  rounds: number;
  shiftSeconds: number;
  startMoney: number;
  crews: number;
  /** Where crews start. */
  depot: Point;
  /** Cards that can be offered in this level. */
  cards: CardId[];
  /** Places every entity (with its stage) on the world. */
  build(world: World): void;
  stages: Stage[];
  /** Threat points spent on the shift of a round (1-based), before `difficulty`. */
  threatBudget(round: number): number;
  /** Multiplier on the threat budget, tuned by `npm run tune` so a good player wins most of the time. */
  difficulty?: number;
  /** Relative chance of each threat type, and the first round it can appear. */
  threats: Partial<Record<ThreatType, { weight: number; from: number }>>;
  events: BossEvent[];
}

/** Threat points each threat costs from a shift's budget. */
export const THREAT_COST: Record<ThreatType, number> = {
  wear: 3,
  clog: 2,
  jam: 1.5,
  drift: 4,
  flood: 3,
};
