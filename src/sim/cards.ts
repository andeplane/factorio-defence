import { PROBLEMS, RULE, RULE_TEXT, spotsText, type ProblemType, type Spotter } from './rules';

/** Cognite products (and the plain maintenance crew) the player can buy between shifts. */
export type CardId =
  | 'crew'
  | 'data-fusion'
  | 'extractor'
  | 'charts'
  | 'asset-data-insights'
  | 'infield'
  | 'inrobot'
  | 'atlas-ai'
  | 'canvas'
  | 'maintain'
  | 'simulators'
  | 'search'
  | 'flows';

export interface CardDef {
  id: CardId;
  name: string;
  price: number;
  /** Placed on the map with this footprint and effect radius (tiles). */
  placed?: { size: number; radius: number };
  /** Can only be owned once. */
  unique: boolean;
  /** Only offered once this card is owned. */
  requires?: CardId;
  /** One line for the card face. */
  text: string;
  /** Which step of the repair loop it improves, as a tag on the card. */
  helps: string;
  /** Spotting cards: whose list of caught problems `cardText` narrows to the level. */
  spots?: Spotter;
}

/** The card face for a level: spotting cards list only the problems that level has. */
export function cardText(def: CardDef, problems: ProblemType[]): string {
  if (!def.spots) return def.text;
  const list = spotsText(def.spots, problems);
  return def.text.replace(spotsText(def.spots), list || 'nothing this level has');
}

export const CARDS: Record<CardId, CardDef> = {
  crew: {
    id: 'crew',
    name: 'Maintenance crew',
    price: 70,
    unique: false,
    text: `Another crew member to walk to spotted problems and fix them. Every crew costs $${RULE.crewPriceStep} more to hire than the last, and each is paid $${RULE.crewWage} per shift.`,
    helps: 'Fix more at once',
  },
  'data-fusion': {
    id: 'data-fusion',
    name: 'Cognite Data Fusion',
    price: 70,
    placed: { size: 3, radius: 10 },
    unique: false,
    text: `Connects the equipment in range, so its data reaches operators and the other Cognite apps. Operators notice ${(Object.values(PROBLEMS) as { noun: string; connectedHelpsOperators: boolean }[]).filter((r) => r.connectedHelpsOperators).map((r) => r.noun.replace(/^an? /, '') + 's').join(' and ')} on connected equipment in ${RULE.connectedOperator === 0.5 ? 'half the time' : RULE_TEXT.pct(RULE.connectedOperator) + ' of the time'}. When an experienced operator retires, connected equipment keeps its history, so repairs there stay at full speed.`,
    helps: 'Connect · Spot sooner',
  },
  extractor: {
    id: 'extractor',
    name: 'Extractor',
    price: 25,
    placed: { size: 1, radius: 5 },
    unique: false,
    requires: 'data-fusion',
    text: 'Connects equipment in a small radius. Must sit in range of a Data Fusion hub.',
    helps: 'Connect',
  },
  charts: {
    id: 'charts',
    name: 'Cognite Charts',
    price: 55,
    placed: { size: 1, radius: 7 },
    unique: false,
    requires: 'data-fusion',
    text: `Alerts on live sensor data from connected equipment in its range (place it inside a hub's range). Spots ${spotsText('charts')}.`,
    spots: 'charts',
    helps: 'Spot sooner',
  },
  'asset-data-insights': {
    id: 'asset-data-insights',
    name: 'Asset Data Insights',
    price: 80,
    unique: true,
    requires: 'data-fusion',
    text: `Machine history and condition for connected machines. Spots ${spotsText('asset-data-insights')}. Crews repair connected machines ${RULE_TEXT.pct(1 - RULE.adiRepair)} faster.`,
    helps: 'Spot sooner · Fix faster',
    spots: 'asset-data-insights',
  },
  infield: {
    id: 'infield',
    name: 'Cognite InField',
    price: 70,
    unique: true,
    text: `Work orders and checklists on the crew's phones: crews walk ${RULE_TEXT.pct(RULE.infieldSpeed - 1)} faster and repairs cost ${RULE_TEXT.pct(1 - RULE.infieldCost)} less.`,
    helps: 'Fix faster',
  },
  inrobot: {
    id: 'inrobot',
    name: 'Cognite InRobot',
    price: 75,
    placed: { size: 2, radius: 8 },
    unique: false,
    requires: 'data-fusion',
    text: `A robot inspects everything in its range, connected or not, and reports through Data Fusion (place it inside a hub's range). Spots ${spotsText('inrobot')}.`,
    spots: 'inrobot',
    helps: 'Spot sooner',
  },
  'atlas-ai': {
    id: 'atlas-ai',
    name: 'Atlas AI agent',
    price: 120,
    unique: true,
    requires: 'data-fusion',
    text: `An AI agent on your plant data: dismisses false alarms, sends crews to what hurts output most, and recalibrates drifting sensors remotely ${RULE.atlasRecalibrate} s after they are spotted.`,
    helps: 'Fix what matters',
  },
  canvas: {
    id: 'canvas',
    name: 'Industrial Canvas',
    price: 45,
    unique: false,
    text: `Root cause analysis on the problem you have seen most so far: it happens ${RULE_TEXT.pct(1 - RULE.canvasRate)} less often from the next shift on.`,
    helps: 'Prevent',
  },
  maintain: {
    id: 'maintain',
    name: 'Cognite Maintain',
    price: 90,
    unique: true,
    requires: 'data-fusion',
    text: `Planned maintenance: before every shift, crews service connected machines, and ${PROBLEMS.wear.noun} that has not yet seized goes back to zero ($${PROBLEMS.wear.repair.cost} per machine).`,
    helps: 'Prevent',
  },
  simulators: {
    id: 'simulators',
    name: 'Simulators',
    price: 60,
    unique: true,
    text: `Simulates the next shift: shows which problems are coming and when, and a rehearsed restart makes plant trips ${RULE_TEXT.pct(1 - RULE.simulatorsTrip)} shorter.`,
    helps: 'Plan ahead',
  },
  search: {
    id: 'search',
    name: 'Cognite Search',
    price: 60,
    unique: true,
    text: `Every ${RULE.searchPeriod} s, finds the oldest hidden problem anywhere in the plant.`,
    helps: 'Spot sooner',
  },
  flows: {
    id: 'flows',
    name: 'Cognite Flows',
    price: 75,
    unique: true,
    text: `Alerts become work orders automatically: crews leave at once instead of after ${RULE.dispatchDelay} s.`,
    helps: 'Dispatch faster',
  },
};

export const ALL_CARDS = Object.keys(CARDS) as CardId[];
