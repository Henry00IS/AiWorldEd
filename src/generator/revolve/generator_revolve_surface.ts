import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import type { FaceSurfaceDescription } from '@/texture/uv_matrix/face_surface_description.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import type { GeneratorRevolveFrame } from './generator_revolve_brush.js';

/** Faces whose normal is this close to vertical are caps. */
const GENERATOR_REVOLVE_CAP_NORMAL = 0.999;

/**
 * Builds face surfaces that wrap the texture once around the sides: U runs
 * around the axis, one metre per tile, continuing from side to side; V runs up.
 * Caps keep the default top-down mapping.
 *
 * @param brush Revolved brush in frame coordinates.
 * @param frame Revolve frame.
 * @returns Surface per face; undefined keeps the default.
 */
export function generatorRevolveSurfaces(
  brush: SolidBrush,
  frame: GeneratorRevolveFrame,
): (FaceSurfaceDescription | undefined)[] {
  return brush.faces.map((face, index) => {
    const normal = brush.planes[index]?.normal;
    if (!normal || Math.abs(normal.y) > GENERATOR_REVOLVE_CAP_NORMAL) return undefined;
    const centroid = new THREE.Vector3();
    const corners = brush.getFaceVertexIndices(face);
    for (const corner of corners) centroid.add(brush.vertices[corner] ?? new THREE.Vector3());
    centroid.divideScalar(Math.max(1, corners.length));
    return { textureId: DEFAULT_CHECKER_TEXTURE_ID, uv: generatorRevolveSideUv(normal, centroid, frame) };
  });
}

/**
 * Builds the wrapping UV matrix of one side face.
 *
 * @param normal Face normal.
 * @param centroid Face centroid.
 * @param frame Revolve frame.
 * @returns UV matrix.
 */
function generatorRevolveSideUv(
  normal: THREE.Vector3,
  centroid: THREE.Vector3,
  frame: GeneratorRevolveFrame,
): SurfaceUvMatrix {
  const fallback = SurfaceUvMatrix.fromTrs(new THREE.Vector2(), normal, 0, 1, 1);
  const outward = new THREE.Vector3(centroid.x - frame.center.x, 0, centroid.z - frame.center.z);
  const vAxis = new THREE.Vector3(fallback.v.x, fallback.v.y, fallback.v.z);
  const uDefault = new THREE.Vector3(fallback.u.x, fallback.u.y, fallback.u.z);
  let tangent = new THREE.Vector3(-outward.z, 0, outward.x).normalize();
  const handed = new THREE.Vector3().crossVectors(uDefault, vAxis).dot(normal);
  const clockwise = new THREE.Vector3().crossVectors(tangent, vAxis).dot(normal) * handed < 0;
  if (clockwise) tangent = tangent.negate();
  const step = (Math.PI * 2) / frame.sides;
  const angle = (Math.atan2(outward.z, outward.x) + Math.PI * 2) % (Math.PI * 2);
  const around = Math.round(angle / step) % frame.sides;
  const sideIndex = clockwise ? (frame.sides - around) % frame.sides : around;
  const width = 2 * outward.length() * Math.tan(Math.PI / frame.sides);
  const offset = (sideIndex + 0.5) * width - tangent.dot(centroid);
  const u = new THREE.Vector4(tangent.x, tangent.y, tangent.z, offset);
  return new SurfaceUvMatrix(u, fallback.v);
}
