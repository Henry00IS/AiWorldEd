import { describe, it, expect } from 'vitest';
import { CategoryRouter } from '../../src/solid/algorithm/category_router.js';
import { SolidOperation } from '../../src/solid/types/solid_operation.js';
import {
  SurfaceCategory,
  shouldKeepSurfaceCategory
} from '../../src/solid/types/surface_category.js';

/**
 * Unit tests for solid CSG category routing tables.
 */
describe('CategoryRouter', () => {
  it('routes additive outside+outside to outside', () => {
    const result = CategoryRouter.route(
      SurfaceCategory.Outside,
      SurfaceCategory.Outside,
      SolidOperation.Additive
    );
    expect(result).toBe(SurfaceCategory.Outside);
  });

  it('routes additive outside+selfAligned to selfAligned', () => {
    const result = CategoryRouter.route(
      SurfaceCategory.Outside,
      SurfaceCategory.SelfAligned,
      SolidOperation.Additive
    );
    expect(result).toBe(SurfaceCategory.SelfAligned);
  });

  it('cancels subject selfAligned against peer aligned for additive union', () => {
    const afterSelf = CategoryRouter.route(
      SurfaceCategory.Outside,
      SurfaceCategory.SelfAligned,
      SolidOperation.Additive
    );
    const afterPeer = CategoryRouter.route(
      afterSelf,
      SurfaceCategory.Aligned,
      SolidOperation.Additive
    );
    expect(afterPeer).toBe(SurfaceCategory.Aligned);
    expect(shouldKeepSurfaceCategory(afterPeer)).toBe(false);
  });

  it('keeps later brush when peer aligned then selfAligned for additive', () => {
    const afterPeer = CategoryRouter.route(
      SurfaceCategory.Outside,
      SurfaceCategory.Aligned,
      SolidOperation.Additive
    );
    const afterSelf = CategoryRouter.route(
      afterPeer,
      SurfaceCategory.SelfAligned,
      SolidOperation.Additive
    );
    expect(afterSelf).toBe(SurfaceCategory.SelfAligned);
    expect(shouldKeepSurfaceCategory(afterSelf)).toBe(true);
  });

  it('routes subtractive inside+inside to outside', () => {
    const result = CategoryRouter.route(
      SurfaceCategory.Inside,
      SurfaceCategory.Inside,
      SolidOperation.Subtractive
    );
    expect(result).toBe(SurfaceCategory.Outside);
  });

  it('routes intersecting inside+outside to outside', () => {
    const result = CategoryRouter.route(
      SurfaceCategory.Inside,
      SurfaceCategory.Outside,
      SolidOperation.Intersecting
    );
    expect(result).toBe(SurfaceCategory.Outside);
  });
});
