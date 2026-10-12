import { Application, Container } from 'pixi.js';
import { AssetStore } from './Assets';
import { Camera } from './Camera';
import { EntityManager } from './Entities';
import { TileMap, type TileGenerator } from './TileMap';
import { TRANSITION_PIECES } from './transitions';
import { UnitManager } from './Units';

export const TICKS_PER_SECOND = 60;

export interface EngineOptions {
  parent: HTMLElement;
  tileNames: string[];
  generateTile: TileGenerator;
  /** Animation keys to fetch up front; tiles in `tileNames` are always fetched. */
  animationKeys: string[];
  /** Called as sprite sheets arrive, for a loading bar. */
  onProgress?: (done: number, total: number) => void;
}

/**
 * Wires up the renderer, camera, ground, entities and a fixed 60 UPS game
 * tick (Factorio's update rate), decoupled from the render frame rate.
 */
export class Engine {
  readonly app = new Application();
  readonly assets = new AssetStore();
  readonly camera = new Camera();
  readonly world = new Container();
  /** Items lying on belts: above belts, under shadows and machines. */
  readonly itemLayer = new Container();
  /** Above machines, like Factorio's inserter arms and the items in their hands. */
  readonly highLayer = new Container();
  /** Drawn above entities in world space: cursor ghosts, selection boxes. */
  readonly overlay = new Container();
  tiles!: TileMap;
  entities!: EntityManager;
  units!: UnitManager;
  tick = 0;
  /** Animation ticks per game tick: a game running its simulation faster sets this so animations keep pace. 0 freezes them. */
  timeScale = 1;
  /** Drives entity and unit animations; advances by `timeScale` each game tick. */
  animationTick = 0;
  private accumulator = 0;
  private tickListeners: ((tick: number) => void)[] = [];
  private frameListeners: ((dtMs: number) => void)[] = [];

  async init(opts: EngineOptions): Promise<void> {
    await this.app.init({
      resizeTo: window,
      background: '#1b1b1b',
      antialias: false,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
      preference: 'webgl',
    });
    opts.parent.appendChild(this.app.canvas);
    await this.assets.init();
    const tileKeys = opts.tileNames.flatMap((n) => [n, ...TRANSITION_PIECES.map((p) => `${n}/${p}`)]);
    await this.assets.preload(opts.animationKeys, tileKeys, opts.onProgress);

    this.tiles = new TileMap(this.assets, opts.tileNames, opts.generateTile);
    this.entities = new EntityManager(this.assets);
    this.units = new UnitManager(this.assets, this.entities.shadowLayer, this.entities.objectLayer);
    this.world.addChild(
      this.tiles.container,
      this.entities.groundLayer,
      this.itemLayer,
      this.entities.shadowLayer,
      this.entities.objectLayer,
      this.highLayer,
      this.overlay,
    );
    this.app.stage.addChild(this.world);

    this.app.ticker.add((t) => this.frame(t.deltaMS));
  }

  onTick(fn: (tick: number) => void): void {
    this.tickListeners.push(fn);
  }

  onFrame(fn: (dtMs: number) => void): void {
    this.frameListeners.push(fn);
  }

  private frame(dtMs: number): void {
    const step = 1000 / TICKS_PER_SECOND;
    this.accumulator = Math.min(this.accumulator + dtMs, step * 10); // avoid spiral after tab switch
    while (this.accumulator >= step) {
      this.accumulator -= step;
      this.tick++;
      for (const fn of this.tickListeners) fn(this.tick);
      this.animationTick += this.timeScale;
      this.units.step();
    }
    for (const fn of this.frameListeners) fn(dtMs);
    this.camera.resize(this.app.screen.width, this.app.screen.height);
    this.camera.apply(this.world);
    this.tiles.update(this.camera);
    this.entities.animate(this.animationTick);
    this.units.animate(this.animationTick);
  }
}
