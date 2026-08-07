import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidCsgCompiler } from '@/solid/algorithm/compile/solid_csg_compiler.js';
import type { SolidCompiledPolygon } from '@/solid/algorithm/compile/solid_compiled_polygon.js';
import { SOLID_VERTEX_EQUAL_EPSILON } from '@/solid/algorithm/math/solid_math_constants.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

/** Half-height of the additive box (scale.y * 0.5 for unit mesh). */
const ADDITIVE_HALF_HEIGHT = 0.125;
/** Additive center Y that leaves a centimeter-scale gap under the elev floor. */
const ADDITIVE_CENTER_Y = -0.135533;
/** Elevation floor height for the stepped room. */
const ELEVATION_FLOOR_Y = 0;
/** World X of the shared room / elevation wall plane. */
const ROOM_EAST_WALL_X = 0.5;
/** Half-centimeter tolerance when testing wall-strip coverage. */
const SURFACE_HIT_TOLERANCE = 0.002;

/**
 * Builds a transformed box brush instance.
 *
 * @param id Brush id.
 * @param size Base edge length before scale.
 * @param operation CSG operation.
 * @param position World position.
 * @param scale Optional non-uniform scale.
 * @returns Instance with TRS pushed to the mesh.
 */
function makeTransformedBox(
  id: string,
  size: number,
  operation: SolidOperation,
  position: THREE.Vector3,
  scale?: THREE.Vector3,
): SolidBrushInstance {
  const brush = SolidBrushFactory.createCenteredBox(size, size, size);
  const instance = new SolidBrushInstance(id, id, brush, operation);
  instance.position.copy(position);
  if (scale) {
    instance.scale.copy(scale);
  }
  instance.pushTransformToMesh();
  return instance;
}

/**
 * Returns the additive top Y for the centimeter-gap placement.
 *
 * @returns Additive top plane Y.
 */
function additiveTopY(): number {
  return ADDITIVE_CENTER_Y + ADDITIVE_HALF_HEIGHT;
}

/**
 * Builds the inverted-world stepped room with a slightly low additive block.
 *
 * @returns Room, elevation, and additive instances.
 */
function buildElevationGapScene(): SolidBrushInstance[] {
  const room = makeTransformedBox('room', 1, SolidOperation.Subtractive, new THREE.Vector3(0, 0, 0));
  const elevation = makeTransformedBox('elev', 1, SolidOperation.Subtractive, new THREE.Vector3(1, 0.5, 0));
  const additive = makeTransformedBox(
    'add',
    1,
    SolidOperation.Additive,
    new THREE.Vector3(0.375, ADDITIVE_CENTER_Y, 0),
    new THREE.Vector3(0.25, 0.25, 1),
  );
  return [room, elevation, additive];
}

/**
 * Compiles the elevation-gap scene in inverted-world mode.
 *
 * @returns Compiled surface polygons.
 */
function compileElevationGapScene(): SolidCompiledPolygon[] {
  const brushes = buildElevationGapScene();
  return new SolidCsgCompiler().compile(brushes, { forceFull: true, invertedWorld: true });
}

/**
 * Returns true when a point lies near a polygon plane within tolerance.
 *
 * @param point Query point.
 * @param polygon Surface polygon.
 * @param tolerance Max plane distance.
 * @returns True when the point is near the plane.
 */
function pointNearPolygonPlane(point: THREE.Vector3, polygon: SolidCompiledPolygon, tolerance: number): boolean {
  const first = polygon.vertices[0];
  if (!first) {
    return false;
  }
  return Math.abs(polygon.normal.dot(point) - polygon.normal.dot(first)) <= tolerance;
}

/**
 * Returns true when a point lies inside the axis-aligned bounds of a polygon.
 *
 * @param point Query point.
 * @param polygon Surface polygon.
 * @param tolerance Bounds padding.
 * @returns True when inside the padded AABB.
 */
function pointInsidePolygonBounds(point: THREE.Vector3, polygon: SolidCompiledPolygon, tolerance: number): boolean {
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const vertex of polygon.vertices) {
    min.min(vertex);
    max.max(vertex);
  }
  return (
    point.x >= min.x - tolerance &&
    point.x <= max.x + tolerance &&
    point.y >= min.y - tolerance &&
    point.y <= max.y + tolerance &&
    point.z >= min.z - tolerance &&
    point.z <= max.z + tolerance
  );
}

/**
 * Counts surfaces that cover a sample point near a plane and inside the ring
 * AABB.
 *
 * @param polygons Compiled polygons.
 * @param point Sample point.
 * @param tolerance Plane and bounds tolerance.
 * @returns Number of covering polygons.
 */
function countSurfaceHitsAtPoint(
  polygons: readonly SolidCompiledPolygon[],
  point: THREE.Vector3,
  tolerance: number,
): number {
  let hits = 0;
  for (const polygon of polygons) {
    if (!pointNearPolygonPlane(point, polygon, tolerance)) {
      continue;
    }
    if (!pointInsidePolygonBounds(point, polygon, tolerance)) {
      continue;
    }
    hits += 1;
  }
  return hits;
}

/**
 * Returns room wall polygons facing into the room on the east wall plane.
 *
 * @param polygons Compiled polygons.
 * @returns Room east-wall polygons.
 */
function roomEastWallPolygons(polygons: readonly SolidCompiledPolygon[]): SolidCompiledPolygon[] {
  return polygons.filter((polygon) => polygon.brushId === 'room' && polygon.normal.x < -0.9);
}

/**
 * Returns true when any room east-wall polygon covers the gap band in Y.
 *
 * @param polygons Compiled polygons.
 * @param gapBottom Inclusive lower Y of the gap.
 * @param gapTop Inclusive upper Y of the gap.
 * @returns True when a wall strip spans the gap.
 */
function roomEastWallCoversGapBand(
  polygons: readonly SolidCompiledPolygon[],
  gapBottom: number,
  gapTop: number,
): boolean {
  for (const polygon of roomEastWallPolygons(polygons)) {
    if (polygonCoversYBandOnEastWall(polygon, gapBottom, gapTop)) {
      return true;
    }
  }
  return false;
}

/**
 * Returns true when one east-wall polygon spans a Y band at the wall X.
 *
 * @param polygon Candidate polygon.
 * @param gapBottom Lower Y.
 * @param gapTop Upper Y.
 * @returns True when the polygon covers the band.
 */
function polygonCoversYBandOnEastWall(polygon: SolidCompiledPolygon, gapBottom: number, gapTop: number): boolean {
  let minY = Infinity;
  let maxY = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  for (const vertex of polygon.vertices) {
    minY = Math.min(minY, vertex.y);
    maxY = Math.max(maxY, vertex.y);
    minX = Math.min(minX, vertex.x);
    maxX = Math.max(maxX, vertex.x);
  }
  const onWall = minX <= ROOM_EAST_WALL_X + SURFACE_HIT_TOLERANCE && maxX >= ROOM_EAST_WALL_X - SURFACE_HIT_TOLERANCE;
  return onWall && minY <= gapBottom + SURFACE_HIT_TOLERANCE && maxY >= gapTop - SURFACE_HIT_TOLERANCE;
}

/**
 * Near-coplanar elevation gaps smaller than the old 1.25 cm weld radius must
 * keep the room wall strip between the additive top and the elevation floor.
 */
describe('Solid CSG elevation gap wall strip', () => {
  it('uses a sub-millimeter vertex weld radius', () => {
    expect(SOLID_VERTEX_EQUAL_EPSILON).toBeCloseTo(0.0005, 10);
  });

  it('keeps the room wall strip for a one-centimeter elevation gap', () => {
    const gapBottom = additiveTopY();
    const gapTop = ELEVATION_FLOOR_Y;
    expect(gapTop - gapBottom).toBeGreaterThan(0.01);
    expect(gapTop - gapBottom).toBeLessThan(0.011);
    expect(gapTop - gapBottom).toBeGreaterThan(SOLID_VERTEX_EQUAL_EPSILON);

    const polygons = compileElevationGapScene();
    const midGap = new THREE.Vector3(ROOM_EAST_WALL_X, (gapBottom + gapTop) * 0.5, 0);
    expect(countSurfaceHitsAtPoint(polygons, midGap, SURFACE_HIT_TOLERANCE)).toBeGreaterThan(0);
    expect(roomEastWallCoversGapBand(polygons, gapBottom, gapTop)).toBe(true);
  });

  it('still emits additive top and elevation floor as distinct surfaces', () => {
    const polygons = compileElevationGapScene();
    const addTop = new THREE.Vector3(0.375, additiveTopY(), 0);
    const elevFloor = new THREE.Vector3(1.0, ELEVATION_FLOOR_Y, 0);
    expect(countSurfaceHitsAtPoint(polygons, addTop, SURFACE_HIT_TOLERANCE)).toBeGreaterThan(0);
    expect(countSurfaceHitsAtPoint(polygons, elevFloor, SURFACE_HIT_TOLERANCE)).toBeGreaterThan(0);
  });
});
