import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { stackFixture } from '../../modifier_stack_fixture.js';

/** One face corner of a generated piece with its texture coordinate. */
interface ArchCorner {
  piece: number;
  normal: THREE.Vector3;
  position: THREE.Vector3;
  uv: { u: number; v: number };
}

/**
 * Builds an arch and returns its pieces.
 *
 * @param parameters Arch parameters.
 * @returns Generated brushes.
 */
function arch(parameters: Record<string, unknown>): SolidBrushInstance[] {
  const fixture = stackFixture([{ kind: 'arch', parameters }], 4);
  fixture.volume.scale.set(4, 3, 1);
  return fixture.compile().instances.slice(1);
}

/**
 * Lists every face corner of the pieces in model space.
 *
 * @param pieces Pieces.
 * @returns Corners.
 */
function corners(pieces: readonly SolidBrushInstance[]): ArchCorner[] {
  const list: ArchCorner[] = [];
  pieces.forEach((instance, piece) => {
    const matrix = instance.getLocalMatrix();
    const turn = new THREE.Matrix3().getNormalMatrix(matrix);
    instance.brush.faces.forEach((face, index) => {
      const surface = instance.getFaceSurface(index);
      const normal = (instance.brush.planes[index]?.normal ?? new THREE.Vector3())
        .clone()
        .applyMatrix3(turn)
        .normalize();
      for (const corner of instance.brush.getFaceVertexIndices(face)) {
        const local = instance.brush.vertices[corner] ?? new THREE.Vector3();
        list.push({ piece, normal, position: local.clone().applyMatrix4(matrix), uv: surface.uv.project(local) });
      }
    });
  });
  return list;
}

/**
 * Counts corners shared by two pieces on one smooth surface, checking that both
 * pieces give them the same texture coordinate.
 *
 * @param list Corners.
 * @param bend Smallest normal dot product that still counts as one surface.
 * @param pick Which corners to compare.
 * @returns Number of shared corners compared.
 */
function expectSeamless(list: readonly ArchCorner[], bend: number, pick: (corner: ArchCorner) => boolean): number {
  let shared = 0;
  const chosen = list.filter(pick);
  for (const a of chosen) {
    for (const b of chosen) {
      if (a.piece >= b.piece || a.position.distanceTo(b.position) > 1e-5 || a.normal.dot(b.normal) < bend) continue;
      expect(a.uv.u).toBeCloseTo(b.uv.u, 5);
      expect(a.uv.v).toBeCloseTo(b.uv.v, 5);
      shared++;
    }
  }
  return shared;
}

/**
 * Returns whether a normal points mostly along the depth axis.
 *
 * @param normal Normal.
 * @param spanAxis Span axis.
 * @returns True for front and back faces.
 */
function isFront(normal: THREE.Vector3, spanAxis: string): boolean {
  return Math.abs(spanAxis === 'z' ? normal.x : normal.z) > 0.999;
}

/**
 * Returns whether a corner lies on a circular arch curve and belongs to a face
 * that follows that curve (not a joint between pieces).
 *
 * @param corner Corner.
 * @param radii Curve radii to try.
 * @returns True for corners of curved faces.
 */
function onCurve(corner: ArchCorner, radii: readonly number[]): boolean {
  const radial = new THREE.Vector3(corner.position.x, corner.position.y + 1.5, 0);
  const radius = radial.length();
  if (!radii.some((entry) => Math.abs(entry - radius) < 1e-4)) return false;
  return Math.abs(corner.normal.dot(radial.normalize())) > 0.9;
}

describe('arch texture mapping', () => {
  for (const span of ['x', 'z']) {
    it(`runs one seamless mapping across ring pieces (span ${span})`, () => {
      const list = corners(arch({ style: 'ring', segments: 8, span, thickness: 0.4 }));
      expect(expectSeamless(list, 0.999, (corner) => isFront(corner.normal, span))).toBeGreaterThan(20);
      expect(expectSeamless(list, 0.8, (corner) => !isFront(corner.normal, span))).toBeGreaterThan(20);
    });
  }

  it('measures U along the inner curve and keeps one texture repeat per metre', () => {
    const pieces = arch({ style: 'ring', segments: 12, thickness: 0.4, shape: 'round' });
    const inner = corners(pieces).filter((corner) => !isFront(corner.normal, 'x') && onCurve(corner, [1.6]));
    const us = inner.map((corner) => corner.uv.u);
    expect(Math.min(...us)).toBeCloseTo(0, 5);
    const radius = 2 - 0.4;
    const chord = 2 * radius * Math.sin(Math.PI / 24);
    expect(Math.max(...us)).toBeGreaterThanOrEqual(12 * chord - 1e-4);
  });

  it('lines up wall and tunnel pieces too, from any start and sweep', () => {
    for (const parameters of [
      { style: 'wall', segments: 6, shape: 'round' },
      { style: 'tunnel', segments: 6, shape: 'round' },
      { style: 'ring', segments: 5, sweep: 90, start: 'left', shape: 'round' },
    ]) {
      const list = corners(arch(parameters));
      const radii = parameters.style === 'tunnel' ? [2] : [1.75, 2];
      expect(expectSeamless(list, 0.999, (corner) => isFront(corner.normal, 'x'))).toBeGreaterThan(4);
      expect(
        expectSeamless(
          list,
          0.7,
          (corner) => !isFront(corner.normal, 'x') && Math.abs(corner.normal.x) < 0.999 && onCurve(corner, radii),
        ),
      ).toBeGreaterThan(4);
    }
  });

  it('never mirrors the texture compared with the standard face mapping', () => {
    for (const instance of arch({ style: 'ring', segments: 6 })) {
      instance.brush.faces.forEach((_face, index) => {
        const normal = instance.brush.planes[index]?.normal ?? new THREE.Vector3();
        const uv = instance.getFaceSurface(index).uv;
        const standard = SurfaceUvMatrix.fromTrs(new THREE.Vector2(), normal, 0, 1, 1);
        const hand = (matrix: SurfaceUvMatrix) =>
          new THREE.Vector3(matrix.u.x, matrix.u.y, matrix.u.z)
            .cross(new THREE.Vector3(matrix.v.x, matrix.v.y, matrix.v.z))
            .dot(normal);
        expect(Math.sign(hand(uv))).toBe(Math.sign(hand(standard)));
      });
    }
  });
});
