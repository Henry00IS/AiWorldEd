import * as THREE from 'three';
import { CURVE_STADIUM_STRAIGHT_DEFAULT } from '@/curve/model/curve_section.js';
import type { GeneratorRevolveFrame } from './generator_revolve_brush.js';
import type { GeneratorRevolveStation } from './generator_revolve_profile.js';
import { generatorRevolveSectionPoint } from './generator_revolve_section.js';

/**
 * Builds the ring of a sided station: the section outline at half its width,
 * shifted along its own X axis so its +X and -X sides reach their own extents,
 * with the depth of `depthRadius` when the piece keeps a fixed depth.
 *
 * @param frame Section frame.
 * @param station Station with offset or depth.
 * @returns Ring points.
 */
export function generatorRevolveSidedRing(
  frame: GeneratorRevolveFrame,
  station: GeneratorRevolveStation,
): THREE.Vector3[] {
  const scale = frame.radiusScale ?? 1;
  const width = station.radius * scale;
  const depth = (station.depthRadius ?? station.radius) * scale;
  const offset = (station.offset ?? 0) * scale;
  const angle = THREE.MathUtils.degToRad(station.angle ?? frame.rotation ?? 0);
  const base = new THREE.Vector3(frame.center.x, frame.center.y + station.height, frame.center.z);
  return Array.from({ length: frame.sides }, (_, index) => {
    const point = generatorRevolveSidedPoint(frame, index, width, depth);
    const vertex = new THREE.Vector3(point.x + offset, 0, point.y);
    return vertex.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle).add(base);
  });
}

/**
 * Places one outline point of a sided section before its shift and rotation.
 * Bars keep their own thickness; squares take the fixed depth; stadium ends
 * keep the round shape of that depth while the flat sides take up the rest of
 * the width.
 *
 * @param frame Section frame.
 * @param index Ring index.
 * @param width Half-width.
 * @param depth Half-width whose depth the section uses.
 * @returns Point with x across and y the depth direction.
 */
function generatorRevolveSidedPoint(
  frame: GeneratorRevolveFrame,
  index: number,
  width: number,
  depth: number,
): THREE.Vector2 {
  const unit = generatorRevolveSectionPoint(frame, index);
  const aspect = frame.aspect ?? 1;
  if (frame.section === 'stadium') return generatorRevolveSidedStadiumPoint(frame, index, unit, width, depth);
  if (frame.section === 'bar') return new THREE.Vector2(unit.x * width, unit.y * width * aspect);
  return new THREE.Vector2(unit.x * width, unit.y * depth * aspect);
}

/**
 * Places one stadium outline point: each end is a half circle of the depth's
 * end radius around its own centre, never wider than the half-width.
 *
 * @param frame Stadium frame.
 * @param index Ring index; the first half of the ring is the +X end.
 * @param unit Unit outline point.
 * @param width Half-width.
 * @param depth Half-width whose depth the section uses.
 * @returns Point with x across and y the depth direction.
 */
function generatorRevolveSidedStadiumPoint(
  frame: GeneratorRevolveFrame,
  index: number,
  unit: THREE.Vector2,
  width: number,
  depth: number,
): THREE.Vector2 {
  const straight = frame.straight ?? CURVE_STADIUM_STRAIGHT_DEFAULT;
  const end = 1 - straight;
  const sign = index < frame.sides / 2 ? 1 : -1;
  const across = Math.min(end * depth, width);
  const cos = (unit.x - sign * straight) / end;
  const sin = unit.y / end;
  return new THREE.Vector2(sign * (width - across) + across * cos, end * depth * (frame.aspect ?? 1) * sin);
}
