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
}

export const CARDS: Record<CardId, CardDef> = {
  crew: {
    id: 'crew',
    name: 'Maintenance crew',
    price: 70,
    unique: false,
    text: 'One more crew to fix problems.',
  },
  'data-fusion': {
    id: 'data-fusion',
    name: 'Cognite Data Fusion',
    price: 70,
    placed: { size: 3, radius: 10 },
    unique: false,
    text: 'Connects everything in range. Operators spot problems on connected equipment twice as fast.',
  },
  extractor: {
    id: 'extractor',
    name: 'Extractor',
    price: 25,
    placed: { size: 1, radius: 5 },
    unique: false,
    requires: 'data-fusion',
    text: 'Connects equipment in a small radius. Must be placed in range of a Data Fusion hub.',
  },
  charts: {
    id: 'charts',
    name: 'Cognite Charts',
    price: 55,
    placed: { size: 1, radius: 7 },
    unique: false,
    requires: 'data-fusion',
    text: 'Threshold alerts on connected equipment: catches wear early, clogs and jams at once, sensor drift in 5 s.',
  },
  'asset-data-insights': {
    id: 'asset-data-insights',
    name: 'Asset Data Insights',
    price: 80,
    unique: true,
    requires: 'data-fusion',
    text: "Crews see a connected machine's full history: wear spotted earlier, repairs 40% faster.",
  },
  infield: {
    id: 'infield',
    name: 'Cognite InField',
    price: 70,
    unique: true,
    text: 'Digital checklists: crews move 50% faster and repairs cost 25% less.',
  },
  inrobot: {
    id: 'inrobot',
    name: 'Cognite InRobot',
    price: 75,
    placed: { size: 2, radius: 8 },
    unique: false,
    text: 'A robot patrols its area and spots wear, clogs and jams, no connection needed.',
  },
  'atlas-ai': {
    id: 'atlas-ai',
    name: 'Atlas AI agent',
    price: 120,
    unique: true,
    requires: 'data-fusion',
    text: 'Filters false alarms, sends crews where it matters most, and recalibrates drifting sensors remotely.',
  },
  canvas: {
    id: 'canvas',
    name: 'Industrial Canvas',
    price: 45,
    unique: false,
    text: 'Root cause analysis: the most common problem of the last shift happens 40% less from now on.',
  },
  maintain: {
    id: 'maintain',
    name: 'Cognite Maintain',
    price: 90,
    unique: true,
    requires: 'data-fusion',
    text: 'Planned maintenance before every shift resets wear on connected machines.',
  },
  simulators: {
    id: 'simulators',
    name: 'Simulators',
    price: 60,
    unique: true,
    text: 'See exactly what the next shift brings, and recover from plant trips twice as fast.',
  },
  search: {
    id: 'search',
    name: 'Cognite Search',
    price: 60,
    unique: true,
    text: 'Every 20 s, finds the oldest hidden problem anywhere in the plant.',
  },
  flows: {
    id: 'flows',
    name: 'Cognite Flows',
    price: 75,
    unique: true,
    text: 'Alerts turn straight into work orders: crews leave at once instead of after 6 s.',
  },
};

export const ALL_CARDS = Object.keys(CARDS) as CardId[];
