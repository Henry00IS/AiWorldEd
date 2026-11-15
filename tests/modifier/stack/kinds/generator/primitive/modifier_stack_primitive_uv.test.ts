import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { primitiveMappedFaces, primitivePieces, primitiveSeamJump } from './primitive_fixture.js';

/**
 * Returns whether a point lies on the revolve axis, where every face meets.
 *
 * @param point Frame point.
 * @returns True on the axis.
 */
function primitivePole(point: THREE.Vector3): boolean {
  return Math.hypot(point.x, point.z) < 1e-6;
}

describe('primitive generator texture mapping', () => {
  it('wraps round shapes without seams between neighbouring faces', () => {
    for (const kind of ['cylinder', 'cone', 'pipe']) {
      const faces = primitiveMappedFaces(primitivePieces(kind, [2, 2, 2]).pieces);
      expect(primitiveSeamJump(faces, 50, primitivePole), kind).toBeLessThan(1e-3);
    }
  });

  it('keeps the unavoidable seams of tapered faces under an eighth of a repeat', () => {
    for (const kind of ['sphere', 'capsule', 'torus']) {
      const faces = primitiveMappedFaces(primitivePieces(kind, [2, 2, 2]).pieces);
      expect(primitiveSeamJump(faces, 50, primitivePole), kind).toBeLessThan(0.125);
    }
  });

  it('keeps curved stairs walls and treads continuous along the curve', () => {
    const faces = primitiveMappedFaces(primitivePieces('curvedStairs', [4, 3, 4], { stepDetail: 4 }).pieces);
    expect(primitiveSeamJump(faces, 30)).toBeLessThan(1e-3);
  });

  it('textures every flat shape at one repeat per metre', () => {
    for (const kind of ['wedge', 'pyramid', 'prism', 'hollowBox']) {
      for (const face of primitiveMappedFaces(primitivePieces(kind, [3, 2, 4]).pieces)) {
        const [a, b] = face.corners;
        if (!a || !b) continue;
        expect(a.uv.distanceTo(b.uv), kind).toBeCloseTo(a.point.distanceTo(b.point), 5);
      }
    }
  });

  it('never mirrors a texture: U, V and the face normal stay right-handed', () => {
    for (const kind of ['torus', 'pipe', 'curvedStairs', 'wedge', 'hollowBox', 'sphere']) {
      for (const piece of primitivePieces(kind, [3, 2, 3]).pieces)
        piece.brush.faces.forEach((face, index) => {
          const uv = piece.getFaceSurface(face.surfaceIndex).uv;
          const u = new THREE.Vector3(uv.u.x, uv.u.y, uv.u.z);
          const v = new THREE.Vector3(uv.v.x, uv.v.y, uv.v.z);
          const normal = piece.brush.planes[index]?.normal ?? new THREE.Vector3();
          expect(new THREE.Vector3().crossVectors(u, v).dot(normal), kind).toBeGreaterThan(0);
        });
    }
  });

  it('keeps wall textures upright on pipes and curved stairs', () => {
    for (const kind of ['pipe', 'curvedStairs']) {
      for (const face of primitiveMappedFaces(primitivePieces(kind, [4, 3, 4]).pieces)) {
        if (Math.abs(face.normal.y) > 1e-6) continue;
        const top = face.corners.reduce((best, corner) => (corner.point.y > best.point.y ? corner : best));
        const bottom = face.corners.reduce((best, corner) => (corner.point.y < best.point.y ? corner : best));
        if (top.point.y - bottom.point.y < 1e-3) continue;
        expect(top.uv.y - bottom.uv.y, kind).toBeCloseTo(top.point.y - bottom.point.y, 5);
      }
    }
  });
});
