import type * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { solidHullBrushFromPoints } from '@/solid/algorithm/surface/solid_hull_brush.js';
import {
  generatorRevolveBrushes,
  generatorRevolveSectionFrame,
  type GeneratorRevolveFrame,
} from './generator_revolve_brush.js';
import {
  GENERATOR_REVOLVE_EPSILON,
  generatorRevolveRuns,
  type GeneratorRevolveStation,
} from './generator_revolve_profile.js';
import {
  generatorRevolveBlendShapeMix,
  generatorRevolveBlendShapeOf,
  generatorRevolveBlendShapeScale,
  type GeneratorRevolveBlendShape,
} from './generator_revolve_blend_shape.js';
import {
  generatorRevolveBlendCrossDirection,
  generatorRevolveBlendCrossPiece,
} from './generator_revolve_blend_cross.js';

/** The stations of one curve segment and the ends where it morphs. */
interface GeneratorRevolveBlendGroup {
  /** Curve segment index. */
  segment: number;
  /** Index of the segment's first station. */
  first: number;
  /** Index of the segment's last station. */
  last: number;
  /** True when it morphs from the section below. */
  start: boolean;
  /** True when it morphs into the section above. */
  end: boolean;
}

/** A profile with its stations and segment groups, shared by one build. */
interface GeneratorRevolveBlendProfile {
  /** Round frame of the whole shape. */
  frame: GeneratorRevolveFrame;
  /** Stations bottom to top. */
  stations: readonly GeneratorRevolveStation[];
  /** Segment groups bottom to top. */
  groups: readonly GeneratorRevolveBlendGroup[];
}

/**
 * Builds the convex brushes of a whole profile. Segments that blend become the
 * convex hulls between their neighbour's outline and their own, one brush per
 * piece and convex part; everything else builds as before, so profiles without
 * blending come out exactly as they always did.
 *
 * @param frame Round frame.
 * @param stations Stations bottom to top, in world units.
 * @returns Valid convex brushes, bottom to top.
 */
export function generatorRevolveProfileBrushes(
  frame: GeneratorRevolveFrame,
  stations: readonly GeneratorRevolveStation[],
): SolidBrush[] {
  const groups = generatorRevolveBlendGroups(stations);
  const morphing = groups.filter((group) => group.start || group.end);
  if (morphing.length === 0) return generatorRevolveBrushes(frame, generatorRevolveRuns(stations));
  const profile = { frame, stations, groups };
  const brushes: SolidBrush[] = [];
  let cursor = 0;
  for (const group of morphing) {
    brushes.push(...generatorRevolveBlendPlain(frame, stations.slice(cursor, group.first + 1)));
    brushes.push(...generatorRevolveBlendGroupBrushes(profile, group));
    cursor = group.last;
  }
  return [...brushes, ...generatorRevolveBlendPlain(frame, stations.slice(cursor))];
}

/**
 * Builds stations that do not morph the usual way.
 *
 * @param frame Round frame.
 * @param stations Consecutive stations.
 * @returns Brushes.
 */
function generatorRevolveBlendPlain(
  frame: GeneratorRevolveFrame,
  stations: readonly GeneratorRevolveStation[],
): SolidBrush[] {
  return stations.length < 2 ? [] : generatorRevolveBrushes(frame, generatorRevolveRuns(stations));
}

/**
 * Groups the pieces of each curve segment. Pieces of no segment, such as the
 * repeated ring of a rotated joint, belong to no group.
 *
 * @param stations Stations bottom to top.
 * @returns Groups bottom to top.
 */
function generatorRevolveBlendGroups(stations: readonly GeneratorRevolveStation[]): GeneratorRevolveBlendGroup[] {
  const groups: GeneratorRevolveBlendGroup[] = [];
  stations.slice(0, -1).forEach((station, index) => {
    if (station.segment === undefined) return;
    const current = groups[groups.length - 1];
    if (current?.segment === station.segment) current.last = index + 1;
    else
      groups.push({
        segment: station.segment,
        first: index,
        last: index + 1,
        start: !!station.blendStart,
        end: !!station.blendEnd,
      });
  });
  return groups;
}

/**
 * Builds a morphing segment: each piece is the convex hull of the mixed
 * outlines at its two stations, split into wedges when a cross takes part.
 *
 * @param profile Profile.
 * @param group Morphing segment.
 * @returns Valid brushes, bottom to top.
 */
function generatorRevolveBlendGroupBrushes(
  profile: GeneratorRevolveBlendProfile,
  group: GeneratorRevolveBlendGroup,
): SolidBrush[] {
  const shapes = generatorRevolveBlendGroupShapes(profile, group);
  const directions = generatorRevolveBlendGroupDirections(profile, group);
  return shapes.slice(1).flatMap((upper, index) => {
    const lower = shapes[index] ?? upper;
    if (upper.length === 1) return generatorRevolveBlendHull([...(lower[0] ?? []), ...(upper[0] ?? [])]);
    const direction = generatorRevolveBlendAverage(directions[index], directions[index + 1]);
    return direction ? generatorRevolveBlendCrossPiece(lower, upper, direction, profile.frame.center) : [];
  });
}

/**
 * Builds the valid convex hull of points.
 *
 * @param points Points.
 * @returns The brush, or nothing when the points enclose no valid solid.
 */
function generatorRevolveBlendHull(points: readonly THREE.Vector3[]): SolidBrush[] {
  const brush = solidHullBrushFromPoints(points);
  return brush && SolidBrushValidator.validateGenerated(brush).valid ? [brush] : [];
}

/**
 * Returns the direction of the cross's first bar at every station of a morphing
 * segment: from the segment itself when it is a cross, else from the cross it
 * meets.
 *
 * @param profile Profile.
 * @param group Morphing segment.
 * @returns Direction per station; null where no cross takes part.
 */
function generatorRevolveBlendGroupDirections(
  profile: GeneratorRevolveBlendProfile,
  group: GeneratorRevolveBlendGroup,
): (THREE.Vector3 | null)[] {
  const { frame, stations, groups } = profile;
  const own = generatorRevolveSectionFrame(frame, stations[group.first] ?? false);
  const range = stations.slice(group.first, group.last + 1);
  if (own.section === 'cross') return range.map((station) => generatorRevolveBlendCrossDirection(own, station));
  const neighbours = [
    { other: groups.find((each) => each.segment === group.segment - 1), at: 'last' as const },
    { other: groups.find((each) => each.segment === group.segment + 1), at: 'first' as const },
  ];
  for (const { other, at } of neighbours) {
    const station = other ? stations[other[at]] : undefined;
    const section = generatorRevolveSectionFrame(frame, (other && stations[other.first]) ?? false);
    const direction =
      station && section.section === 'cross' ? generatorRevolveBlendCrossDirection(section, station) : null;
    if (direction) return range.map(() => direction);
  }
  return range.map(() => null);
}

/**
 * Returns the normalized average of two directions, or whichever exists.
 *
 * @param first First direction.
 * @param second Second direction.
 * @returns Average direction, or null when neither exists.
 */
function generatorRevolveBlendAverage(
  first: THREE.Vector3 | null | undefined,
  second: THREE.Vector3 | null | undefined,
): THREE.Vector3 | null {
  if (!first || !second) return first ?? second ?? null;
  const sum = first.clone().add(second.dot(first) < 0 ? second.clone().negate() : second);
  return sum.lengthSq() > 1e-18 ? sum.normalize() : first.clone();
}

/**
 * Returns the mixed outline at every station of a morphing segment: from the
 * bottom joint's outline to the top joint's, each following the profile, with
 * the segment's own outline at an end that does not morph.
 *
 * @param profile Profile.
 * @param group Morphing segment.
 * @returns Shape per station, bottom to top.
 */
function generatorRevolveBlendGroupShapes(
  profile: GeneratorRevolveBlendProfile,
  group: GeneratorRevolveBlendGroup,
): GeneratorRevolveBlendShape[] {
  const { frame, stations } = profile;
  const own = generatorRevolveSectionFrame(frame, stations[group.first] ?? false);
  const bottom = group.start ? generatorRevolveBlendJoint(profile, group, 'start') : null;
  const top = group.end ? generatorRevolveBlendJoint(profile, group, 'end') : null;
  const first = stations[group.first];
  const last = stations[group.last];
  if (!first || !last) return [];
  const rise = Math.max(last.height - first.height, GENERATOR_REVOLVE_EPSILON);
  return stations.slice(group.first, group.last + 1).map((station) => {
    const y = frame.center.y + station.height;
    const ownShape = generatorRevolveBlendShapeOf(own, station);
    const lower = bottom ? generatorRevolveBlendFollow(bottom, first, station, frame) : ownShape;
    const upper = top ? generatorRevolveBlendFollow(top, last, station, frame) : ownShape;
    return generatorRevolveBlendShapeMix(lower, upper, (station.height - first.height) / rise, frame.center, y);
  });
}

/**
 * Scales a joint outline from its joint to another station of the segment, in
 * proportion to the profile radius.
 *
 * @param shape Joint outline.
 * @param joint Joint station.
 * @param station Target station.
 * @param frame Round frame.
 * @returns Outline at the target station.
 */
function generatorRevolveBlendFollow(
  shape: GeneratorRevolveBlendShape,
  joint: GeneratorRevolveStation,
  station: GeneratorRevolveStation,
  frame: GeneratorRevolveFrame,
): GeneratorRevolveBlendShape {
  const factor = joint.radius > GENERATOR_REVOLVE_EPSILON ? station.radius / joint.radius : 1;
  return generatorRevolveBlendShapeScale(shape, frame.center, factor, frame.center.y + station.height);
}

/**
 * Returns the outline a morphing segment meets at one end: the neighbour's own
 * outline there, or halfway between both when the neighbour morphs too.
 *
 * @param profile Profile.
 * @param group Morphing segment.
 * @param side Which end.
 * @returns Joint outline, or null when no neighbour joins there.
 */
function generatorRevolveBlendJoint(
  profile: GeneratorRevolveBlendProfile,
  group: GeneratorRevolveBlendGroup,
  side: 'start' | 'end',
): GeneratorRevolveBlendShape | null {
  const { frame, stations, groups } = profile;
  const neighbour = groups.find((other) => other.segment === group.segment + (side === 'start' ? -1 : 1));
  if (!neighbour) return null;
  const other = generatorRevolveSectionFrame(frame, stations[neighbour.first] ?? false);
  const own = generatorRevolveSectionFrame(frame, stations[group.first] ?? false);
  const theirs = stations[side === 'start' ? neighbour.last : neighbour.first];
  const mine = stations[side === 'start' ? group.first : group.last];
  if (!theirs || !mine) return null;
  const outline = generatorRevolveBlendShapeOf(other, theirs);
  const meets = side === 'start' ? neighbour.end : neighbour.start;
  if (!meets) return outline;
  const y = frame.center.y + mine.height;
  return generatorRevolveBlendShapeMix(outline, generatorRevolveBlendShapeOf(own, mine), 0.5, frame.center, y);
}
