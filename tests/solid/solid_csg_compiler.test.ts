import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidBrushFactory } from '../../src/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '../../src/solid/model/solid_brush_instance.js';
import { SolidCsgCompiler } from '../../src/solid/algorithm/solid_csg_compiler.js';
import { SolidOperation } from '../../src/solid/types/solid_operation.js';
import { BrushMembership } from '../../src/solid/algorithm/brush_membership.js';
import { SurfaceTriangulator } from '../../src/solid/algorithm/surface_triangulator.js';

/**
 * Builds a solid brush instance from a box with optional transform and operation.
 * @param id Brush id.
 * @param size Box edge length.
 * @param operation CSG operation.
 * @param position Optional local position.
 * @returns Configured brush instance.
 */
function makeBoxBrush(
  id: string,
  size: number,
  operation: SolidOperation,
  position?: THREE.Vector3
): SolidBrushInstance {
  const brush = SolidBrushFactory.createCenteredBox(size, size, size);
  const instance = new SolidBrushInstance(id, id, brush, operation);
  if (position) instance.position.copy(position);
  return instance;
}

/**
 * Returns true when a point is inside the compiled solid via membership evaluation.
 * @param point Sample point.
 * @param brushes Brush instances in tree order.
 * @returns Membership result.
 */
function isInsideSolid(
  point: THREE.Vector3,
  brushes: SolidBrushInstance[]
): boolean {
  let inside = false;
  for (const instance of brushes) {
    const modelBrush = instance.getModelSpaceBrush();
    const inBrush = BrushMembership.isInsidePlanes(point, modelBrush.planes);
    if (instance.operation === SolidOperation.Additive) {
      inside = inside || inBrush;
    } else if (instance.operation === SolidOperation.Subtractive) {
      inside = inside && !inBrush;
    } else {
      inside = inside && inBrush;
    }
  }
  return inside;
}

/**
 * Unit tests for Sander-style solid CSG compilation.
 */
describe('SolidCsgCompiler', () => {
  it('compiles a single additive box into a closed surface with volume', () => {
    const size = 2;
    const brushes = [makeBoxBrush('a', size, SolidOperation.Additive)];
    const compiler = new SolidCsgCompiler();
    const polygons = compiler.compile(brushes);
    expect(polygons.length).toBeGreaterThanOrEqual(6);
    const arrays = SurfaceTriangulator.buildMeshArrays(polygons);
    expect(arrays.triangleCount).toBeGreaterThanOrEqual(12);
    expect(isInsideSolid(new THREE.Vector3(0, 0, 0), brushes)).toBe(true);
    expect(isInsideSolid(new THREE.Vector3(size, 0, 0), brushes)).toBe(false);
  });

  it('subtracts a smaller box from a larger box creating a cavity', () => {
    const outer = makeBoxBrush('outer', 4, SolidOperation.Additive);
    const cutter = makeBoxBrush(
      'cutter',
      2,
      SolidOperation.Subtractive,
      new THREE.Vector3(0, 0, 0)
    );
    const brushes = [outer, cutter];
    const compiler = new SolidCsgCompiler();
    const polygons = compiler.compile(brushes);
    expect(polygons.length).toBeGreaterThan(6);
    expect(isInsideSolid(new THREE.Vector3(0, 0, 0), brushes)).toBe(false);
    expect(isInsideSolid(new THREE.Vector3(1.6, 0, 0), brushes)).toBe(true);
    const arrays = SurfaceTriangulator.buildMeshArrays(polygons);
    expect(arrays.triangleCount).toBeGreaterThan(12);
  });

  it('unions two offset additive boxes without collapsing either volume', () => {
    const left = makeBoxBrush(
      'left',
      2,
      SolidOperation.Additive,
      new THREE.Vector3(-0.75, 0, 0)
    );
    const right = makeBoxBrush(
      'right',
      2,
      SolidOperation.Additive,
      new THREE.Vector3(0.75, 0, 0)
    );
    const brushes = [left, right];
    const compiler = new SolidCsgCompiler();
    const polygons = compiler.compile(brushes);
    expect(polygons.length).toBeGreaterThan(6);
    expect(isInsideSolid(new THREE.Vector3(-0.75, 0, 0), brushes)).toBe(true);
    expect(isInsideSolid(new THREE.Vector3(0.75, 0, 0), brushes)).toBe(true);
    expect(isInsideSolid(new THREE.Vector3(0, 0, 0), brushes)).toBe(true);
    expect(isInsideSolid(new THREE.Vector3(3, 0, 0), brushes)).toBe(false);
  });

  it('intersects two overlapping boxes into the shared region only', () => {
    const a = makeBoxBrush(
      'a',
      2,
      SolidOperation.Additive,
      new THREE.Vector3(-0.5, 0, 0)
    );
    const b = makeBoxBrush(
      'b',
      2,
      SolidOperation.Intersecting,
      new THREE.Vector3(0.5, 0, 0)
    );
    const brushes = [a, b];
    const compiler = new SolidCsgCompiler();
    const polygons = compiler.compile(brushes);
    expect(polygons.length).toBeGreaterThanOrEqual(6);
    expect(isInsideSolid(new THREE.Vector3(0, 0, 0), brushes)).toBe(true);
    expect(isInsideSolid(new THREE.Vector3(-1.2, 0, 0), brushes)).toBe(false);
    expect(isInsideSolid(new THREE.Vector3(1.2, 0, 0), brushes)).toBe(false);
  });

  it('does not emit duplicate coplanar exterior faces from two additive boxes', () => {
    const size = 2;
    const centerOffset = size * 0.5;
    const left = makeBoxBrush(
      'left',
      size,
      SolidOperation.Additive,
      new THREE.Vector3(0, 0, 0)
    );
    const right = makeBoxBrush(
      'right',
      size,
      SolidOperation.Additive,
      new THREE.Vector3(centerOffset, 0, 0)
    );
    left.surfaceTextureId = 'folder/left.png';
    right.surfaceTextureId = 'folder/right.png';
    const brushes = [left, right];
    const compiler = new SolidCsgCompiler();
    const polygons = compiler.compile(brushes);
    const topNormal = new THREE.Vector3(0, 1, 0);
    const topPolygons = polygons.filter(
      (polygon) => polygon.normal.dot(topNormal) > 0.99
    );
    const samplePoint = new THREE.Vector3(centerOffset * 0.5, size * 0.5, 0);
    const coveringTops = topPolygons.filter((polygon) =>
      polygonCoversPointOnPlane(polygon.vertices, samplePoint)
    );
    const coverageSummary = coveringTops.map((polygon) => ({
      brushId: polygon.brushId,
      vertexCount: polygon.vertices.length,
      centerX:
        polygon.vertices.reduce((sum, vertex) => sum + vertex.x, 0) /
        polygon.vertices.length
    }));
    expect(coverageSummary, JSON.stringify(coverageSummary)).toHaveLength(1);
    expect(coveringTops[0].brushId).toBe('right');
    expect(isInsideSolid(new THREE.Vector3(0, 0, 0), brushes)).toBe(true);
    expect(isInsideSolid(new THREE.Vector3(centerOffset, 0, 0), brushes)).toBe(
      true
    );
  });
});

/**
 * Returns true when a coplanar polygon roughly covers a point (2D XY for top).
 * @param vertices Polygon vertices.
 * @param point Point on the polygon plane.
 * @returns True when the point lies inside the polygon AABB in XZ.
 */
function polygonCoversPointOnPlane(
  vertices: THREE.Vector3[],
  point: THREE.Vector3
): boolean {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const vertex of vertices) {
    minX = Math.min(minX, vertex.x);
    maxX = Math.max(maxX, vertex.x);
    minZ = Math.min(minZ, vertex.z);
    maxZ = Math.max(maxZ, vertex.z);
  }
  const pad = 1e-4;
  return (
    point.x >= minX - pad &&
    point.x <= maxX + pad &&
    point.z >= minZ - pad &&
    point.z <= maxZ + pad
  );
}
