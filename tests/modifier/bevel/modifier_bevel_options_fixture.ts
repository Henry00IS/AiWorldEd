import { SOLID_FAT_PLANE_EPSILON } from '@/solid/algorithm/math/solid_math_constants.js';
import { expect } from 'vitest';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import {
  modifierBevelOptionsNormalize,
  modifierBevelOptionsWrite,
  type ModifierBevelOptions,
} from '@/modifier/volume/modifier_volume_bevel_options.js';
import { boxAndVolume, derive } from './modifier_bevel_uv_layout_fixture.js';
import type { ModifierBevelDerivedBrush } from '@/modifier/bevel/modifier_bevel_derived.js';

/**
 * Builds geometry with optional new controls, shape, coverage and transforms.
 *
 * @param options Option overrides.
 * @param segments Profile segments.
 * @param whole Full coverage instead of one edge.
 * @param posed Nonuniformly scaled and rotated brush.
 * @param owner Curve ownership.
 */
export function bevelOptionsFixture(
  options: Partial<ModifierBevelOptions>,
  segments = 8,
  whole = false,
  posed = false,
  owner: 'single' | 'split' = 'split',
) {
  const { instance, volume } = boxAndVolume();
  instance.setAllFacesTextureId('random-photo');
  if (!whole) {
    volume.position.set(0.5, 0.5, 0);
    volume.scale.set(0.4, 0.4, 0.4);
  }
  if (posed && instance.mesh) {
    instance.mesh.rotation.set(0.2, -0.3, 0.4);
    instance.mesh.scale.set(1.3, 0.8, 1.6);
  }
  instance.mesh?.updateMatrixWorld(true);
  volume.updateMatrixWorld(true);
  ModifierVolumeBevel.writeSegments(volume, segments);
  ModifierVolumeBevel.writeDistance(volume, 0.1);
  modifierBevelOptionsWrite(volume, modifierBevelOptionsNormalize(options));
  ModifierVolumeBevel.writeSettings(volume, { ...ModifierVolumeBevel.readSettings(volume), uvOwner: owner });
  return { instance, volume, derived: derive(instance, volume) };
}

/**
 * Checks every derived vertex against every convex half space and verifies twin
 * links.
 *
 * @param derived Derived brush.
 */
export function bevelOptionsVerifyConvex(derived: ModifierBevelDerivedBrush): void {
  const brush = derived.localBrush;
  expect(brush.vertices.length).toBeGreaterThanOrEqual(4);
  for (const point of brush.vertices) {
    expect(point.toArray().every(Number.isFinite)).toBe(true);
    for (const plane of brush.planes)
      expect(plane.normal.dot(point) + plane.offset).toBeLessThan(SOLID_FAT_PLANE_EPSILON);
  }
  for (const [index, edge] of brush.wingEdges.entries()) expect(brush.wingEdges[edge.twinIndex]?.twinIndex).toBe(index);
}
