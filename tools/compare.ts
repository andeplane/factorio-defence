/** Win rates of the reactive and greedy bots across difficulties: npm run compare -- <level-id> <runs> <d1,d2,...> */
import { greedyBot, reactiveBot, randomBot, type Bot } from '../src/sim/bots';
import { Game } from '../src/sim/game';
import { LEVELS } from '../src/sim/levels';

const level = LEVELS.find((l) => l.id === process.argv[2])!;
const runs = Number(process.argv[3] ?? 30);
const ds = (process.argv[4] ?? '1').split(',').map(Number);
const rate = (make: (s: number) => Bot, difficulty: number) => {
  let wins = 0;
  let stars = 0;
  for (let s = 1; s <= runs; s++) {
    const bot = make(s);
    const g = new Game({ ...level, difficulty }, 5000 + s);
    while (g.phase === 'build') {
      bot.build(g);
      g.runShift();
    }
    if (g.phase === 'won') wins++;
    stars += g.stars;
  }
  return `${Math.round((wins / runs) * 100)}%/${(stars / runs).toFixed(1)}*`;
};
for (const d of ds)
  console.log(`${level.id} d=${d}: reactive ${rate(() => reactiveBot, d)} random ${rate((s) => randomBot(s), d)} greedy ${rate(() => greedyBot, d)}`);
