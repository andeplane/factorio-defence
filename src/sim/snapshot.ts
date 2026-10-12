import type { Game } from './game';

/** What the renderer needs each frame. Matches FactoryViewState in src/engine/FactoryView.ts. */
export interface FactorySnapshot {
  beltItems: { x: number; y: number; lane: 0 | 1; pos: number; item: string; off: boolean }[];
  inserters: { x: number; y: number; swing: number; held: string | null }[];
  machines: { x: number; y: number; working: boolean }[];
  problems: { id: number; x: number; y: number; type: string; detected: boolean; severity: number; crewed: boolean }[];
  crews: { name: string; x: number; y: number; state: 'idle' | 'walk' | 'work'; job: string | null }[];
  cards: { x: number; y: number; size: number; card: string; radius: number }[];
}

export function snapshot(game: Game): FactorySnapshot {
  const w = game.world;
  const beltItems: FactorySnapshot['beltItems'] = [];
  for (const line of w.activeLines())
    for (const lane of [0, 1] as const)
      for (const it of line.lanes[lane]) {
        const index = Math.min(line.length - 1, Math.floor(it.pos));
        const t = line.tiles[index];
        beltItems.push({ x: t.x, y: t.y, lane, pos: it.pos - index, item: it.item, off: it.off });
      }
  return {
    beltItems,
    inserters: w.activeInserters().map((i) => ({ x: i.x, y: i.y, swing: i.armPosition, held: i.hand?.item ?? null })),
    machines: [
      ...w.activeMachines().map((m) => ({ x: m.x, y: m.y, working: m.working })),
      ...w.sources.filter((s) => w.active(s)).map((s) => ({ x: s.x, y: s.y, working: true })),
    ],
    problems: game.openProblems().map((p) => ({
      id: p.id,
      x: p.x,
      y: p.y,
      type: p.type,
      detected: p.detected !== null,
      severity: p.severity,
      crewed: p.crew !== null,
    })),
    crews: game.crews.map((c) => ({ name: c.name, x: c.x, y: c.y, state: c.state, job: c.job?.type ?? null })),
    cards: game.placed.map((p) => ({ x: p.x, y: p.y, size: p.size, card: p.card, radius: p.radius })),
  };
}
