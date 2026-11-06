import { describe, expect, it } from 'vitest';
import { derivedLayout } from './modifier_bevel_uv_layout_fixture.js';
import { modifierBevelResolveDerivedSurface } from '@/modifier/bevel/modifier_bevel_stand_in.js';
import { modifierBevelPlacementWasApplied } from '@/modifier/volume/modifier_volume_bevel_uv_placement.js';

describe('bevel project placement isolation', () => {
  it('does not mark the authored UV as volume-adjusted when a neutral projection is rendered', () => {
    const { instance, derived, index } = derivedLayout('project');
    const parent = instance.getFaceSurface(derived.faces[index]?.parentSurfaceIndex ?? 0).uv;
    modifierBevelResolveDerivedSurface(instance, derived, index);
    expect(modifierBevelPlacementWasApplied(parent)).toBe(false);
    derived.placement = { ...derived.placement, uvScaleU: 2, uvScaleV: 0.5, uvOffsetU: 0.25 };
    const adjusted = modifierBevelResolveDerivedSurface(instance, derived, index).uv;
    expect(adjusted.u.x).toBeCloseTo(parent.u.x / 2);
    expect(adjusted.u.y).toBeCloseTo(parent.u.y / 2);
    expect(adjusted.u.z).toBeCloseTo(parent.u.z / 2);
    expect(adjusted.u.w).toBeCloseTo((parent.u.w - 0.25) / 2);
    expect(adjusted.v.toArray()).toEqual(parent.v.clone().multiplyScalar(2).toArray());
  });
});
