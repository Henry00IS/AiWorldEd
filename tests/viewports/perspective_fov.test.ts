import { describe, expect, it } from 'vitest';
import {
  calculatePerspectiveVerticalFov,
  DEFAULT_VERTICAL_FOV_DEGREES,
  MAX_HORIZONTAL_FOV_DEGREES,
} from '../../src/viewports/perspective_fov.js';

describe('perspective field of view', () => {
  it('preserves the default vertical field of view for an ordinary pane', () => {
    const squareAspectRatio = 1;

    const verticalFov = calculatePerspectiveVerticalFov(squareAspectRatio);

    expect(verticalFov).toBe(DEFAULT_VERTICAL_FOV_DEGREES);
  });

  it('caps the horizontal field of view for a maximized wide pane', () => {
    const wideAspectRatio = 8 / 3;

    const verticalFov = calculatePerspectiveVerticalFov(wideAspectRatio);
    const horizontalFov = calculateHorizontalFov(verticalFov, wideAspectRatio);

    expect(verticalFov).toBeLessThan(DEFAULT_VERTICAL_FOV_DEGREES);
    expect(horizontalFov).toBeCloseTo(MAX_HORIZONTAL_FOV_DEGREES);
  });

  it('transitions continuously at the horizontal field of view limit', () => {
    const thresholdAspectRatio = calculateLimitAspectRatio();

    const verticalFov = calculatePerspectiveVerticalFov(thresholdAspectRatio);

    expect(verticalFov).toBeCloseTo(DEFAULT_VERTICAL_FOV_DEGREES);
  });
});

/**
 * Calculates the horizontal field of view produced by a vertical field of view.
 *
 * @param verticalFovDegrees Vertical field of view in degrees.
 * @param aspectRatio Viewport width divided by viewport height.
 * @returns Horizontal field of view in degrees.
 */
function calculateHorizontalFov(verticalFovDegrees: number, aspectRatio: number): number {
  const verticalRadians = (verticalFovDegrees * Math.PI) / 180;
  const horizontalRadians = 2 * Math.atan(Math.tan(verticalRadians / 2) * aspectRatio);
  return (horizontalRadians * 180) / Math.PI;
}

/**
 * Calculates the aspect ratio where the horizontal cap begins.
 *
 * @returns Aspect ratio at the field of view transition.
 */
function calculateLimitAspectRatio(): number {
  const verticalRadians = (DEFAULT_VERTICAL_FOV_DEGREES * Math.PI) / 180;
  const horizontalRadians = (MAX_HORIZONTAL_FOV_DEGREES * Math.PI) / 180;
  return Math.tan(horizontalRadians / 2) / Math.tan(verticalRadians / 2);
}
