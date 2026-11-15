import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SOLID_BRUSH_SHAPES, solidBrushShapeCreate } from '@/solid/brush/solid_brush_shape.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { primitiveTotalVolume } from '../../modifier/stack/kinds/generator/primitive/primitive_fixture.js';

describe('brush shapes', () => {
  it('offers the box and the wedge as plain brush shapes', () => {
    expect([...SOLID_BRUSH_SHAPES]).toEqual(['box', 'wedge']);
  });

  it('builds a centered box filling its size', () => {
    const box = solidBrushShapeCreate('box', new THREE.Vector3(2, 1, 3));
    expect(box.vertices).toHaveLength(8);
    expect(box.faces).toHaveLength(6);
    expect(SolidBrushValidator.validate(box).valid).toBe(true);
  });

  it('builds a centered wedge climbing towards +Z: half the box, full height at +Z, an edge on the floor at -Z', () => {
    const wedge = solidBrushShapeCreate('wedge', new THREE.Vector3(2, 1, 3));
    expect(wedge.vertices).toHaveLength(6);
    expect(wedge.faces).toHaveLength(5);
    expect(SolidBrushValidator.validate(wedge).valid).toBe(true);
    const bounds = new THREE.Box3().setFromPoints(wedge.vertices);
    expect(bounds.min.toArray()).toEqual([-1, -0.5, -1.5]);
    expect(bounds.max.toArray()).toEqual([1, 0.5, 1.5]);
    for (const vertex of wedge.vertices.filter((point) => point.y > 0)) expect(vertex.z).toBeCloseTo(1.5);
    const instance = new SolidBrushInstance('w', 'Brush', wedge, SolidOperation.Additive);
    expect(primitiveTotalVolume([instance])).toBeCloseTo(3, 6);
  });
});
