import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { multiplyFaceMappingUv } from '@/solid/brush/solid_brush_uv_space.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import type { FaceTextureMapping } from '@/texture/uv/face_texture_mapping.js';

/**
 * Serializes the fields of a mapping that drive result face maps.
 *
 * @param mapping Mapping to describe.
 * @returns Exact text form.
 */
function mappingText(mapping: FaceTextureMapping): string {
  const { u, v } = mapping.uv;
  return `${mapping.textureId}|${mapping.align}|${u.toArray().join(',')}|${v.toArray().join(',')}`;
}

/**
 * SolidBrushInstance.getSurfaceWorldMapping equals converting the brush-local
 * mapping with the same matrix.
 */
describe('SolidBrushInstance.getSurfaceWorldMapping', () => {
  it('matches the local mapping multiplied by the matrix for default and overridden faces', () => {
    const model = new SolidModel('world-mapping');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    brush.surfaceTextureId = 'walls/brick.png';
    brush.setFaceSurface(1, {
      textureId: 'floors/tile.png',
      uv: new SurfaceUvMatrix(new THREE.Vector4(0.5, 0, 0.25, 3), new THREE.Vector4(0, 0.5, -0.125, 1)),
    });
    const inverse = new THREE.Matrix4()
      .compose(
        new THREE.Vector3(3, -2, 7.5),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, -1.1, 0.2)),
        new THREE.Vector3(1.5, 0.75, 2),
      )
      .invert();
    for (let surfaceIndex = 0; surfaceIndex < brush.brush.planes.length; surfaceIndex++) {
      const expected = multiplyFaceMappingUv(brush.getSurfaceMapping(surfaceIndex), inverse);
      expect(mappingText(brush.getSurfaceWorldMapping(surfaceIndex, inverse))).toBe(mappingText(expected));
    }
  });
});
