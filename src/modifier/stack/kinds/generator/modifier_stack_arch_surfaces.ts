import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import type { FaceSurfaceDescription } from '@/texture/uv_matrix/face_surface_description.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';

/** Inner curve of an arch in profile coordinates. */
export interface ModifierStackArchCurve {
  radiusSpan: number;
  radiusRise: number;
  segments: number;
  sweep: number;
  /** Angle of the first segment boundary in degrees; 0 is the right springing. */
  start: number;
}

/**
 * Where an arch's pieces sit: its box, span axis and the curves its faces
 * follow.
 */
export interface ModifierStackArchFrame {
  /** Volume box in frame coordinates. */
  box: THREE.Box3;
  /** 'x' or 'z'. */
  spanAxis: string;
  /** Inner curve. */
  curve: ModifierStackArchCurve;
  /** Radius offsets of the curved faces, such as 0 and the ring thickness. */
  grows: readonly number[];
}

/** Tolerance when matching a face corner to a curve point, in metres. */
const MODIFIER_STACK_ARCH_MATCH_EPSILON = 1e-5;

/** Faces whose normal is this close to the depth axis are fronts or backs. */
const MODIFIER_STACK_ARCH_FRONT_NORMAL = 0.999;

/** World up. */
const MODIFIER_STACK_ARCH_UP = new THREE.Vector3(0, 1, 0);

/**
 * Returns one point of an elliptical arch curve.
 *
 * @param curve Inner curve.
 * @param grow Extra radius added to both semi-axes.
 * @param index Segment boundary index.
 * @param floor Springing height.
 * @returns Profile point: span offset from the box centre, and height.
 */
export function modifierStackArchCurvePoint(
  curve: ModifierStackArchCurve,
  grow: number,
  index: number,
  floor: number,
): THREE.Vector2 {
  const angle = ((curve.start + (curve.sweep * index) / curve.segments) * Math.PI) / 180;
  return new THREE.Vector2(
    Math.cos(angle) * (curve.radiusSpan + grow),
    floor + Math.sin(angle) * (curve.radiusRise + grow),
  );
}

/**
 * Builds face surfaces of an arch piece: fronts and backs share one planar
 * projection so pieces line up; faces on a curve run U along the curve's
 * running length and V through the depth, continuous from piece to piece; other
 * faces get a world-anchored planar mapping. One texture repeat per metre
 * everywhere.
 *
 * @param piece Piece in frame coordinates.
 * @param frame Arch frame.
 * @returns Surface per face.
 */
export function modifierStackArchSurfaces(piece: SolidBrush, frame: ModifierStackArchFrame): FaceSurfaceDescription[] {
  const depth = modifierStackArchAxis(frame.spanAxis === 'z' ? 'x' : 'z');
  return piece.faces.map((face, index) => {
    const normal = piece.planes[index]?.normal ?? MODIFIER_STACK_ARCH_UP;
    const corners = piece.getFaceVertexIndices(face).map((corner) => piece.vertices[corner] ?? new THREE.Vector3());
    const uv =
      Math.abs(normal.dot(depth)) > MODIFIER_STACK_ARCH_FRONT_NORMAL
        ? modifierStackArchFrontUv(normal, frame.box)
        : (modifierStackArchCurveUv(normal, corners, frame, depth) ??
          SurfaceUvMatrix.fromTrs(new THREE.Vector2(), normal, 0, 1, 1));
    return { textureId: DEFAULT_CHECKER_TEXTURE_ID, uv };
  });
}

/**
 * Returns a unit axis.
 *
 * @param axis 'x' or 'z'.
 * @returns Axis vector.
 */
function modifierStackArchAxis(axis: string): THREE.Vector3 {
  return axis === 'z' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
}

/**
 * Builds the planar mapping shared by every front (or back) face: U across the
 * span from the box centre, V up from the floor, never mirrored.
 *
 * @param normal Face normal.
 * @param box Volume box.
 * @returns UV matrix.
 */
function modifierStackArchFrontUv(normal: THREE.Vector3, box: THREE.Box3): SurfaceUvMatrix {
  const across = new THREE.Vector3().crossVectors(MODIFIER_STACK_ARCH_UP, normal).normalize();
  const centre = box.getCenter(new THREE.Vector3());
  return new SurfaceUvMatrix(
    new THREE.Vector4(across.x, across.y, across.z, -across.dot(centre)),
    new THREE.Vector4(0, 1, 0, -box.min.y),
  );
}

/**
 * Builds the mapping of a face lying on one of the arch curves, or returns null
 * when the face follows no curve.
 *
 * @param normal Face normal.
 * @param corners Face corners.
 * @param frame Arch frame.
 * @param depth Depth axis.
 * @returns UV matrix, or null.
 */
function modifierStackArchCurveUv(
  normal: THREE.Vector3,
  corners: readonly THREE.Vector3[],
  frame: ModifierStackArchFrame,
  depth: THREE.Vector3,
): SurfaceUvMatrix | null {
  const match = modifierStackArchCurveMatch(corners, frame);
  if (!match) return null;
  const span = modifierStackArchAxis(frame.spanAxis);
  const centre = frame.box.getCenter(new THREE.Vector3());
  const toWorld = (point: THREE.Vector2) =>
    span
      .clone()
      .multiplyScalar(point.x)
      .addScaledVector(MODIFIER_STACK_ARCH_UP, point.y)
      .add(span.clone().multiplyScalar(span.dot(centre)));
  const along = match.to.clone().sub(match.from).normalize();
  const direction = span.clone().multiplyScalar(along.x).addScaledVector(MODIFIER_STACK_ARCH_UP, along.y);
  const through =
    new THREE.Vector3().crossVectors(normal, direction).dot(depth) >= 0 ? depth.clone() : depth.clone().negate();
  const start = toWorld(match.from);
  const near = Math.min(through.dot(frame.box.min), through.dot(frame.box.max));
  return new SurfaceUvMatrix(
    new THREE.Vector4(direction.x, direction.y, direction.z, match.length - direction.dot(start)),
    new THREE.Vector4(through.x, through.y, through.z, -near),
  );
}

/** A curve segment a face lies on, with the running curve length at its start. */
interface ModifierStackArchMatch {
  from: THREE.Vector2;
  to: THREE.Vector2;
  length: number;
}

/**
 * Finds the curve segment whose two points are corners of a face.
 *
 * @param corners Face corners in frame coordinates.
 * @param frame Arch frame.
 * @returns Segment and its running length, or null.
 */
function modifierStackArchCurveMatch(
  corners: readonly THREE.Vector3[],
  frame: ModifierStackArchFrame,
): ModifierStackArchMatch | null {
  const centre = frame.box.getCenter(new THREE.Vector3());
  const span = modifierStackArchAxis(frame.spanAxis);
  const profile = corners.map((corner) => new THREE.Vector2(span.dot(corner) - span.dot(centre), corner.y));
  const has = (point: THREE.Vector2) =>
    profile.some((entry) => entry.distanceTo(point) < MODIFIER_STACK_ARCH_MATCH_EPSILON);
  for (const grow of frame.grows) {
    let length = 0;
    for (let index = 0; index < frame.curve.segments; index++) {
      const from = modifierStackArchCurvePoint(frame.curve, grow, index, frame.box.min.y);
      const to = modifierStackArchCurvePoint(frame.curve, grow, index + 1, frame.box.min.y);
      if (has(from) && has(to)) return { from, to, length };
      length += from.distanceTo(to);
    }
  }
  return null;
}
