import { describe, it, expect } from 'vitest';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import {
  isSolidBrushMarkedNonConvex,
  markSolidBrushConvexityState,
  SOLID_BRUSH_NON_CONVEX_USERDATA_KEY,
} from '@/edit/transform/brush_edit_convexity.js';

describe('brush_edit_convexity', () => {
  it('marks non-convex solides and clears the flag when convex again', () => {
    const mesh = SolidBrushVisual.createBoxPreview('Brush', 1, SolidOperation.Additive);
    markSolidBrushConvexityState(mesh, false);
    expect(isSolidBrushMarkedNonConvex(mesh)).toBe(true);
    expect(mesh.userData[SOLID_BRUSH_NON_CONVEX_USERDATA_KEY]).toBe(true);
    markSolidBrushConvexityState(mesh, true);
    expect(isSolidBrushMarkedNonConvex(mesh)).toBe(false);
    mesh.geometry.dispose();
  });
});
