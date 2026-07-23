import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '../../src/solid/model/solid_model.js';
import { SolidOperation } from '../../src/solid/types/solid_operation.js';
import { mapPreviewTriangleToBrushFace } from '../../src/solid/model/brush_preview_face_map.js';
import { computeTriangleNormal } from '../../src/selection/triangle_geometry_utils.js';

/**
 * Preview box triangles must map to wing-edge brush faces by normal, not tri/2.
 */
describe('brush_preview_face_map', () => {
  it('maps each preview triangle to the brush face with the matching normal', () => {
    const model = new SolidModel('FaceMap');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const mesh = brush.mesh!;
    mesh.updateMatrix();
    const modelBrush = brush.getModelSpaceBrush();
    for (let triangleIndex = 0; triangleIndex < 12; triangleIndex++) {
      const surfaceIndex = mapPreviewTriangleToBrushFace(
        mesh,
        triangleIndex,
        brush
      );
      expect(surfaceIndex).toBeGreaterThanOrEqual(0);
      expect(surfaceIndex).toBeLessThan(6);
      const triNormal = computeTriangleNormal(mesh.geometry, triangleIndex);
      const solidNormal = triNormal
        .clone()
        .applyMatrix3(new THREE.Matrix3().getNormalMatrix(mesh.matrix))
        .normalize();
      const planeNormal = modelBrush.planes[surfaceIndex].normal;
      expect(planeNormal.dot(solidNormal)).toBeGreaterThan(0.9);
    }
  });

  it('maps top (+Y) preview faces to the brush top plane, not an adjacent side', () => {
    const model = new SolidModel('TopFace');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const mesh = brush.mesh!;
    mesh.updateMatrix();
    const topTriangles: number[] = [];
    for (let t = 0; t < 12; t++) {
      const n = computeTriangleNormal(mesh.geometry, t);
      if (n.y > 0.9) topTriangles.push(t);
    }
    expect(topTriangles.length).toBe(2);
    const mapped = topTriangles.map((t) =>
      mapPreviewTriangleToBrushFace(mesh, t, brush)
    );
    expect(mapped[0]).toBe(mapped[1]);
    const plane = brush.getModelSpaceBrush().planes[mapped[0]];
    expect(plane.normal.y).toBeGreaterThan(0.9);
  });
});
