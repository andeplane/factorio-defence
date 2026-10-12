/** Deliveries per shift for each level with no problems at all: the ceiling for order sizes. */
import { Game } from '../src/sim/game';
import { LEVELS } from '../src/sim/levels';

for (const level of LEVELS) {
  const g = new Game({ ...level, threatBudget: () => 0, events: [] }, 1);
  console.log(`\n${level.name}`);
  while (g.phase === 'build') {
    g.runShift();
    const r = g.reports[g.reports.length - 1];
    console.log(`  round ${r.round}: ` + r.orders.map((o) => `${o.item} ${o.delivered}/${o.perShift}`).join(', ') + `  income ${r.income.toFixed(0)}`);
  }
}
