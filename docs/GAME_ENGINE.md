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
| Bearing wear | Furnace, assembler | Severity grows to 1 over 40 to 70 s. Above 0.5 the machine runs at 70%; at 1 it breaks and stops | When it breaks |
| Clog | Belt lane | Items stop at that point and back up | After 12 s |
| Inserter jam | Inserter | Stops | After 8 s |
| Sensor drift | Furnace, assembler | 40% of output is off-spec. Off-spec items earn nothing, and machines fed off-spec make off-spec | Never |
| Alarm flood | Machines | 4 to 6 false alarms that waste crew time | Instantly (they are alarms) |
| Plant trip (boss) | Whole plant | All machines stop for 12 s | Instantly |
| Knowledge loss (boss) | Crews | Repairs take 50% longer for the rest of the level | Instantly |

Each shift has a threat budget that grows with the round number and the number of machines. Threats are bought from the budget by cost and spawn at random times in the first 80% of the shift.

## Crews and repairs

Crews wait at the depot. A detected threat becomes a work order after a dispatch delay (6 s, the time it takes someone to read the alert and raise a work order). The nearest free crew walks to it at 4 tiles/s and repairs it.

Repair time and cost depend on how early the threat was caught. A minor fix (wear below 1, a clog, a jam) is quick and cheap. A broken machine takes 5 times longer and costs 6 times more. That gap is the core message: detecting early is cheaper than fixing late.

## Cognite cards

Placeable cards cover a radius. Data products need the target to be **connected**, which means inside a Data Fusion hub's radius or an extractor's.

| Card | Kind | Effect |
| --- | --- | --- |
| Maintenance crew | Global | One more crew |
| Data Fusion | Placed, radius 10 | Connects targets. Operators notice problems on connected targets twice as fast. Cancels knowledge loss |
| Extractor | Placed, radius 5, must sit inside a hub | Connects targets |
| Charts | Placed, radius 7 | On connected targets: wear detected at 0.15, clogs and jams after 1 s, sensor drift after 5 s |
| Asset Data Insights | Global | On connected machines: wear detected at 0.3, repairs 40% faster |
| InField | Global | Crews walk 50% faster and repairs cost 25% less |
| InRobot | Placed, radius 8 | Detects in radius without a connection: wear at 0.35, clogs and jams after 3 s |
| Atlas AI agent | Global, needs a hub | False alarms are filtered. Work orders go by impact instead of first come |
| Industrial Canvas | One-off | Root cause analysis: the most frequent threat type of the last shift spawns 40% less for the rest of the level |
| Maintain | Global | At the start of each shift, connected machines get planned maintenance: wear reset to 0 |
| Simulators | Global | Full forecast, and plant trips last half as long |
| Search | Global | Every 20 s, finds the oldest undetected threat anywhere |
| Flows | Global | Work orders go out at once: no dispatch delay |

## Levels

Three fixed levels, each growing over its rounds. Recipes and rates are Factorio 1.1.

1. **Gear Works.** Iron ore to plates to gears. Then copper cable on the other belt side. Teaches wear, clogs and jams.
2. **Circuit Plant.** Two lines: iron and copper plates feed cable and circuit assemblers. Adds sensor drift and alarm floods.
3. **Science Lab.** Gears and copper become red science packs, later green science (inserters and belts). Adds both bosses.

## Balance method

`npm run balance` plays every level with several bot policies over many seeds and prints win rates, stars and money curves:

- **reactive**: buys only crews. Shows the plant without Cognite.
- **random**: buys random affordable cards and places them at random valid spots.
- **greedy**: a heuristic player that values coverage and detection.

Targets: greedy wins every level at least 80% of the time; reactive loses levels 2 and 3 most of the time but can survive level 1; random sits in between. No single card should appear in nearly every greedy win.
