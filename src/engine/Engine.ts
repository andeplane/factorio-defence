import { Application, Container } from 'pixi.js';
import { AssetStore } from './Assets';
import { Camera } from './Camera';
import { EntityManager } from './Entities';
import { TileMap, type TileGenerator } from './TileMap';

export const TICKS_PER_SECOND = 60;

export interface EngineOptions {
  parent: HTMLElement;
  tileNames: string[];
  generateTile: TileGenerator;
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
  /** Drawn above entities in world space: cursor ghosts, selection boxes. */
  readonly overlay = new Container();
  tiles!: TileMap;
  entities!: EntityManager;
  tick = 0;
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

    this.tiles = new TileMap(this.assets, opts.tileNames, opts.generateTile);
    this.entities = new EntityManager(this.assets);
    this.world.addChild(this.tiles.container, this.entities.shadowLayer, this.entities.objectLayer, this.overlay);
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
    }
    for (const fn of this.frameListeners) fn(dtMs);
    this.camera.resize(this.app.screen.width, this.app.screen.height);
    this.camera.apply(this.world);
    this.tiles.update(this.camera);
    this.entities.animate(this.tick);
  }
}
