import type { Container } from 'pixi.js';

export const TILE_PX = 32; // world pixels per tile

/**
 * 2D camera over a world container. `x`/`y` is the world position (in world
 * pixels) shown at the centre of the screen; `zoom` is screen pixels per
 * world pixel.
 */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  minZoom = 0.25;
  maxZoom = 4;
  viewWidth = 1;
  viewHeight = 1;

  resize(width: number, height: number): void {
    this.viewWidth = width;
    this.viewHeight = height;
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.viewWidth / 2) / this.zoom + this.x,
      y: (sy - this.viewHeight / 2) / this.zoom + this.y,
    };
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: (wx - this.x) * this.zoom + this.viewWidth / 2,
      y: (wy - this.y) * this.zoom + this.viewHeight / 2,
    };
  }

  /** Zoom by `factor`, keeping the world point under screen (sx, sy) fixed. */
  zoomAt(factor: number, sx: number, sy: number): void {
    const before = this.screenToWorld(sx, sy);
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor));
    const after = this.screenToWorld(sx, sy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  }

  panScreen(dx: number, dy: number): void {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
  }

  /** Visible world rectangle, in world pixels. */
  bounds(): { left: number; top: number; right: number; bottom: number } {
    const hw = this.viewWidth / 2 / this.zoom;
    const hh = this.viewHeight / 2 / this.zoom;
    return { left: this.x - hw, top: this.y - hh, right: this.x + hw, bottom: this.y + hh };
  }

  apply(world: Container): void {
    world.scale.set(this.zoom);
    world.position.set(this.viewWidth / 2 - this.x * this.zoom, this.viewHeight / 2 - this.y * this.zoom);
  }
}
