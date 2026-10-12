import { describe, expect, it } from 'vitest';
import { Camera } from './Camera';

describe('Camera', () => {
  it('round-trips screen and world coordinates', () => {
    const c = new Camera();
    c.resize(800, 600);
    c.x = 100;
    c.y = -50;
    c.zoom = 2;
    const w = c.screenToWorld(123, 456);
    const s = c.worldToScreen(w.x, w.y);
    expect(s.x).toBeCloseTo(123);
    expect(s.y).toBeCloseTo(456);
  });

  it('keeps the point under the cursor fixed when zooming', () => {
    const c = new Camera();
    c.resize(800, 600);
    const before = c.screenToWorld(700, 100);
    c.zoomAt(1.7, 700, 100);
    const after = c.screenToWorld(700, 100);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('clamps zoom', () => {
    const c = new Camera();
    c.zoomAt(1000, 0, 0);
    expect(c.zoom).toBe(c.maxZoom);
  });
});
