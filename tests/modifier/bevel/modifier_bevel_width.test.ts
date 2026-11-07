import { describe, expect, it } from 'vitest';
import { BufferGeometry, Matrix4, Mesh, Vector3 } from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import { modifierBevelOptionsWrite } from '@/modifier/volume/modifier_volume_bevel_options.js';
import { modifierBevelSideSine, modifierBevelWidthOffset } from '@/modifier/bevel/modifier_bevel_width.js';
import { modifierBevelTrackedEdges } from '@/modifier/bevel/modifier_bevel_brush_edges.js';
import { modifierBevelDeriveBrush } from '@/modifier/bevel/modifier_bevel_derived.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { modifierVolumeTemplateCreate } from '@/modifier/stack/modifier_volume_templates.js';

/**
 * Builds a unit box whose X moves by its height, so its vertical sides lean 45
 * degrees.
 *
 * @returns Sheared box.
 */
function leaningBox() {
  const brush = SolidBrushFactory.createCenteredBox(1, 1, 1);
  brush.transformVertices(new Matrix4().set(1, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1));
  return brush;
}

/**
 * Returns the index of the first canonical edge running along an axis.
 *
 * @param brush Brush.
 * @param axis Unit axis.
 * @param y Height of the edge.
 * @returns Half-edge index.
 */
function edgeAlong(brush: ReturnType<typeof leaningBox>, axis: Vector3, y: number): number {
  return brush.wingEdges.findIndex((edge, index) => {
    const twin = brush.wingEdges[edge.twinIndex];
    const a = twin ? brush.vertices[twin.vertexIndex] : undefined;
    const b = brush.vertices[edge.vertexIndex];
    if (!a || !b || index > edge.twinIndex) return false;
    const direction = b.clone().sub(a).normalize();
    return Math.abs(Math.abs(direction.dot(axis)) - 1) < 1e-9 && Math.abs(a.y - y) < 1e-9;
  });
}

describe('bevel absolute width', () => {
  it('measures side edges square to a box edge as a sine of one', () => {
    const box = SolidBrushFactory.createCenteredBox(1, 1, 1);
    expect(modifierBevelSideSine(box, edgeAlong(box, new Vector3(1, 0, 0), 0.5), new Matrix4())).toBeCloseTo(1, 10);
  });

  it('slides the amount along leaning side edges', () => {
    const brush = leaningBox();
    const index = edgeAlong(brush, new Vector3(1, 0, 0), 0.5);
    const sine = modifierBevelSideSine(brush, index, new Matrix4());
    expect(sine).toBeCloseTo((2 + 2 * Math.SQRT1_2) / 4, 10);
    const volume = modifierVolumeTemplateCreate('bevel');
    ModifierVolumeBevel.writeDistance(volume, 0.1);
    modifierBevelOptionsWrite(volume, { widthMode: 'absolute' });
    const up = new Vector3(0, 1, 0);
    expect(modifierBevelWidthOffset(volume, up, new Vector3(0, 0, 1), 1, sine)).toBeCloseTo(0.1 * sine, 10);
    modifierBevelOptionsWrite(volume, { widthMode: 'offset' });
    expect(modifierBevelWidthOffset(volume, up, new Vector3(0, 0, 1), 1, sine)).toBeCloseTo(0.1, 10);
  });

  it('keeps absolute bevels of leaning brushes convex', () => {
    const volume = modifierVolumeTemplateCreate('bevel');
    volume.scale.setScalar(4);
    volume.updateMatrixWorld(true);
    ModifierVolumeBevel.writeDistance(volume, 0.1);
    ModifierVolumeBevel.writeSegments(volume, 3);
    modifierBevelOptionsWrite(volume, { widthMode: 'absolute' });
    const instance = new SolidBrushInstance('lean', 'lean', leaningBox(), SolidOperation.Additive);
    instance.mesh = new Mesh(new BufferGeometry());
    instance.mesh.updateMatrixWorld(true);
    const edges = modifierBevelTrackedEdges(instance.brush, new Matrix4(), [volume]);
    expect(edges.some((edge) => edge.distance < 0.099)).toBe(true);
    const derived = modifierBevelDeriveBrush(instance, [volume]);
    expect(derived && SolidBrushValidator.validateGenerated(derived.localBrush).valid).toBe(true);
  });
});
