# Game engine design

The game runs on a headless, deterministic simulation in `src/sim/`. It has no PixiJS dependency, so the same code drives the browser game, the unit tests and the balance runner (`npm run balance`). Rendering reads simulation state; it never changes it.

The game design itself (pitch, threats, Cognite products) lives in the design notes doc. This file covers how the engine implements it.

## Core loop

A level is a fixed factory layout that grows in stages, played as a series of rounds. Each round is:

1. **Build phase.** The level may unlock its next stage (new machines appear). The player sees 3 random Cognite cards, buys any they can afford, places the placeable ones, or rerolls the offer.
2. **Forecast.** The coming shift's threats are listed. Without Cognite only the count is shown; Simulators shows the full list.
3. **Shift.** The factory runs for a fixed time (90 s of game time). Threats spawn and hit machines, belts and inserters. Crews fix what has been detected.
4. **Score.** Items delivered to the dock are counted against the stage's orders. Each delivered item pays money. Missing any order is a strike; 3 strikes lose the level. Surviving the last round wins it, with stars by strikes.

## Simulation

- Fixed tick of 60 per second. All randomness comes from one seeded RNG, so a seed plus a list of player actions replays exactly.
- **Grid.** Entities sit on an integer tile grid, the same coordinates the renderer uses. Sizes follow Factorio: furnace 2x2, assembler 3x3, inserter and belt 1x1.
- **Belts** are Factorio-style transport lines: a chain of belt tiles becomes one line with two lanes. Each lane is a sorted list of item positions in tiles. Items move at 1.875 tiles/s (yellow belt) and keep 0.25 tiles apart, so a lane carries 7.5 items/s. An item stops at the end of the line or behind another item.
- **Inserters** take from a pickup tile and drop to a drop tile. A cycle takes 1.2 s (Factorio yellow inserter). From a belt they take the first wanted item on either lane inside the tile; onto a belt they place on the far lane.
- **Machines.** Sources emit ore at a fixed rate (a mining drill). Furnaces and assemblers run Factorio 1.1 recipes at their crafting speed (stone furnace 1, assembler 1 at 0.5) with input buffers capped at twice the recipe. The dock is a sink that counts deliveries.

## Threats

A threat attaches to a target, has a severity or timer, and is either undetected or detected. Unfixed threats carry over into the next round.

| Threat | Target | Effect | Obvious without help |
| --- | --- | --- | --- |
| Bearing wear | Furnace, assembler | Severity grows to 1 over 40 to 70 s. Above 0.3 the machine runs at 50%; at 1 it seizes and stops | An operator hears it at 0.9 |
| Clog | Belt lane | Items stop at that point and back up | After 12 s (6 s if connected) |
| Inserter jam | Inserter | Stops | After 8 s (4 s if connected) |
| Sensor drift | Furnace, assembler | 40% of output is off-spec (drawn red on belts). Off-spec items earn nothing, and machines fed off-spec make off-spec | After 30 s, through rejects at the dock |
| Alarm flood | Machines | 4 to 6 false alarms that waste crew time | Instantly (they are alarms) |
| Plant trip (boss) | Whole plant | All machines stop for 12 s; wear pauses meanwhile | Instantly |
| Knowledge loss (boss) | Crews | Repairs on unconnected equipment take 50% longer for the rest of the level | Instantly |

Each shift has a threat budget that grows with the round number and the number of machines. Threats are bought from the budget by cost and spawn at random times in the first 80% of the shift. A threat type Industrial Canvas has root-caused is then skipped 40% of the time, so the budget is not spent on another threat instead.

## Crews and repairs

Crews wait at the depot. A detected threat becomes a work order after a dispatch delay (6 s, the time it takes someone to read the alert and raise a work order). Work orders are served first come, first served (Atlas AI: by impact on output); when several crews are free, the nearest one goes. Crews walk at 4 tiles/s and are the only ones who repair.

Repair time and cost depend on how early the threat was caught. A minor fix (wear below 1, a clog, a jam) is quick and cheap. A seized machine takes 5 times longer and costs 6 times more. That gap is the core message: detecting early is cheaper than fixing late.

## Cognite cards

Placeable cards cover a radius. Data products need the target to be **connected**, which means inside a Data Fusion hub's radius or an extractor's.

| Card | Kind | Effect |
| --- | --- | --- |
| Maintenance crew | Global | One more crew |
| Data Fusion | Placed, radius 10 | Connects targets. Operators notice clogs and jams on connected targets twice as fast. Connected targets ignore knowledge loss |
| Extractor | Placed, radius 5, must sit inside a hub | Connects targets |
| Charts | Placed, radius 7, must sit where Data Fusion connects | On connected targets: wear detected at 0.15, clogs and jams after 1 s, sensor drift after 5 s |
| Asset Data Insights | Global | On connected machines: wear detected at 0.3, repairs 40% faster |
| InField | Global | Crews walk 50% faster and repairs cost 25% less |
| InRobot | Placed, radius 8, needs Data Fusion and must sit where it connects | Inspects everything in its radius, connected or not: wear at 0.35, clogs and jams after 3 s |
| Atlas AI agent | Global, needs a hub | On connected targets: false alarms are dismissed and drifting sensors recalibrated remotely 5 s after they are spotted. Work orders go by impact instead of first come |
| Industrial Canvas | One-off | Root cause analysis: the threat type seen most so far (or the likeliest, before any shift) spawns 40% less for the rest of the level |
| Maintain | Global | At the start of each shift, worn (not seized) bearings on connected machines are replaced for $10 each |
| Simulators | Global | Forecast of each threat and when it comes, and plant trips last half as long |
| Search | Global | Every 20 s, finds the oldest undetected threat anywhere |
| Flows | Global | Work orders go out at once: no dispatch delay |

## Levels

Level pack 1 has 10 fixed levels with solid items only. Level pack 2 will add oil and other fluids. Recipes and rates are Factorio 1.1. All levels share one layout (`src/sim/blocks.ts`): iron drills and furnaces on top, an assembler row in the middle, copper furnaces and drills below. A level picks which blocks exist and at which stage they appear.

| # | Level | Rounds | New in this level |
| --- | --- | --- | --- |
| 1 | Gear Works | 6 | Wear and clogs. Iron plates to gears |
| 2 | Copper Lane | 7 | Copper cable on its own belt, and inserter jams |
| 3 | Red Science | 8 | Automation science from gears and copper |
| 4 | Circuit Plant | 8 | Sensor drift. Cable handed straight into circuits |
| 5 | Control Room | 8 | Alarm floods |
| 6 | Belt Works | 8 | Knowledge loss (an operator retires) |
| 7 | Power Trip | 8 | Plant trips |
| 8 | Green Science | 9 | Inserters and belts, then logistic science |
| 9 | Science Lab | 9 | Red then green science, both bosses |
| 10 | Megafactory | 10 | Everything at once |

Rules every level follows:

- **Stages.** Each new stage is built at the start of a round. A new stage commissions for 60 s with no threats, so belts and buffers fill before orders count.
- **Orders** sit at about 60 to 80% of what the line makes with no problems. Unfixed threats are what make you miss them.
- **Cards unlock** level by level, so the shop teaches one product at a time. The first offer always holds Data Fusion, and an offer always holds an answer to a threat type that is new that round.
- **Stars.** 3 minus strikes. Best stars are kept in the browser.

## Complexity ramp

Complexity grows on three axes at once, and each level moves at most one of them a big step:

1. **Production.** Longer recipe chains and more lines sharing belts. A stall upstream now starves more machines downstream.
2. **Threats.** One new threat or event per level, always with a card that counters it in the first offer that round.
3. **Tools.** Cards unlock a few per level, so the shop never shows a product before its problem exists.

Level packs repeat the ramp one layer up:

- **Pack 1, solids** (this pack). Plates, gears, cable, circuits, red and green science. Threats on machines, belts and inserters.
- **Pack 2, fluids.** Pumpjacks, pipes, storage tanks, refineries and chemical plants: crude oil to plastic and sulfur. New threats that suit fluids: leaks, pressure loss, corrosion and tank overflow. Problems spread along a pipe network instead of staying on one tile, so connecting the whole network to Data Fusion matters more.
- **Pack 3, sites.** Several plants on one map joined by trains, so one site's outage hits another's orders. Problems that only show up when you compare sites.

Each crew member is named after someone at Cognite (Anders, Kristoffer, Lars, Shehan, Niek, Stein, Geir, John Markus, Petteri, Halvard, in order of hiring). The shift report shows who did the repairs.

## Economy

Delivered items pay by value (plates 0.25, gear 2, red science 6, green science 15, and so on). Repairs cost money, more for late repairs. Each crew is paid a wage of $12 per shift, and every extra crew costs $30 more than the last. Without this, hiring crews beat buying Cognite. Rerolling an offer costs $10, plus $5 per earlier reroll in the same build phase.

## Balance method

Bots play every level over many seeds (`tools/`):

- **reactive** buys only crews. It shows the plant without Cognite.
- **random** buys random affordable cards and places them at random valid spots.
- **greedy** is a heuristic player that values coverage and detection per coin.
- **lookahead** is an oracle that tries each option by replaying the game from the log. It proves a level can be won with good choices.

`tools/compare.ts` prints win rates and stars per bot across difficulty multipliers. Each level has a `difficulty` multiplier on its threat budget, found by `tools/tune-all.sh`: bisection until greedy wins at a target rate that falls from 97% on level 1 to 75% on level 10. `tools/balance-all.sh` then checks all bots on fresh seeds. The goal is that greedy clearly beats reactive on every level, so buying Cognite is what wins.

## Browser game

`src/game/play.ts` runs the sim and mirrors it into the renderer. It has a level select, a HUD with orders, the shop and forecast, shift reports, and speed controls (1x, 2x, 4x, pause). A data fog covers tiles that no Data Fusion hub connects. `?sandbox` opens the old engine sandbox and `?unlock` unlocks all levels.
