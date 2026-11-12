import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { MODIFIER_SMOOTH_FLAT } from '@/modifier/smooth/modifier_smooth_shading.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import type { FaceSurfaceDescription } from '@/texture/uv_matrix/face_surface_description.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import type { GeneratorRevolveFrame } from './generator_revolve_brush.js';
import {
  GENERATOR_REVOLVE_CAP_NORMAL,
  generatorRevolveCapUv,
  type GeneratorRevolveUvLayout,
} from './generator_revolve_surface.js';
import { generatorRevolveTwistRow, type GeneratorRevolveMappedCorner } from './generator_revolve_surface_twist.js';

/**
 * A level side edge at least this many times as long as a round ring edge is a
 * flat side of a section rather than part of a curve.
 */
const GENERATOR_REVOLVE_BLEND_FLAT_EDGE = 1.5;

/** Points closer than this to the axis have no direction around it, in metres. */
const GENERATOR_REVOLVE_BLEND_AXIS_EPSILON = 1e-9;

/**
 * Builds the face surfaces of a morphing piece. U runs once around the axis by
 * angle, aligned with the round sections' seam; V is the running profile
 * length; caps keep the planar mapping.
 *
 * @param brush Morphing piece in frame coordinates.
 * @param round Round frame of the whole shape.
 * @param layout Texture layout of the whole shape.
 * @returns Surface per face.
 */
export function generatorRevolveBlendSurfaces(
  brush: SolidBrush,
  round: GeneratorRevolveFrame,
  layout: GeneratorRevolveUvLayout,
): (FaceSurfaceDescription | undefined)[] {
  return brush.faces.map((face, index) => {
    const normal = brush.planes[index]?.normal;
    if (!normal) return undefined;
    const corners = brush.getFaceVertexIndices(face).map((corner) => brush.vertices[corner] ?? new THREE.Vector3());
    const uv =
      Math.abs(normal.y) > GENERATOR_REVOLVE_CAP_NORMAL
        ? generatorRevolveCapUv(normal, round, layout)
        : generatorRevolveBlendSideUv(corners, round, layout);
    return { textureId: DEFAULT_CHECKER_TEXTURE_ID, uv };
  });
}

/**
 * Fits the UV matrix of one side face from three corners that span it.
 *
 * @param corners Face corners.
 * @param round Round frame.
 * @param layout Texture layout.
 * @returns UV matrix.
 */
function generatorRevolveBlendSideUv(
  corners: readonly THREE.Vector3[],
  round: GeneratorRevolveFrame,
  layout: GeneratorRevolveUvLayout,
): SurfaceUvMatrix {
  const mapped = generatorRevolveBlendSpan(corners).map((point) => ({
    point,
    uv: new THREE.Vector2(
      generatorRevolveBlendTurn(point, round) * layout.around,
      generatorRevolveBlendLength(layout, point.y - round.center.y),
    ),
  }));
  generatorRevolveBlendUnwrap(mapped, layout.around);
  const [a, b, c] = mapped;
  if (!a || !b || !c) return new SurfaceUvMatrix(new THREE.Vector4(), new THREE.Vector4());
  return new SurfaceUvMatrix(generatorRevolveTwistRow(a, b, c, 'x'), generatorRevolveTwistRow(a, b, c, 'y'));
}

/**
 * Picks three face corners spanning the largest triangle, so long thin faces
 * still fit a stable matrix.
 *
 * @param corners Face corners.
 * @returns Up to three corners.
 */
function generatorRevolveBlendSpan(corners: readonly THREE.Vector3[]): THREE.Vector3[] {
  let best: THREE.Vector3[] = corners.slice(0, 3);
  let bestArea = -1;
  for (let i = 0; i < corners.length; i++)
    for (let j = i + 1; j < corners.length; j++)
      for (let k = j + 1; k < corners.length; k++) {
        const [a, b, c] = [corners[i], corners[j], corners[k]];
        if (!a || !b || !c) continue;
        const area = b.clone().sub(a).cross(c.clone().sub(a)).lengthSq();
        if (area > bestArea) [best, bestArea] = [[a, b, c], area];
      }
  return best;
}

/**
 * Returns the turn of a point around the axis, matching the seam of round
 * rings: 1 at their first corner, decreasing counter-clockwise.
 *
 * @param point Point.
 * @param round Round frame.
 * @returns Turn; NaN on the axis.
 */
function generatorRevolveBlendTurn(point: THREE.Vector3, round: GeneratorRevolveFrame): number {
  const x = point.x - round.center.x;
  const z = point.z - round.center.z;
  if (Math.hypot(x, z) < GENERATOR_REVOLVE_BLEND_AXIS_EPSILON) return Number.NaN;
  const angle = THREE.MathUtils.euclideanModulo(Math.atan2(z, x), Math.PI * 2);
  return 1 + 0.5 / round.sides - angle / (Math.PI * 2);
}

/**
 * Keeps U continuous across a face: corners take the repeat nearest the first
 * corner with a direction, and corners on the axis take the middle of the
 * others.
 *
 * @param mapped Mapped corners, changed in place.
 * @param around Texture repeats around the axis.
 */
function generatorRevolveBlendUnwrap(mapped: GeneratorRevolveMappedCorner[], around: number): void {
  const anchor = mapped.find((corner) => Number.isFinite(corner.uv.x))?.uv.x ?? 0;
  for (const corner of mapped)
    if (Number.isFinite(corner.uv.x)) corner.uv.x -= Math.round((corner.uv.x - anchor) / around) * around;
  const known = mapped.filter((corner) => Number.isFinite(corner.uv.x));
  const middle = known.reduce((sum, corner) => sum + corner.uv.x, 0) / Math.max(1, known.length);
  for (const corner of mapped) if (!Number.isFinite(corner.uv.x)) corner.uv.x = middle;
}

/**
 * Returns the texture V at a height: the running profile length between the
 * rising stations around it.
 *
 * @param layout Texture layout.
 * @param height Height above the axis base.
 * @returns V.
 */
function generatorRevolveBlendLength(layout: GeneratorRevolveUvLayout, height: number): number {
  const arcs = layout.arcs;
  for (let index = 1; index < arcs.length; index++) {
    const low = arcs[index - 1];
    const high = arcs[index];
    if (!low || !high || high.height - low.height <= 1e-9 || height > high.height + 1e-9) continue;
    const t = THREE.MathUtils.clamp((height - low.height) / (high.height - low.height), 0, 1);
    return (low.length + (high.length - low.length) * t) * layout.alongPerMetre;
  }
  return (arcs[arcs.length - 1]?.length ?? 0) * layout.alongPerMetre;
}

/**
 * Keeps caps and the flat sides of sections hard while the curved parts of a
 * morphing piece shade smoothly: a side face along a long level edge is a flat
 * side.
 *
 * @param brush Morphing piece.
 * @param round Round frame of the whole shape.
 * @returns Smoothing class per face.
 */
export function generatorRevolveBlendSmoothClasses(brush: SolidBrush, round: GeneratorRevolveFrame): number[] {
  return brush.planes.map((plane, index) => {
    if (Math.abs(plane.normal.y) > GENERATOR_REVOLVE_CAP_NORMAL) return MODIFIER_SMOOTH_FLAT;
    const face = brush.faces[index];
    const corners = face ? brush.getFaceVertexIndices(face).map((corner) => brush.vertices[corner]) : [];
    const points = corners.filter((corner): corner is THREE.Vector3 => !!corner);
    return generatorRevolveBlendFlatFace(points, round) ? MODIFIER_SMOOTH_FLAT : 0;
  });
}

/**
 * Returns whether a face has a level edge much longer than a round ring edge at
 * its distance from the axis.
 *
 * @param corners Face corners.
 * @param round Round frame.
 * @returns True for a flat section side.
 */
function generatorRevolveBlendFlatFace(corners: readonly THREE.Vector3[], round: GeneratorRevolveFrame): boolean {
  const reach = (point: THREE.Vector3) => Math.hypot(point.x - round.center.x, point.z - round.center.z);
  return corners.some((corner, index) => {
    const next = corners[(index + 1) % corners.length] ?? corner;
    if (Math.abs(corner.y - next.y) > 1e-7) return false;
    const roundEdge = (2 * Math.PI * Math.max(reach(corner), reach(next))) / Math.max(3, round.sides);
    return corner.distanceTo(next) > roundEdge * GENERATOR_REVOLVE_BLEND_FLAT_EDGE;
  });
}
