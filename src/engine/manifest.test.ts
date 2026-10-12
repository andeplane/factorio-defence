import { describe, expect, it } from 'vitest';
import { frameAt, frameRects, parseTint } from './manifest';

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

  it('follows a 1-based frameSequence', () => {
    const def = { file: 'a', width: 1, height: 1, frameCount: 5, frameSequence: [1, 5, 3] };
    expect([0, 1, 2, 3].map((t) => frameAt(def, t))).toEqual([0, 4, 2, 0]);
  });

  it('ping-pongs for forward-then-backward', () => {
    const def = { file: 'a', width: 1, height: 1, frameCount: 3, runMode: 'forward-then-backward' as const };
    expect([0, 1, 2, 3, 4, 5].map((t) => frameAt(def, t))).toEqual([0, 1, 2, 1, 0, 1]);
  });
});

describe('parseTint', () => {
  it('reads 0-1 objects and 0-255 arrays like Factorio', () => {
    expect(parseTint({ r: 1, g: 0.5, b: 0, a: 1 })).toEqual({ color: 0xff8000, alpha: 1 });
    expect(parseTint([255, 0, 128, 128])).toEqual({ color: 0xff0080, alpha: 128 / 255 });
    expect(parseTint({ r: 0.2, g: 0.2, b: 0.2 })).toEqual({ color: 0x333333, alpha: 1 });
    expect(parseTint(undefined)).toBeNull();
  });
});
