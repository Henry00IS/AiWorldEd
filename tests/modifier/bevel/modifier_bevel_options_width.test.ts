import { describe, it, expect } from 'vitest';
import { Matrix4, Vector3 } from 'three';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import { modifierBevelOptionsWrite } from '@/modifier/volume/modifier_volume_bevel_options.js';
import { modifierBevelWidthOffset } from '@/modifier/bevel/modifier_bevel_width.js';
import { modifierBevelTrackedEdges } from '@/modifier/bevel/modifier_bevel_brush_edges.js';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { modifierBevelDeriveBrush } from '@/modifier/bevel/modifier_bevel_derived.js';
import { bevelOptionsFixture, bevelOptionsVerifyConvex } from './modifier_bevel_options_fixture.js';
import { modifierVolumeTemplateCreate } from '@/modifier/stack/modifier_volume_templates.js';

/**
 * Width conversions and conservative overlap limits operate on actual world
 * geometry.
 */
describe('bevel width and overlap', () => {
  it('clamps saved percent amounts without changing old offset amounts', () => {
    const volume = modifierVolumeTemplateCreate('bevel');
    ModifierVolumeBevel.writeDistance(volume, 200);
    expect(ModifierVolumeBevel.readDistance(volume)).toBe(200);
    modifierBevelOptionsWrite(volume, { widthMode: 'percent' });
    ModifierVolumeBevel.writeSettings(volume, ModifierVolumeBevel.readSettings(volume));
    expect(ModifierVolumeBevel.readDistance(volume)).toBe(100);
  });
  for (const degrees of [30, 60, 90, 135])
    it(`converts width and depth at ${degrees} degrees`, () => {
      const volume = modifierVolumeTemplateCreate('bevel');
      const amount = 0.17,
        radians = (degrees * Math.PI) / 180;
      const a = new Vector3(1, 0, 0),
        b = new Vector3(Math.cos(radians), Math.sin(radians), 0);
      ModifierVolumeBevel.writeDistance(volume, amount);
      modifierBevelOptionsWrite(volume, { widthMode: 'width' });
      expect(2 * modifierBevelWidthOffset(volume, a, b, 1) * Math.cos(radians / 2)).toBeCloseTo(amount, 10);
      modifierBevelOptionsWrite(volume, { widthMode: 'depth' });
      expect(modifierBevelWidthOffset(volume, a, b, 1) * Math.sin(radians / 2)).toBeCloseTo(amount, 10);
      modifierBevelOptionsWrite(volume, { widthMode: 'percent' });
      expect(modifierBevelWidthOffset(volume, a, b, 0.4)).toBeCloseTo((0.4 * amount) / 100, 10);
    });
  it('limits thin-brush cuts across several selecting volumes without changing the saved amount', () => {
    const { instance, volume } = bevelOptionsFixture({}, 8, true);
    instance.brush = SolidBrushFactory.createCenteredBox(1, 0.02, 0.7);
    const second = modifierVolumeTemplateCreate('bevel');
    volume.position.y = 0.5;
    volume.scale.y = 1;
    volume.updateMatrixWorld(true);
    second.position.y = -0.5;
    second.scale.set(6, 1, 6);
    second.updateMatrixWorld(true);
    for (const item of [volume, second]) {
      ModifierVolumeBevel.writeDistance(item, 10);
      modifierBevelOptionsWrite(item, { clampOverlap: true });
    }
    const edges = modifierBevelTrackedEdges(instance.brush, new Matrix4(), [volume, second]);
    expect(edges.length).toBe(12);
    expect(new Set(edges.map((edge) => edge.volume)).size).toBe(2);
    expect(Math.max(...edges.map((edge) => edge.distance))).toBeLessThanOrEqual(0.49);
    expect(
      edges.filter((edge) => Math.abs(edge.start.y - edge.end.y) < 1e-6).every((edge) => edge.distance < 0.01),
    ).toBe(true);
    const derived = modifierBevelDeriveBrush(instance, [volume, second]);
    expect(derived).not.toBeNull();
    if (derived) bevelOptionsVerifyConvex(derived);
    expect(ModifierVolumeBevel.readDistance(volume)).toBe(10);
  });
  for (const widthMode of ['offset', 'width', 'depth', 'percent'] as const)
    it(`keeps ${widthMode} cuts convex`, () => {
      const fixture = bevelOptionsFixture({ widthMode, clampOverlap: true }, 8, true, true);
      bevelOptionsVerifyConvex(fixture.derived);
    });
});
