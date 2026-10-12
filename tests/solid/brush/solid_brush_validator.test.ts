import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';

/** Unit tests for solid brush topology, convexity, and unique outward normals. */
describe('SolidBrushValidator', () => {
  it('accepts a box whose opposite faces keep distinct outward normals', () => {
    const brush = createRandomCenteredBox();
    const validation = SolidBrushValidator.validate(brush);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
  });

  it('rejects a convex brush that stores one face as two coplanar triangles', () => {
    const split = splitOneQuadIntoCoplanarTriangles(createRandomCenteredBox());
    expect(split).not.toBeNull();
    if (!split) {
      return;
    }
    const validation = SolidBrushValidator.validate(split);
    expect(split.faces.length).toBe(7);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((error) => error.includes('share an outward normal'))).toBe(true);
    expect(validation.errors.some((error) => error.includes('outside plane'))).toBe(false);
  });

  it('rejects a convex brush that has two vertices at the same position', () => {
    const brush = createRandomCenteredBox();
    expect(copyFirstVertexOntoSecond(brush)).toBe(true);
    const validation = SolidBrushValidator.validate(brush);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((error) => error.includes('share a position'))).toBe(true);
    expect(validation.errors.some((error) => error.includes('outside plane'))).toBe(false);
  });

  it('still rejects a dented brush when a vertex leaves a face half-space', () => {
    const brush = createRandomCenteredBox();
    dentFarthestCornerTowardCentroid(brush);
    const validation = SolidBrushValidator.validate(brush);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((error) => error.includes('outside plane'))).toBe(true);
  });
});

/**
 * Copies the first vertex position onto the second vertex of the same brush.
 *
 * @param brush Brush whose vertices are updated.
 * @returns True when both vertices exist.
 */
function copyFirstVertexOntoSecond(brush: SolidBrush): boolean {
  const source = brush.vertices[0];
  const destination = brush.vertices[1];
  if (!source || !destination) {
    return false;
  }
  destination.copy(source);
  return true;
}

/**
 * Builds a centered box whose extents are chosen at runtime.
 *
 * @returns Convex box brush.
 */
function createRandomCenteredBox(): SolidBrush {
  const width = 1 + Math.random();
  const height = 1 + Math.random();
  const depth = 1 + Math.random();
  return SolidBrushFactory.createCenteredBox(width, height, depth);
}

/**
 * Rebuilds a brush with one quad replaced by two boundary-ordered triangles.
 *
 * @param brush Source brush that contains a quad face.
 * @returns Rebuilt brush, or null when no quad can be split.
 */
function splitOneQuadIntoCoplanarTriangles(brush: SolidBrush): SolidBrush | null {
  const loops = collectFaceLoops(brush);
  const quadIndex = findQuadLoopIndex(loops);
  if (quadIndex < 0) {
    return null;
  }
  return SolidBrushFactory.createFromFaceLoops(replaceQuadWithTriangles(loops, quadIndex));
}

/**
 * Copies each face ring from the brush.
 *
 * @param brush Source brush.
 * @returns Face loops in face order.
 */
function collectFaceLoops(brush: SolidBrush): THREE.Vector3[][] {
  return brush.faces.map((face) => brush.getFaceVertices(face));
}

/**
 * Finds the first four-corner face loop.
 *
 * @param loops Face loops.
 * @returns Loop index, or -1 when every loop is shorter.
 */
function findQuadLoopIndex(loops: readonly THREE.Vector3[][]): number {
  return loops.findIndex((loop) => loop.length === 4);
}

/**
 * Replaces one quad loop with triangles that follow its boundary order.
 *
 * @param loops Face loops.
 * @param quadIndex Index of the quad to split.
 * @returns Loops with that quad replaced.
 */
function replaceQuadWithTriangles(loops: THREE.Vector3[][], quadIndex: number): THREE.Vector3[][] {
  const quad = loops[quadIndex];
  const triangleFirst = quad ? triangleFromQuad(quad, 0, 1, 2) : null;
  const triangleSecond = quad ? triangleFromQuad(quad, 0, 2, 3) : null;
  if (!triangleFirst || !triangleSecond) {
    return loops;
  }
  const replaced = loops.slice();
  replaced.splice(quadIndex, 1, triangleFirst, triangleSecond);
  return replaced;
}

/**
 * Copies three corners of a quad into a triangle.
 *
 * @param quad Quad corners.
 * @param first First corner index.
 * @param second Second corner index.
 * @param third Third corner index.
 * @returns Triangle, or null when a corner is missing.
 */
function triangleFromQuad(
  quad: readonly THREE.Vector3[],
  first: number,
  second: number,
  third: number,
): THREE.Vector3[] | null {
  const cornerA = quad[first];
  const cornerB = quad[second];
  const cornerC = quad[third];
  if (!cornerA || !cornerB || !cornerC) {
    return null;
  }
  return [cornerA, cornerB, cornerC];
}

/**
 * Moves the vertex farthest from the centroid halfway toward the centroid.
 *
 * @param brush Brush whose vertices and planes are updated.
 */
function dentFarthestCornerTowardCentroid(brush: SolidBrush): void {
  const centroid = computeVertexCentroid(brush);
  const farthest = findFarthestVertex(brush, centroid);
  if (!farthest) {
    return;
  }
  farthest.lerp(centroid, 0.5);
  brush.recalculatePlanes();
}

/**
 * Averages the brush vertex positions.
 *
 * @param brush Brush to measure.
 * @returns Centroid, or the origin when the brush has no vertices.
 */
function computeVertexCentroid(brush: SolidBrush): THREE.Vector3 {
  const centroid = new THREE.Vector3();
  for (const vertex of brush.vertices) {
    centroid.add(vertex);
  }
  if (brush.vertices.length === 0) {
    return centroid;
  }
  return centroid.multiplyScalar(1 / brush.vertices.length);
}

/**
 * Finds the vertex with the greatest squared distance from a point.
 *
 * @param brush Brush to search.
 * @param origin Reference point.
 * @returns Farthest vertex, or null when the brush has no vertices.
 */
function findFarthestVertex(brush: SolidBrush, origin: THREE.Vector3): THREE.Vector3 | null {
  let farthest: THREE.Vector3 | null = null;
  let farthestDistance = -1;
  for (const vertex of brush.vertices) {
    const distance = vertex.distanceToSquared(origin);
    if (distance > farthestDistance) {
      farthestDistance = distance;
      farthest = vertex;
    }
  }
  return farthest;
}
