import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { applyTopologyLoopCut, previewTopologyLoopCut } from '@/edit/topology/topology_loop_cut.js';
import { brushToWorkingGeometry, workingGeometryToBrush } from '@/edit/topology/topology_working_from_brush.js';
import { findWorkingEdgeParallelToY } from './topology_test_edges.js';

describe('topology_loop_cut', () => {
  it('cuts a waist loop on a cube and keeps volume bounds', () => {
    const size = 2;
    const brush = SolidBrushFactory.createCenteredBox(size, size, size);
    const working = brushToWorkingGeometry(brush);
    const beforeBounds = computeWorkingBounds(working);
    const beforeVertices = working.positions.length;
    const edge = findWorkingEdgeParallelToY(working);
    expect(edge).not.toBeNull();
    if (!edge) {
      return;
    }
    const preview = previewTopologyLoopCut(working, edge.vertexA, edge.vertexB, 0.5);
    expect(preview).not.toBeNull();
    expect(preview?.crossings.length).toBe(4);
    const result = applyTopologyLoopCut(working, edge.vertexA, edge.vertexB, 0.5);
    expect(result.applied).toBe(true);
    expect(working.positions.length).toBe(beforeVertices + 4);
    const rebuilt = workingGeometryToBrush(working);
    expect(rebuilt).not.toBeNull();
    if (!rebuilt) {
      return;
    }
    const validation = SolidBrushValidator.validate(rebuilt);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((error) => error.includes('share an outward normal'))).toBe(true);
    const afterBounds = computeWorkingBounds(working);
    expect(afterBounds.min.distanceTo(beforeBounds.min)).toBeLessThan(1e-6);
    expect(afterBounds.max.distanceTo(beforeBounds.max)).toBeLessThan(1e-6);
  });

  it('becomes a valid brush after the inserted ring is scaled outward', () => {
    const brush = SolidBrushFactory.createCenteredBox(2, 2, 2);
    const working = brushToWorkingGeometry(brush);
    const beforeVertices = working.positions.length;
    const edge = findWorkingEdgeParallelToY(working);
    expect(edge).not.toBeNull();
    if (!edge) {
      return;
    }
    const result = applyTopologyLoopCut(working, edge.vertexA, edge.vertexB, 0.5);
    expect(result.applied).toBe(true);
    scaleInsertedRingAwayFromCentroid(working, beforeVertices);
    const shaped = workingGeometryToBrush(working);
    expect(shaped).not.toBeNull();
    if (!shaped) {
      return;
    }
    expect(SolidBrushValidator.validate(shaped).valid).toBe(true);
  });

  it('orders a cube waist preview as a simple convex loop', () => {
    const working = brushToWorkingGeometry(SolidBrushFactory.createCenteredBox(2, 2, 2));
    const edge = findWorkingEdgeParallelToY(working);
    expect(edge).not.toBeNull();
    if (!edge) {
      return;
    }
    const preview = previewTopologyLoopCut(working, edge.vertexA, edge.vertexB, 0.5);
    expect(preview?.crossings).toHaveLength(4);
    const points = collectPreviewPoints(working, preview?.crossings ?? []);
    expect(points).toHaveLength(4);
    expect(loopCrossProductsHaveOneSign(points)).toBe(true);
  });

  it('refuses a tetrahedron edge that cannot form a loop', () => {
    const tetra = createTetrahedronBrush();
    expect(tetra).not.toBeNull();
    if (!tetra) {
      return;
    }
    const working = brushToWorkingGeometry(tetra);
    const edge = working.faces[0];
    expect(edge).toBeTruthy();
    if (!edge || edge.vertexIndices.length < 2) {
      return;
    }
    const vertexA = edge.vertexIndices[0];
    const vertexB = edge.vertexIndices[1];
    if (vertexA === undefined || vertexB === undefined) {
      return;
    }
    const result = applyTopologyLoopCut(working, vertexA, vertexB, 0.5);
    expect(result.applied).toBe(false);
  });
});

/**
 * Collects local crossing points for a loop-cut preview.
 *
 * @param geometry Working geometry.
 * @param crossings Ordered crossings.
 * @returns Local points.
 */
function collectPreviewPoints(
  geometry: ReturnType<typeof brushToWorkingGeometry>,
  crossings: readonly import('@/edit/topology/topology_loop_cut_plane.js').TopologyLoopCutCrossing[],
): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (const crossing of crossings) {
    const start = geometry.positions[crossing.vertexA];
    const end = geometry.positions[crossing.vertexB];
    if (start && end) {
      points.push(start.clone().lerp(end, crossing.parameter));
    }
  }
  return points;
}

/**
 * Returns whether consecutive loop edges turn the same way.
 *
 * @param points Ordered loop points.
 * @returns True when the loop is consistently wound.
 */
function loopCrossProductsHaveOneSign(points: readonly THREE.Vector3[]): boolean {
  if (points.length < 3) {
    return false;
  }
  let sign = 0;
  for (let index = 0; index < points.length; index++) {
    const previous = points[(index + points.length - 1) % points.length];
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (!previous || !current || !next) {
      return false;
    }
    const incoming = current.clone().sub(previous);
    const outgoing = next.clone().sub(current);
    const turn = incoming.cross(outgoing).y;
    if (Math.abs(turn) < 1e-8) {
      continue;
    }
    const nextSign = turn > 0 ? 1 : -1;
    if (sign !== 0 && nextSign !== sign) {
      return false;
    }
    sign = nextSign;
  }
  return sign !== 0;
}

/**
 * Builds axis-aligned bounds from working positions.
 *
 * @param geometry Working geometry.
 * @returns Bounds.
 */
function computeWorkingBounds(geometry: { positions: THREE.Vector3[] }): THREE.Box3 {
  return new THREE.Box3().setFromPoints(geometry.positions);
}

/**
 * Moves vertices inserted by a cut away from their own centroid.
 *
 * @param geometry Working geometry.
 * @param firstInserted Index of the first inserted vertex.
 */
function scaleInsertedRingAwayFromCentroid(geometry: { positions: THREE.Vector3[] }, firstInserted: number): void {
  const centroid = insertedRingCentroid(geometry, firstInserted);
  scalePositionsAwayFromPoint(geometry, firstInserted, centroid, 1.5);
}

/**
 * Averages positions inserted at the end of the working geometry.
 *
 * @param geometry Working geometry.
 * @param firstInserted Index of the first inserted vertex.
 * @returns Centroid of those positions.
 */
function insertedRingCentroid(geometry: { positions: THREE.Vector3[] }, firstInserted: number): THREE.Vector3 {
  const centroid = new THREE.Vector3();
  let count = 0;
  for (let index = firstInserted; index < geometry.positions.length; index++) {
    const position = geometry.positions[index];
    if (!position) {
      continue;
    }
    centroid.add(position);
    count += 1;
  }
  if (count === 0) {
    return centroid;
  }
  return centroid.multiplyScalar(1 / count);
}

/**
 * Scales a tail of positions away from a point.
 *
 * @param geometry Working geometry.
 * @param firstInserted Index of the first position to move.
 * @param origin Point positions move away from.
 * @param scale Distance multiplier.
 */
function scalePositionsAwayFromPoint(
  geometry: { positions: THREE.Vector3[] },
  firstInserted: number,
  origin: THREE.Vector3,
  scale: number,
): void {
  for (let index = firstInserted; index < geometry.positions.length; index++) {
    const position = geometry.positions[index];
    if (!position) {
      continue;
    }
    position.sub(origin).multiplyScalar(scale).add(origin);
  }
}

/**
 * Builds a regular tetrahedron solid brush.
 *
 * @returns Brush, or null when loops fail.
 */
function createTetrahedronBrush(): ReturnType<typeof SolidBrushFactory.createFromFaceLoops> {
  const a = new THREE.Vector3(1, 1, 1);
  const b = new THREE.Vector3(1, -1, -1);
  const c = new THREE.Vector3(-1, 1, -1);
  const d = new THREE.Vector3(-1, -1, 1);
  return SolidBrushFactory.createFromFaceLoops([
    [a.clone(), c.clone(), b.clone()],
    [a.clone(), b.clone(), d.clone()],
    [a.clone(), d.clone(), c.clone()],
    [b.clone(), c.clone(), d.clone()],
  ]);
}
