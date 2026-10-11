import { describe, expect, it } from 'vitest';
import { directionIndex, expandKey, orientationOf } from './SpriteStack';

describe('directions', () => {
  it('measures orientation clockwise from north', () => {
    expect(orientationOf(0, -1)).toBeCloseTo(0);
    expect(orientationOf(1, 0)).toBeCloseTo(0.25);
    expect(orientationOf(0, 1)).toBeCloseTo(0.5);
    expect(orientationOf(-1, 0)).toBeCloseTo(0.75);
  });

  it('rounds orientation to the nearest of n directions', () => {
    expect(directionIndex(0.25, 16)).toBe(4);
    expect(directionIndex(0.99, 16)).toBe(0);
    expect(directionIndex(-0.25, 64)).toBe(48);
  });

  it('expands {dir} keys', () => {
    expect(expandKey('small-biter/dir/{dir}', 3)).toEqual(['small-biter/dir/0', 'small-biter/dir/1', 'small-biter/dir/2']);
    expect(expandKey('gun-turret', 64)).toEqual(['gun-turret']);
  });
});
