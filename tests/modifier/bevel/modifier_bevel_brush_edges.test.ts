import { describe, expect, it } from 'vitest';
import { Matrix4, Vector3 } from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushPlaneClip } from '@/solid/brush/solid_brush_plane_clip.js';
import { SolidPlane } from '@/solid/brush/solid_plane.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import { modifierBevelOptionsWrite } from '@/modifier/volume/modifier_volume_bevel_options.js';
import { modifierBevelAngleLimit, modifierBevelTrackedEdges } from '@/modifier/bevel/modifier_bevel_brush_edges.js';
import { modifierVolumeTemplateCreate } from '@/modifier/stack/modifier_volume_templates.js';

/**
 * Builds a box whose top is cut by a plane tilted ten degrees, which leaves one
 * edge where two faces meet at ten degrees.
 *
 * @returns Brush.
 */
function shallowRoof() {
  const box = SolidBrushFactory.createCenteredBox(2, 1, 1);
  const tilt = (10 * Math.PI) / 180;
  const normal = new Vector3(Math.sin(tilt), Math.cos(tilt), 0);
  const roof = SolidBrushPlaneClip.clipKeepInside(box, new SolidPlane(normal, -normal.dot(new Vector3(0, 0.5, 0))));
  if (!roof) throw new Error('Expected a roofed box');
  return roof;
}

describe('bevel limit method', () => {
  it('skips edges flatter than the max angle and bevels them with no limit', () => {
    const volume = modifierVolumeTemplateCreate('bevel');
    volume.scale.setScalar(6);
    volume.updateMatrixWorld(true);
    const brush = shallowRoof();
    expect(modifierBevelAngleLimit(volume)).toBe(30);
    const limited = modifierBevelTrackedEdges(brush, new Matrix4(), [volume]).length;
    modifierBevelOptionsWrite(volume, { limitMethod: 'none' });
    expect(modifierBevelAngleLimit(volume)).toBe(0);
    expect(modifierBevelTrackedEdges(brush, new Matrix4(), [volume]).length).toBe(limited + 1);
    ModifierVolumeBevel.writeAngleDegrees(volume, 5);
    expect(modifierBevelAngleLimit(volume)).toBe(0);
  });
});
