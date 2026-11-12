import { generatorRevolveSectionPhase } from './generator_revolve_section.js';
import { generatorRevolveTwistUv } from './generator_revolve_surface_twist.js';
import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import type { FaceSurfaceDescription } from '@/texture/uv_matrix/face_surface_description.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import type { GeneratorRevolveFrame } from './generator_revolve_brush.js';
import { generatorRevolveWidestPerimeter, GeneratorRevolvePerimeterLayout } from './generator_revolve_perimeter.js';
import type { GeneratorRevolveStation } from './generator_revolve_profile.js';

/** Faces whose normal is this close to vertical are caps or ledges. */
export const GENERATOR_REVOLVE_CAP_NORMAL = 0.999;

/** Tolerance when matching a face ring to a profile station, in metres. */
const GENERATOR_REVOLVE_MATCH_EPSILON = 1e-4;

/** How the texture covers a revolved surface. */
export interface GeneratorRevolveWrap {
  /**
   * Stretch fits the texture once around and once bottom to top; tile repeats
   * it.
   */
  mode: 'stretch' | 'tile';
  /** Whole repeats around the axis when tiling. */
  around: number;
  /**
   * Whole repeats bottom to top when tiling, or 'density' for square tiles at
   * the widest ring.
   */
  along: number | 'density';
}

/** A profile station with the running profile length up to it. */
interface GeneratorRevolveArc extends GeneratorRevolveStation {
  /** Profile length from the bottom, in metres. */
  length: number;
}

/** Texture layout of one revolved shape, shared by all of its pieces. */
export interface GeneratorRevolveUvLayout {
  /** Texture repeats once around the axis. */
  around: number;
  /** Side count of the round sections; square faces line up with them. */
  sides: number;
  /** Texture repeats per metre of profile length. */
  alongPerMetre: number;
  /** Texture repeats per metre on caps and ledges. */
  capPerMetre: number;
  /** Stations with their running profile length. */
  arcs: readonly GeneratorRevolveArc[];
}

/**
 * Measures the running profile length of every station, vertical steps
 * included, so V flows over the whole shape without restarting per piece.
 *
 * @param stations Profile stations bottom to top, in metres.
 * @returns Stations with running lengths.
 */
function generatorRevolveArcs(stations: readonly GeneratorRevolveStation[]): GeneratorRevolveArc[] {
  let length = 0;
  return stations.map((station, index) => {
    const before = stations[index - 1];
    if (before) length += Math.hypot(station.height - before.height, station.radius - before.radius);
    return { ...station, length };
  });
}

/**
 * Builds the texture layout of a revolved shape.
 *
 * @param stations Profile stations bottom to top, in metres.
 * @param sides Side count.
 * @param wrap Wrap options.
 * @param aspect Depth relative to width.
 * @returns Layout.
 */
export function generatorRevolveUvLayout(
  stations: readonly GeneratorRevolveStation[],
  sides: number,
  wrap: GeneratorRevolveWrap,
  aspect = 1,
): GeneratorRevolveUvLayout {
  const arcs = generatorRevolveArcs(stations);
  const total = Math.max(arcs[arcs.length - 1]?.length ?? 0, 1e-6);
  const widest = Math.max(1e-6, ...stations.map((station) => station.radius));
  const perimeter = generatorRevolveWidestPerimeter(stations, sides, aspect);
  if (wrap.mode === 'stretch')
    return { around: 1, sides, alongPerMetre: 1 / total, capPerMetre: 1 / (2 * widest), arcs };
  const around = Math.max(1, Math.round(wrap.around));
  const tile = perimeter / around;
  const along = wrap.along === 'density' ? 1 / tile : Math.max(1, Math.round(wrap.along)) / total;
  return { around, sides, alongPerMetre: along, capPerMetre: 1 / tile, arcs };
}

/**
 * Builds face surfaces that wrap the texture around the sides and along the
 * profile. U runs once (or a whole number of times) around the axis, each side
 * face taking its own slice, so the seam closes; V is the running profile
 * length, continuous across pieces. Caps and ledges get a planar mapping
 * centred on the axis.
 *
 * @param brush Revolved brush in frame coordinates.
 * @param frame Revolve frame.
 * @param layout Texture layout of the whole shape.
 * @returns Surface per face; undefined keeps the default.
 */
export function generatorRevolveSurfaces(
  brush: SolidBrush,
  frame: GeneratorRevolveFrame,
  layout: GeneratorRevolveUvLayout,
): (FaceSurfaceDescription | undefined)[] {
  const perimeter = new GeneratorRevolvePerimeterLayout(frame);
  return brush.faces.map((face, index) => {
    const normal = brush.planes[index]?.normal;
    if (!normal) return undefined;
    const corners = brush.getFaceVertexIndices(face).map((corner) => brush.vertices[corner] ?? new THREE.Vector3());
    const uv =
      Math.abs(normal.y) > GENERATOR_REVOLVE_CAP_NORMAL
        ? generatorRevolveCapUv(normal, frame, layout)
        : frame.twisted
          ? generatorRevolveTwistUv(corners, frame, layout)
          : generatorRevolveSideUv(normal, corners, frame, layout, perimeter);
    return { textureId: DEFAULT_CHECKER_TEXTURE_ID, uv };
  });
}

/**
 * Builds the planar mapping of a cap or ledge, centred on the axis.
 *
 * @param normal Face normal.
 * @param frame Revolve frame.
 * @param layout Texture layout.
 * @returns UV matrix.
 */
export function generatorRevolveCapUv(
  normal: THREE.Vector3,
  frame: GeneratorRevolveFrame,
  layout: GeneratorRevolveUvLayout,
): SurfaceUvMatrix {
  const basis = SurfaceUvMatrix.fromTrs(new THREE.Vector2(), normal, 0, 1, 1);
  const row = (axis: THREE.Vector4): THREE.Vector4 => {
    const direction = new THREE.Vector3(axis.x, axis.y, axis.z).multiplyScalar(layout.capPerMetre);
    return new THREE.Vector4(direction.x, direction.y, direction.z, 0.5 - direction.dot(frame.center));
  };
  return new SurfaceUvMatrix(row(basis.u), row(basis.v));
}

/** A side face measured against the axis. */
interface GeneratorRevolveSide {
  /** Horizontal direction U runs along, around the axis. */
  tangent: THREE.Vector3;
  /** In-plane direction up the profile. */
  up: THREE.Vector3;
  /** Midpoint of the lower edge. */
  bottom: THREE.Vector3;
  /** Midpoint of the upper edge. */
  top: THREE.Vector3;
  /** Lower ring station. */
  lower: GeneratorRevolveStation;
  /** Upper ring station. */
  upper: GeneratorRevolveStation;
}

/**
 * Measures a side face: its directions, edge midpoints and ring stations.
 *
 * @param normal Outward face normal.
 * @param corners Face corners.
 * @param perimeter Measured cross-section and axis base.
 * @param edgeWidth Width of the face's unit-ring edge.
 * @returns Side measurements.
 */
function generatorRevolveSideMeasure(
  normal: THREE.Vector3,
  corners: readonly THREE.Vector3[],
  perimeter: GeneratorRevolvePerimeterLayout,
  edgeWidth: number,
): GeneratorRevolveSide {
  const tangent = new THREE.Vector3(0, 1, 0).cross(normal).normalize();
  const up = new THREE.Vector3().crossVectors(normal, tangent).normalize();
  const heights = corners.map((corner) => corner.y);
  const edge = (height: number) =>
    corners.filter((corner) => Math.abs(corner.y - height) < GENERATOR_REVOLVE_MATCH_EPSILON);
  const lowerEdge = edge(Math.min(...heights));
  const upperEdge = edge(Math.max(...heights));
  const lower = perimeter.stationOf(lowerEdge, edgeWidth);
  const upper = perimeter.stationOf(upperEdge, edgeWidth);
  return {
    tangent,
    up,
    bottom: generatorRevolveMiddle(lowerEdge),
    top: generatorRevolveMiddle(upperEdge),
    lower,
    upper,
  };
}

/**
 * Returns the average of points.
 *
 * @param points Points.
 * @returns Midpoint.
 */
function generatorRevolveMiddle(points: readonly THREE.Vector3[]): THREE.Vector3 {
  return points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(Math.max(1, points.length));
}

/**
 * Builds the UV matrix of one side face. U is exact at the face's mid height:
 * the face covers its measured share of the actual ring perimeter there. V runs
 * the profile length from the lower to the upper ring.
 *
 * @param normal Outward face normal.
 * @param corners Face corners.
 * @param frame Revolve frame.
 * @param layout Texture layout.
 * @param perimeter Measured cross-section and axis base.
 * @returns UV matrix.
 */
function generatorRevolveSideUv(
  normal: THREE.Vector3,
  corners: readonly THREE.Vector3[],
  frame: GeneratorRevolveFrame,
  layout: GeneratorRevolveUvLayout,
  perimeter: GeneratorRevolvePerimeterLayout,
): SurfaceUvMatrix {
  const edge = perimeter.edgeOfFace(normal, corners);
  const side = generatorRevolveSideMeasure(normal, corners, perimeter, edge.width);
  const width = (edge.width * (side.lower.radius + side.upper.radius)) / 2;
  const scaleU = (edge.share * layout.around) / Math.max(width, 1e-6);
  const phase = generatorRevolveSectionPhase(frame, layout.sides);
  const centreU = (edge.centre + phase) * layout.around;
  const u = side.tangent.clone().multiplyScalar(scaleU);
  const lowerV = generatorRevolveArcLength(layout.arcs, side.lower) * layout.alongPerMetre;
  const upperV = generatorRevolveArcLength(layout.arcs, side.upper) * layout.alongPerMetre;
  const rise = Math.max(side.up.dot(side.top) - side.up.dot(side.bottom), 1e-6);
  const v = side.up.clone().multiplyScalar((upperV - lowerV) / rise);
  return new SurfaceUvMatrix(
    new THREE.Vector4(u.x, u.y, u.z, centreU - u.dot(side.bottom.clone().add(side.top).multiplyScalar(0.5))),
    new THREE.Vector4(v.x, v.y, v.z, lowerV - v.dot(side.bottom)),
  );
}

/**
 * Returns the running profile length at a ring, matching it to the station of
 * the same height with the nearest radius, or to the nearest station.
 *
 * @param arcs Stations with running lengths.
 * @param ring Ring station.
 * @returns Profile length in metres.
 */
function generatorRevolveArcLength(arcs: readonly GeneratorRevolveArc[], ring: GeneratorRevolveStation): number {
  const level = arcs.filter((arc) => Math.abs(arc.height - ring.height) < GENERATOR_REVOLVE_MATCH_EPSILON);
  let best = arcs[0];
  let bestDistance = Infinity;
  for (const arc of level.length > 0 ? level : arcs) {
    const distance = Math.hypot(arc.height - ring.height, arc.radius - ring.radius);
    if (distance < bestDistance - GENERATOR_REVOLVE_MATCH_EPSILON) [best, bestDistance] = [arc, distance];
  }
  return best?.length ?? 0;
}

/**
 * Returns whether the piece starting at a height is square: the station at that
 * height whose piece rises from it decides.
 *
 * @param stations Profile stations bottom to top, in metres.
 * @param height Bottom of the piece above the axis base.
 * @returns True for a square piece.
 */
export function generatorRevolveSquareAt(stations: readonly GeneratorRevolveStation[], height: number): boolean {
  return !!generatorRevolveStationAt(stations, height)?.square;
}

/**
 * Returns the station starting a rising piece at a height.
 *
 * @param stations Profile stations.
 * @param height Piece bottom height.
 * @returns Starting station.
 */
export function generatorRevolveStationAt(
  stations: readonly GeneratorRevolveStation[],
  height: number,
): GeneratorRevolveStation | undefined {
  const index = stations.findIndex(
    (station, at) =>
      Math.abs(station.height - height) < GENERATOR_REVOLVE_MATCH_EPSILON &&
      (stations[at + 1]?.height ?? -Infinity) > height + GENERATOR_REVOLVE_MATCH_EPSILON,
  );
  return stations[index];
}
