/**
 * Plays every level with each bot over many seeds and prints how often each wins.
 * Run with `npm run balance` (optionally `-- <runs> <level-id>`).
 */
import { greedyBot, lookaheadBot, randomBot, reactiveBot, type Bot } from '../src/sim/bots';
import { Game } from '../src/sim/game';
import { LEVELS } from '../src/sim/levels';

const runs = Number(process.argv[2] ?? 100);
const only = process.argv[3];
/** The lookahead bot is slow, so it plays a tenth as many games. */
const withLookahead = process.argv.includes('--lookahead');

function play(levelIndex: number, bot: Bot, seed: number): Game {
  const game = new Game(LEVELS[levelIndex], seed);
  while (game.phase === 'build') {
    bot.build(game);
    game.runShift();
  }
  return game;
}

const pct = (n: number) => `${Math.round(n * 100)}%`.padStart(4);

for (let li = 0; li < LEVELS.length; li++) {
  const level = LEVELS[li];
  if (only && level.id !== only) continue;
  console.log(`\n${level.name} (${runs} runs per bot)`);
  const bots: ((seed: number) => Bot)[] = [() => reactiveBot, (s) => randomBot(s), () => greedyBot];
  if (withLookahead) bots.push(() => lookaheadBot);
  for (const make of bots) {
    const n = make(1) === lookaheadBot ? Math.max(5, Math.round(runs / 10)) : runs;
    let wins = 0;
    let stars = 0;
    let roundsSum = 0;
    const lostAt = new Map<number, number>();
    const missed = new Map<string, number>();
    const cards = new Map<string, number>();
    let early = 0;
    let breakdowns = 0;
    let name = '';
    for (let s = 1; s <= n; s++) {
      const bot = make(s * 7919);
      name = bot.name;
      const g = play(li, bot, s);
      if (g.phase === 'won') wins++;
      else lostAt.set(g.round, (lostAt.get(g.round) ?? 0) + 1);
      stars += g.stars;
      roundsSum += g.reports.length;
      for (const r of g.reports) {
        early += r.detectedEarly;
        breakdowns += r.breakdowns;
        for (const o of r.orders) if (!o.met) missed.set(o.item, (missed.get(o.item) ?? 0) + 1);
      }
      for (const c of new Set(g.spendLog.map((x) => x.card))) cards.set(c, (cards.get(c) ?? 0) + 1);
    }
    const lost = [...lostAt.entries()].sort((a, b) => a[0] - b[0]).map(([r, n]) => `r${r}:${n}`).join(' ');
    const miss = [...missed.entries()].map(([i, n]) => `${i}:${n}`).join(' ');
    const top = [...cards.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c, k]) => `${c} ${pct(k / n)}`).join(', ');
    console.log(
      `  ${name.padEnd(9)} win ${pct(wins / n)}  stars ${(stars / n).toFixed(2)}  early/shift ${(early / roundsSum).toFixed(1)}  breakdowns/shift ${(breakdowns / roundsSum).toFixed(2)}`,
    );
    if (lost) console.log(`            lost at ${lost}`);
    if (miss) console.log(`            missed orders ${miss}`);
    if (top) console.log(`            bought ${top}`);
  }
}
