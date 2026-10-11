import { describe, expect, it } from 'vitest';
import { frameAt, frameRects } from './manifest';

describe('frameRects', () => {
  it('wraps frames at lineLength and applies x/y offsets', () => {
    const rects = frameRects({ file: 'a.png', width: 10, height: 20, x: 5, y: 7, frameCount: 5, lineLength: 2 });
    expect(rects.map((r) => [r.x, r.y])).toEqual([
      [5, 7], [15, 7], [5, 27], [15, 27], [5, 47],
    ]);
  });

  it('splits rows across files with linesPerFile', () => {
    const rects = frameRects({ files: ['a.png', 'b.png'], linesPerFile: 1, width: 10, height: 10, frameCount: 4, lineLength: 2 });
    expect(rects.map((r) => [r.file, r.x, r.y])).toEqual([
      ['a.png', 0, 0], ['a.png', 10, 0], ['b.png', 0, 0], ['b.png', 10, 0],
    ]);
  });

  it('treats a missing frameCount as a static sprite', () => {
    expect(frameRects({ file: 'a.png', width: 4, height: 4 })).toHaveLength(1);
  });
});

describe('frameAt', () => {
  it('loops forward at animationSpeed', () => {
    const def = { file: 'a', width: 1, height: 1, frameCount: 4, animationSpeed: 0.5 };
    expect([0, 1, 2, 3, 8, 9].map((t) => frameAt(def, t))).toEqual([0, 0, 1, 1, 0, 0]);
  });

  it('ping-pongs for forward-then-backward', () => {
    const def = { file: 'a', width: 1, height: 1, frameCount: 3, runMode: 'forward-then-backward' as const };
    expect([0, 1, 2, 3, 4, 5].map((t) => frameAt(def, t))).toEqual([0, 1, 2, 1, 0, 1]);
  });
});
