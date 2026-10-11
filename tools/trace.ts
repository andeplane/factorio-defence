/** Prints one play-through round by round: `npm run trace -- <level-id> <bot> <seed>`. */
import { greedyBot, randomBot, reactiveBot } from '../src/sim/bots';
import { Game } from '../src/sim/game';
import { LEVELS } from '../src/sim/levels';

const level = LEVELS.find((l) => l.id === (process.argv[2] ?? 'gear-works'))!;
const botName = process.argv[3] ?? 'greedy';
const seed = Number(process.argv[4] ?? 1);
const bot = botName === 'reactive' ? reactiveBot : botName === 'random' ? randomBot(seed) : greedyBot;
const g = new Game(level, seed);
while (g.phase === 'build') {
  const before = g.spendLog.length;
  const money = g.money;
  const offer = [...g.offer];
  bot.build(g);
  const bought = g.spendLog.slice(before).map((s) => s.card);
  const plan = g.plan.map((p) => p.type).join(',');
  g.runShift();
  const r = g.reports[g.reports.length - 1];
  console.log(
    `r${r.round} $${money.toFixed(0)} offer[${offer.join(',')}] bought[${bought.join(',')}] plan[${plan}]` +
      `\n    ${r.orders.map((o) => `${o.item} ${o.delivered}/${o.perShift}${o.met ? '' : ' MISS'}`).join(', ')}` +
      ` income ${r.income.toFixed(0)} repairs ${r.repairCost.toFixed(0)} early ${r.detectedEarly} breakdowns ${r.breakdowns} offspec ${r.offSpecDelivered} open ${g.openProblems().length} crews ${g.crews.length}`,
  );
}
console.log(g.phase, 'stars', g.stars);
