/**
 * Every rule of the repair loop in one place. The simulation, the card texts and the in-game
 * problem guide all read from here, so what the game says is what the game does.
 *
 * The loop: a problem starts hidden. It gets fixed only after it is **spotted** (by an operator
 * seeing its effects, a Cognite product reading its signal, or it breaking down). A work order
 * then goes out after the **dispatch** delay, and the nearest free crew walks over and **fixes** it.
 */

export type ProblemType = 'wear' | 'clog' | 'jam' | 'drift' | 'false-alarm';

/** Who or what can spot a problem. Cognite products need the equipment in range (and connected, where noted). */
export type Spotter = 'charts' | 'asset-data-insights' | 'inrobot';

export interface ProblemRule {
  /** Short name for labels: "Bearing wear". */
  name: string;
  /** In a sentence: "bearing wear". */
  noun: string;
  /** What it hits. */
  on: string;
  /** The real-world cause and what it does to the line. */
  what: string;
  /** The measurable signal Cognite products read. */
  signal: string;
  /** How a plant without Cognite finds out. */
  unaided: string;
  /** Operators notice its effects after this many seconds (halved on connected equipment). Null: they never do. */
  operatorSeconds: number | null;
  /**
   * Cognite products that spot it early. For wear `at` is the wear level (0 to 1); for the rest
   * it is seconds since the problem started.
   */
  spot: { by: Spotter; at: number }[];
  /** Crew repair: time in seconds and cost. `late` applies once the machine has broken down. */
  repair: { seconds: number; cost: number; late?: { seconds: number; cost: number } };
}

export const PROBLEMS: Record<ProblemType, ProblemRule> = {
  wear: {
    name: 'Bearing wear',
    noun: 'bearing wear',
    on: 'furnaces and assemblers',
    what: 'A motor bearing wears out over 40 to 70 s. Past half way the machine runs at 70% speed; at 100% it seizes and stops.',
    signal: 'vibration',
    unaided: 'Nobody notices until the machine seizes.',
    operatorSeconds: null,
    spot: [
      { by: 'charts', at: 0.15 },
      { by: 'asset-data-insights', at: 0.3 },
      { by: 'inrobot', at: 0.35 },
    ],
    repair: { seconds: 3, cost: 10, late: { seconds: 15, cost: 60 } },
  },
  clog: {
    name: 'Clogged belt',
    noun: 'a clogged belt',
    on: 'belts',
    what: 'Spilled items block one lane of a belt. Everything behind it backs up.',
    signal: 'belt throughput',
    unaided: 'An operator notices the backed-up belt after 12 s.',
    operatorSeconds: 12,
    spot: [
      { by: 'charts', at: 1 },
      { by: 'inrobot', at: 3 },
    ],
    repair: { seconds: 4, cost: 8 },
  },
  jam: {
    name: 'Jammed inserter',
    noun: 'a jammed inserter',
    on: 'inserters',
    what: 'The gripper of an inserter sticks and the arm stops moving items.',
    signal: 'arm cycle count',
    unaided: 'An operator notices the idle arm after 8 s.',
    operatorSeconds: 8,
    spot: [
      { by: 'charts', at: 1 },
      { by: 'inrobot', at: 3 },
    ],
    repair: { seconds: 3, cost: 6 },
  },
  drift: {
    name: 'Sensor drift',
    noun: 'sensor drift',
    on: 'furnaces and assemblers',
    what: 'A temperature sensor drifts, so the machine runs off its setpoint and 40% of what it makes is off-spec. Off-spec goods earn nothing and spoil what is made from them.',
    signal: 'sensor readings against lab quality data',
    unaided: 'Never seen on the floor. The quality lab reports it at the end of the shift, if it ran for 30 s or more.',
    operatorSeconds: null,
    spot: [{ by: 'charts', at: 5 }],
    repair: { seconds: 4, cost: 15 },
  },
  'false-alarm': {
    name: 'False alarm',
    noun: 'a false alarm',
    on: 'furnaces and assemblers',
    what: 'During an alarm flood, a chattering switch raises alarms on healthy machines.',
    signal: 'alarm history',
    unaided: 'Every alarm is seen at once, and a crew goes out to check each one for nothing.',
    operatorSeconds: 0,
    spot: [],
    repair: { seconds: 3, cost: 0 },
  },
};

/** Timings and multipliers. Seconds unless noted. */
export const RULE = {
  /** Paid per crew member at the end of every shift. */
  crewWage: 12,
  /** Each crew member hired costs this much more than the last. */
  crewPriceStep: 30,
  /** Time from spotting a problem to the work order reaching a crew. Cognite Flows makes it 0. */
  dispatchDelay: 6,
  /** Crew walking speed, tiles per second. */
  crewSpeed: 4,
  /** Operators see clogs and jams on connected equipment this much sooner (Data Fusion). */
  connectedOperator: 0.5, // the Data Fusion card says "in half the time"
  /** InField: walking speed and repair cost multipliers. */
  infieldSpeed: 1.5,
  infieldCost: 0.75,
  /** Asset Data Insights: repair time multiplier on connected machines. */
  adiRepair: 0.6,
  /** Knowledge loss: repair time multiplier, unless Data Fusion is owned. */
  knowledgeLoss: 1.5,
  /** Cognite Search finds the oldest hidden problem this often. */
  searchPeriod: 20,
  /** Atlas AI recalibrates a spotted drifting sensor remotely after this long. */
  atlasRecalibrate: 5,
  /** Plant trip length; Simulators halves it. */
  tripSeconds: 12,
  simulatorsTrip: 0.5,
  /** Industrial Canvas: the root-caused problem type spawns this much as often. */
  canvasRate: 0.6,
  /** Wear slows a machine past this level, to this speed. */
  wearSlowAt: 0.5,
  wearSlowSpeed: 0.7,
  /** Share of off-spec output from a drifting sensor. */
  driftOffSpec: 0.4,
  /** The quality lab catches drift that ran at least this long. */
  qualityLabSeconds: 30,
};

export const SPOTTER_NAME: Record<Spotter, string> = {
  charts: 'Charts',
  'asset-data-insights': 'Asset Data Insights',
  inrobot: 'InRobot',
};

const pct = (x: number) => `${Math.round(x * 100)}%`;
const times = (x: number) => (x < 1 ? `${Math.round((1 - x) * 100)}% less` : `${Math.round((x - 1) * 100)}% more`);

/** When a spotter catches a problem, in words: "at 15% wear", "after 1 s". */
export function spotWhen(type: ProblemType, at: number): string {
  return type === 'wear' ? `at ${pct(at)} wear` : `after ${at} s`;
}

/** The sentence on a spotting card listing what it catches, built from PROBLEMS. */
export function spotsText(by: Spotter): string {
  return (Object.keys(PROBLEMS) as ProblemType[])
    .flatMap((t) => PROBLEMS[t].spot.filter((s) => s.by === by).map((s) => `${PROBLEMS[t].noun} ${spotWhen(t, s.at)}`))
    .join(', ');
}

export const RULE_TEXT = { pct, times };
