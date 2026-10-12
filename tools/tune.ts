/**
 * Finds the difficulty multiplier that makes the greedy bot win a level at a target rate.
 * Usage: npm run tune -- <level-id> <target win rate 0..1> [runs]
 */
import { greedyBot } from '../src/sim/bots';
import { Game } from '../src/sim/game';
import { LEVELS } from '../src/sim/levels';

const level = LEVELS.find((l) => l.id === process.argv[2])!;
const target = Number(process.argv[3] ?? 0.8);
const runs = Number(process.argv[4] ?? 40);

function winRate(difficulty: number): number {
  let wins = 0;
  for (let s = 1; s <= runs; s++) {
    const g = new Game({ ...level, difficulty }, 1000 + s);
    while (g.phase === 'build') {
      greedyBot.build(g);
      g.runShift();
    }
    if (g.phase === 'won') wins++;
  }
  return wins / runs;
}

let lo = 0.2;
let hi = 3;
let best = { d: 1, rate: winRate(1) };
for (let i = 0; i < 7; i++) {
  const mid = (lo + hi) / 2;
  const rate = winRate(mid);
  if (Math.abs(rate - target) < Math.abs(best.rate - target)) best = { d: mid, rate };
  if (rate > target) lo = mid;
  else hi = mid;
}
console.log(`${level.id}: difficulty ${best.d.toFixed(2)} gives ${Math.round(best.rate * 100)}% (target ${Math.round(target * 100)}%)`);
