import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

/**
 * Reads the result mesh as a list of triangles.
 *
 * @param model Solid model after a rebuild.
 * @returns Triangles as corner triples.
 */
function resultTriangles(model: SolidModel): THREE.Vector3[][] {
  const position = model.getResultMesh().geometry.getAttribute('position');
  const triangles: THREE.Vector3[][] = [];
  for (let index = 0; index + 2 < position.count; index += 3) {
    const corners = [0, 1, 2].map((offset) => new THREE.Vector3().fromBufferAttribute(position, index + offset));
    triangles.push(corners);
  }
  return triangles;
}

/**
 * Counts result vertices that lie strictly inside a triangle edge.
 *
 * @param triangles Result triangles.
 * @returns Number of (vertex, edge) T-junction pairs.
 */
function countTJunctions(triangles: THREE.Vector3[][]): number {
  const vertices = triangles.flat();
  const segment = new THREE.Line3();
  const closest = new THREE.Vector3();
  let count = 0;
  for (const triangle of triangles) {
    for (let corner = 0; corner < 3; corner++) {
      segment.set(triangle[corner]!, triangle[(corner + 1) % 3]!);
      for (const vertex of vertices) {
        if (vertex.distanceTo(segment.start) < 1e-4 || vertex.distanceTo(segment.end) < 1e-4) continue;
        segment.closestPointToPoint(vertex, true, closest);
        if (closest.distanceTo(vertex) < 1e-4) count++;
      }
    }
  }
  return count;
}

/**
 * Sums the area of all result triangles.
 *
 * @param triangles Result triangles.
 * @returns Total area.
 */
function totalArea(triangles: THREE.Vector3[][]): number {
  let area = 0;
  for (const [a, b, c] of triangles) area += new THREE.Triangle(a, b, c).getArea();
  return area;
}

/**
 * Canonical sorted text of the triangles, independent of buffer order.
 *
 * @param triangles Result triangles.
 * @returns Sorted triangle keys joined into one string.
 */
function canonicalTriangles(triangles: THREE.Vector3[][]): string {
  return triangles
    .map((triangle) =>
      triangle
        .map((corner) =>
          corner
            .toArray()
            .map((value) => value.toFixed(5))
            .join(','),
        )
        .join(';'),
    )
    .sort()
    .join('|');
}

/**
 * Builds a tall box with a lower, narrower box against one side, so the lower
 * box's corners land inside the tall box's bottom and side edges.
 *
 * @param model Model to fill.
 * @returns The lower box brush.
 */
function addStepAgainstTallBox(model: SolidModel): ReturnType<SolidModel['addBoxBrush']> {
  model.addBoxBrush(2, SolidOperation.Additive);
  const step = model.addBoxBrush(1, SolidOperation.Additive);
  step.position.set(2, -0.5, 0);
  step.scale.set(2, 1, 1);
  step.pushTransformToMesh();
  return step;
}

describe('Solid result without T-junctions', () => {
  it('splits the tall box edges where the step corners meet them and keeps the exact surface area', () => {
    const model = new SolidModel('SeamStep');
    addStepAgainstTallBox(model);
    model.markDirty();
    model.rebuild(true);
    const triangles = resultTriangles(model);
    expect(countTJunctions(triangles)).toBe(0);
    expect(totalArea(triangles)).toBeCloseTo(24 - 1 + 9, 6);
  });

  it('with deferral off, gives the same seam-free result live while dragging as a full rebuild at each pose', () => {
    const model = new SolidModel('SeamStepDrag');
    model.setSeamsDeferredWhileDragging(false);
    const step = addStepAgainstTallBox(model);
    model.markDirty();
    model.rebuild(true);
    for (const offset of [0.2, 0.45, -0.3]) {
      step.mesh!.position.z = offset;
      step.mesh!.updateMatrixWorld(true);
      model.prepareLiveBrushEdit([step.mesh!], { positionLock: true, stretchLock: true });
      model.rebuildLive();
      const live = resultTriangles(model);
      expect(countTJunctions(live)).toBe(0);
      model.markDirty();
      model.rebuild(true);
      expect(canonicalTriangles(live)).toBe(canonicalTriangles(resultTriangles(model)));
    }
  });

  it('by default, puts seam work off while dragging and conforms once on release to the full rebuild result', () => {
    const model = new SolidModel('SeamStepDeferredDrag');
    const step = addStepAgainstTallBox(model);
    model.markDirty();
    model.rebuild(true);
    for (const offset of [0.2, 0.45, -0.3]) {
      step.mesh!.position.z = offset;
      step.mesh!.updateMatrixWorld(true);
      model.prepareLiveBrushEdit([step.mesh!], { positionLock: true, stretchLock: true });
      model.rebuildLive();
      expect(totalArea(resultTriangles(model))).toBeCloseTo(24 - 1 + 9, 6);
    }
    model.finalizeAfterInteractiveEdit();
    const released = resultTriangles(model);
    expect(countTJunctions(released)).toBe(0);
    model.markDirty();
    model.rebuild(true);
    expect(canonicalTriangles(released)).toBe(canonicalTriangles(resultTriangles(model)));
  });
});
