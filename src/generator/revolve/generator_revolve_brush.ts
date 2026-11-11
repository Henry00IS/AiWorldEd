import type { CurveSegmentSection } from '@/curve/model/curve_model.js';
import { solidHullBrushFromPoints } from '@/solid/algorithm/surface/solid_hull_brush.js';
import {
  generatorRevolveSectionPoint,
  generatorRevolveSectionSides,
  generatorRevolveOutlineSimplify,
} from './generator_revolve_section.js';
import { generatorRevolveLoopsWeld } from './generator_revolve_weld.js';
import { generatorRevolveCrossBrushes } from './generator_revolve_cross.js';
import { generatorRevolveSidedRing } from './generator_revolve_side_ring.js';
import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { modifierStackConvexFromLoops } from '@/modifier/stack/kinds/generator/modifier_stack_generator_shapes.js';
import { GENERATOR_REVOLVE_EPSILON, type GeneratorRevolveStation } from './generator_revolve_profile.js';

/** Where and how finely a profile is revolved. */
export interface GeneratorRevolveFrame {
  /** Point on the axis at height zero; the axis points up (+Y). */
  center: THREE.Vector3;
  /** Side count of every ring. */
  sides: number;
  /** Ring corner distance per unit of station radius; 1 when absent. */
  radiusScale?: number;
  /** Depth divided by width. */
  aspect?: number;
  /** Section outline before aspect scaling and rotation. */
  section?: CurveSegmentSection;
  /** Number of true polygon corners. */
  polygonSides?: number;
  /** Cross arm or bar thickness as a fraction of the section width. */
  armWidth?: number;
  /** Stadium flat side length as a fraction of the section width. */
  straight?: number;
  /** Square or polygon corner size as a fraction of half a side. */
  cornerSize?: number;
  /** Faces across each cut corner. */
  cornerSides?: number;
  /** Accumulated rotation of the first ring, in degrees. */
  rotation?: number;
  /** True when this band changes rotation. */
  twisted?: boolean;
  /**
   * True when the run's sides follow their own extents or its depth is fixed,
   * so rings are shifted or stretched rather than scaled copies.
   */
  sided?: boolean;
}

/**
 * Returns the rotation of a section: shaped or twisted sections follow the
 * accumulated angle, untwisted Round sections only their own rotation.
 *
 * @param station Starting station of the run.
 * @returns Rotation in degrees.
 */
function generatorRevolveSectionRotation(station: GeneratorRevolveStation): number {
  const shaped =
    station.square ||
    station.polygonSides ||
    station.crossArm ||
    station.barThickness ||
    station.stadiumStraight ||
    station.twisted;
  return shaped ? (station.angle ?? 0) : (station.rotation ?? 0);
}

/**
 * Derives one section frame with its own outline resolution and accumulated
 * rotation. Untwisted Round sections ignore twist below them and turn only by
 * their own segment rotation.
 *
 * @param frame Round frame.
 * @param section Starting station of the run, or true for a square.
 * @returns Frame of the run.
 */
export function generatorRevolveSectionFrame(
  frame: GeneratorRevolveFrame,
  section: boolean | GeneratorRevolveStation,
): GeneratorRevolveFrame {
  const station = typeof section === 'boolean' ? { height: 0, radius: 1, square: section } : section;
  return {
    ...frame,
    sides: generatorRevolveSectionSides(station, frame.sides),
    rotation: generatorRevolveSectionRotation(station),
    twisted: !!station.twisted,
    ...(station.square ? { section: 'square' } : {}),
    ...(station.polygonSides ? { section: 'polygon', polygonSides: station.polygonSides } : {}),
    ...(station.crossArm ? { section: 'cross', armWidth: station.crossArm } : {}),
    ...(station.barThickness ? { section: 'bar', armWidth: station.barThickness } : {}),
    ...(station.stadiumStraight ? { section: 'stadium', straight: station.stadiumStraight } : {}),
    ...(station.cornerSize ? { cornerSize: station.cornerSize, cornerSides: station.cornerSides ?? 1 } : {}),
    ...(station.side || station.fixedDepth ? { sided: true } : {}),
  };
}

/**
 * Returns whether a station closes to a point: it has no width, unless it is a
 * fixed-depth square or stadium, whose zero-width ring is a ridge line.
 *
 * @param frame Section frame.
 * @param station Station.
 * @returns True for an apex point.
 */
function generatorRevolveRingIsPoint(frame: GeneratorRevolveFrame, station: GeneratorRevolveStation): boolean {
  if (station.radius > GENERATOR_REVOLVE_EPSILON) return false;
  const ridge = frame.section === 'square' || frame.section === 'stadium';
  return !(ridge && frame.sided && (station.depthRadius ?? 0) > GENERATOR_REVOLVE_EPSILON);
}

/**
 * Builds the regular ring of one station, or its apex when the radius is zero.
 * Sided stations shift or stretch the outline instead of scaling it, and rings
 * of a tapered bar use their own thickness.
 *
 * @param frame Revolve frame.
 * @param station Station in world units.
 * @returns Ring points, or one point for an apex.
 */
export function generatorRevolveRing(frame: GeneratorRevolveFrame, station: GeneratorRevolveStation): THREE.Vector3[] {
  const ring = frame.section === 'bar' ? station.barRing : undefined;
  return generatorRevolveRingShaped(ring === undefined ? frame : { ...frame, armWidth: ring }, station);
}

/**
 * Builds a ring with the frame's own section outline.
 *
 * @param frame Section frame, with the ring's own bar thickness.
 * @param station Station.
 * @returns Ring points, or one point at an apex.
 */
function generatorRevolveRingShaped(frame: GeneratorRevolveFrame, station: GeneratorRevolveStation): THREE.Vector3[] {
  const y = frame.center.y + station.height;
  if (generatorRevolveRingIsPoint(frame, station)) return [new THREE.Vector3(frame.center.x, y, frame.center.z)];
  if (station.offset !== undefined || station.depthRadius !== undefined)
    return generatorRevolveSidedRing(frame, station);
  const radius = station.radius * (frame.radiusScale ?? 1);
  return Array.from({ length: frame.sides }, (_, index) => {
    const point = generatorRevolveSectionPoint(frame, index).multiplyScalar(radius);
    const vertex = new THREE.Vector3(point.x, 0, point.y * (frame.aspect ?? 1));
    const rotates = frame.twisted || (frame.section !== undefined && frame.section !== 'round');
    const angle = rotates ? (station.angle ?? frame.rotation ?? 0) : (frame.rotation ?? 0);
    vertex.applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(angle));
    return vertex.add(new THREE.Vector3(frame.center.x, y, frame.center.z));
  });
}

/**
 * Builds the faces joining two rings: quads, or triangles toward an apex.
 *
 * @param lower Lower ring.
 * @param upper Upper ring.
 * @returns Side loops.
 */
function generatorRevolveBand(lower: readonly THREE.Vector3[], upper: readonly THREE.Vector3[]): THREE.Vector3[][] {
  const count = Math.max(lower.length, upper.length);
  const pick = (ring: readonly THREE.Vector3[], index: number) => ring[ring.length === 1 ? 0 : index % ring.length];
  const loops: THREE.Vector3[][] = [];
  for (let index = 0; index < count; index++) {
    const corners = [pick(lower, index), pick(lower, index + 1), pick(upper, index + 1), pick(upper, index)];
    const unique = corners.filter((corner, at): corner is THREE.Vector3 => !!corner && corners.indexOf(corner) === at);
    if (unique.length >= 3) loops.push(...generatorRevolvePlanarLoops(unique));
  }
  return loops;
}

/**
 * Marks the ring indices that are true outline corners, the same for every ring
 * of a frame, so extra samples along straight sides add no faces.
 *
 * @param frame Section frame.
 * @returns Per ring index, whether it is kept.
 */
function generatorRevolveRingCorners(frame: GeneratorRevolveFrame): boolean[] {
  const unit = generatorRevolveRing({ ...frame, center: new THREE.Vector3() }, { height: 0, radius: 1 });
  const kept = new Set(generatorRevolveOutlineSimplify(unit));
  return unit.map((point) => kept.has(point));
}

/**
 * Builds one convex brush from a run of stations: the bottom and top caps
 * (unless they are apexes) and one band per piece.
 *
 * @param frame Revolve frame.
 * @param run Stations in world units, bottom to top.
 * @returns Brush, or null when the run encloses no valid solid.
 */
export function generatorRevolveRunBrush(
  frame: GeneratorRevolveFrame,
  run: readonly GeneratorRevolveStation[],
): SolidBrush | null {
  const corners = generatorRevolveRingCorners(frame);
  const rings = run
    .map((station) => generatorRevolveRing(frame, station))
    .map((ring) => (ring.length > 1 ? ring.filter((_, index) => corners[index]) : ring));
  const bottom = rings[0];
  const top = rings[rings.length - 1];
  if (!bottom || !top || rings.length < 2) return null;
  const caps = [bottom, top].filter((ring) => ring.length > 1);
  const bands = rings.slice(1).flatMap((ring, index) => generatorRevolveBand(rings[index] ?? ring, ring));
  const flat =
    frame.section === 'bar' ||
    ((frame.section === 'square' || frame.section === 'polygon') && (frame.cornerSides ?? 1) === 1);
  const hull = frame.twisted || flat;
  const brush = hull
    ? solidHullBrushFromPoints(rings.flatMap(generatorRevolveOutlineSimplify))
    : modifierStackConvexFromLoops(generatorRevolveLoopsWeld([...caps, ...bands]));
  return brush && SolidBrushValidator.validateGenerated(brush).valid ? brush : null;
}

/**
 * Builds the brushes of every run. A merged run that fails validation falls
 * back to one brush per piece.
 *
 * @param frame Revolve frame.
 * @param runs Runs in world units.
 * @returns Valid convex brushes, bottom to top.
 */
export function generatorRevolveBrushes(
  frame: GeneratorRevolveFrame,
  runs: readonly (readonly GeneratorRevolveStation[])[],
): SolidBrush[] {
  return runs.flatMap((run) => {
    const section = generatorRevolveSectionFrame(frame, run[0] ?? false);
    const merged = generatorRevolveRunPieces(section, run);
    if (merged || run.length <= 2) return merged ?? [];
    return run
      .slice(1)
      .flatMap((station, index) => generatorRevolveRunPieces(section, [run[index] ?? station, station]) ?? []);
  });
}

/**
 * Builds the convex pieces of one run: one brush, or five for a cross.
 *
 * @param frame Section frame of the run.
 * @param run Stations in world units, bottom to top.
 * @returns Valid pieces, or null when the run encloses no valid solid.
 */
function generatorRevolveRunPieces(
  frame: GeneratorRevolveFrame,
  run: readonly GeneratorRevolveStation[],
): SolidBrush[] | null {
  if (frame.section === 'cross')
    return run.length < 2
      ? null
      : generatorRevolveCrossBrushes(run.map((station) => generatorRevolveRing(frame, station)));
  const brush = generatorRevolveRunBrush(frame, run);
  return brush ? [brush] : null;
}

/**
 * Splits a twisted quad so each resulting face lies on a plane.
 *
 * @param corners Unique face corners in winding order.
 * @returns Planar face loops.
 */
function generatorRevolvePlanarLoops(corners: THREE.Vector3[]): THREE.Vector3[][] {
  const [a, b, c, d] = corners;
  if (!a || !b || !c || !d) return [corners];
  const normal = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
  return Math.abs(normal.dot(d.clone().sub(a))) <= GENERATOR_REVOLVE_EPSILON
    ? [corners]
    : [
        [a, b, c],
        [a, c, d],
      ];
}
