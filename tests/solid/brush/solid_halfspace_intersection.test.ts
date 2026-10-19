import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { modifierBevelTrackedEdges } from '@/modifier/bevel/modifier_bevel_brush_edges.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushPlaneClip } from '@/solid/brush/solid_brush_plane_clip.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { SolidHalfspaceIntersection } from '@/solid/brush/solid_halfspace_intersection.js';
import { SolidPlane } from '@/solid/brush/solid_plane.js';

/** Half-space intersection of a convex brush. */
describe('SolidHalfspaceIntersection', () => {
  it('rebuilds a centered box from its own face planes', () => {
    const brush = SolidBrushFactory.createCenteredBox(1, 1, 1);
    const rebuilt = SolidHalfspaceIntersection.build(brush, []);
    expect(rebuilt).toBe(brush);
  });

  it('cuts a box down to the negative side of a plane through the origin', () => {
    const brush = SolidBrushFactory.createCenteredBox(1, 1, 1);
    const cut = new SolidPlane(new THREE.Vector3(1, 0, 0), 0);
    const clipped = SolidHalfspaceIntersection.build(brush, [cut]);
    expect(clipped).not.toBeNull();
    if (!clipped) return;
    const validation = SolidBrushValidator.validate(clipped);
    expect(validation.valid, validation.errors.join('; ')).toBe(true);
    const bounds = clipped.computeLocalBounds();
    expect(bounds.max.x).toBeCloseTo(0, 3);
    expect(bounds.min.x).toBeCloseTo(-0.5, 3);
  });

  it('matches one-plane clipping for a short bevel profile', () => {
    expect(bevelMatchesSequential(1)).toBe(true);
    expect(bevelMatchesSequential(3)).toBe(true);
  });

  it('keeps a dense bevel closed and faster than clipping one plane at a time', () => {
    const planes = bevelPlanes(16);
    const clipped = SolidBrushPlaneClip.clipKeepInsideAll(unitBox(), planes);
    const validation = SolidBrushValidator.validate(clipped);
    expect(clipped.vertices.length).toBeGreaterThan(8);
    expect(validation.valid, validation.errors.join('; ')).toBe(true);
    warmBevelClips(planes);
    expect(timedBulk(planes)).toBeLessThan(timedSequential(planes));
  }, 60000);
});

/**
 * Returns a fresh unit box at the origin.
 *
 * @returns Centered box of size 1.
 */
function unitBox(): SolidBrush {
  return SolidBrushFactory.createCenteredBox(1, 1, 1);
}

/**
 * Collects edge bevel planes for a unit box covered by a volume.
 *
 * @param segments Profile face count.
 * @returns Clip planes in wing order.
 */
function bevelPlanes(segments: number): SolidPlane[] {
  const volume = ModifierVolumeBevel.create();
  volume.scale.set(4, 4, 4);
  ModifierVolumeBevel.writeSegments(volume, segments);
  volume.updateMatrixWorld(true);
  return planesFromVolume(unitBox(), volume);
}

/**
 * Reads the clip planes stored on tracked bevel edges.
 *
 * @param box Brush in the volume's space.
 * @param volume Bevel volume with a current world matrix.
 * @returns Planes.
 */
function planesFromVolume(box: SolidBrush, volume: THREE.Object3D): SolidPlane[] {
  const tracked = modifierBevelTrackedEdges(box, new THREE.Matrix4(), [volume]);
  const planes: SolidPlane[] = [];
  for (const edge of tracked) {
    for (const plane of edge.planes) planes.push(plane);
  }
  return planes;
}

/**
 * Returns whether bulk clipping matches clipping one plane at a time.
 *
 * @param segments Profile face count.
 * @returns True when the vertex sets agree and the solid was cut.
 */
function bevelMatchesSequential(segments: number): boolean {
  const planes = bevelPlanes(segments);
  if (planes.length === 0) return false;
  const bulk = SolidBrushPlaneClip.clipKeepInsideAll(unitBox(), planes);
  const sequential = clipOneByOne(unitBox(), planes);
  return bulk.vertices.length > 8 && pointsMatch(bulk, sequential);
}

/**
 * Clips one plane at a time, skipping a plane that would erase the solid.
 *
 * @param brush Source brush.
 * @param planes Outward clip planes.
 * @returns Clipped brush.
 */
function clipOneByOne(brush: SolidBrush, planes: readonly SolidPlane[]): SolidBrush {
  let current = brush;
  for (const plane of planes) {
    const next = SolidBrushPlaneClip.clipKeepInside(current, plane);
    if (next) current = next;
  }
  return current;
}

/**
 * Returns whether two brushes have the same vertices in any order.
 *
 * @param left First brush.
 * @param right Second brush.
 * @returns True when every vertex has one unused partner within tolerance.
 */
function pointsMatch(left: SolidBrush, right: SolidBrush): boolean {
  if (left.vertices.length !== right.vertices.length) return false;
  return verticesPair(left.vertices, right.vertices);
}

/**
 * Pairs each left vertex with one unused right vertex.
 *
 * @param left Vertices.
 * @param right Vertices.
 * @returns True when every left vertex finds a partner.
 */
function verticesPair(left: readonly THREE.Vector3[], right: readonly THREE.Vector3[]): boolean {
  const used = new Array<boolean>(right.length).fill(false);
  return left.every((point) => claimPartner(point, right, used));
}

/**
 * Marks one unused vertex that sits on the query point.
 *
 * @param point Query point.
 * @param right Candidate vertices.
 * @param used Partners already claimed.
 * @returns True when a partner was claimed.
 */
function claimPartner(point: THREE.Vector3, right: readonly THREE.Vector3[], used: boolean[]): boolean {
  const index = right.findIndex((other, partner) => !used[partner] && point.distanceToSquared(other) < 1e-8);
  if (index < 0) return false;
  used[index] = true;
  return true;
}

/**
 * Runs both clip paths once so the timed calls are past the first compile.
 *
 * @param planes Outward clip planes.
 */
function warmBevelClips(planes: readonly SolidPlane[]): void {
  SolidBrushPlaneClip.clipKeepInsideAll(unitBox(), planes);
  clipOneByOne(unitBox(), planes);
}

/**
 * Times one bulk clip of a unit box.
 *
 * @param planes Outward clip planes.
 * @returns Elapsed milliseconds.
 */
function timedBulk(planes: readonly SolidPlane[]): number {
  const box = unitBox();
  return elapsed(() => {
    SolidBrushPlaneClip.clipKeepInsideAll(box, planes);
  });
}

/**
 * Times clipping a unit box one plane at a time.
 *
 * @param planes Outward clip planes.
 * @returns Elapsed milliseconds.
 */
function timedSequential(planes: readonly SolidPlane[]): number {
  const box = unitBox();
  return elapsed(() => {
    clipOneByOne(box, planes);
  });
}

/**
 * Measures one callback.
 *
 * @param work Callback to time.
 * @returns Elapsed milliseconds.
 */
function elapsed(work: () => void): number {
  const start = performance.now();
  work();
  return performance.now() - start;
}
