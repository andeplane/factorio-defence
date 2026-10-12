import { describe, expect, it } from 'vitest';
import { lanePoint } from './beltGeometry';

const close = (p: [number, number], q: [number, number]) => {
  expect(p[0]).toBeCloseTo(q[0]);
  expect(p[1]).toBeCloseTo(q[1]);
};

describe('lanePoint', () => {
  it('runs straight lanes along the belt, left lane on the left', () => {
    close(lanePoint('east', undefined, 0, 0), [-0.5, -0.25]);
    close(lanePoint('east', undefined, 1, 1), [0.5, 0.25]);
    close(lanePoint('north', undefined, 0, 0.5), [-0.25, 0]);
  });

  it('keeps lanes on their side through a curve', () => {
    // Entering moving east, leaving moving north: the left lane is the inner one.
    close(lanePoint('north', 'east', 0, 0), [-0.5, -0.25]);
    close(lanePoint('north', 'east', 0, 1), [-0.25, -0.5]);
    close(lanePoint('north', 'east', 1, 0), [-0.5, 0.25]);
    close(lanePoint('north', 'east', 1, 1), [0.25, -0.5]);
    // Halfway along the inner lane stays on its quarter circle.
    const [x, y] = lanePoint('north', 'east', 0, 0.5);
    expect(Math.hypot(x + 0.5, y + 0.5)).toBeCloseTo(0.25);
  });
});
