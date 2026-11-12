import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierVolumeTemplateCreate } from '@/modifier/stack/modifier_volume_templates.js';

/** How far a fitted decal reaches out of the surface, in meters. */
export const PAINT_DECAL_FIT_REACH = 0.05;

/** Faces whose normal leans less than this toward world up count as walls. */
const PAINT_DECAL_FIT_WALL = 0.9;

/** What a fitted decal covers: the face under the cursor or its whole brush. */
export type PaintDecalFitMode = 'surface' | 'object';

/** A brush face to fit a decal to. */
export interface PaintDecalFitTarget {
  /** Brush shape: an authored brush or an array or mirror copy. */
  readonly brush: SolidBrush;
  /** Face index. */
  readonly surfaceIndex: number;
  /** Maps the brush vertices to world space. */
  readonly toWorld: THREE.Matrix4;
}

/**
 * Fits a decal volume to a brush face. The volume's +Y leaves the face, so it
 * projects straight into it, and its sides hug the face (or the whole brush),
 * so it reaches no neighbour. On walls the image stands upright; on floors and
 * ceilings it runs along the longest edge of the face.
 *
 * @param target Face to fit.
 * @param mode Cover the face, or the whole brush seen from the face.
 * @returns World matrix of the unit volume box, or null for a degenerate face.
 */
export function paintDecalFit(target: PaintDecalFitTarget, mode: PaintDecalFitMode): THREE.Matrix4 | null {
  const face = target.brush.faces[target.surfaceIndex];
  const plane = target.brush.planes[target.surfaceIndex];
  if (face === undefined || plane === undefined) return null;
  const points = target.brush.getFaceVertices(face).map((point) => point.applyMatrix4(target.toWorld));
  const corners = target.brush.vertices.map((vertex) => vertex.clone().applyMatrix4(target.toWorld));
  if (points.length < 3) return null;
  const normal = plane.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(target.toWorld));
  if (normal.lengthSq() < 1e-12) return null;
  normal.normalize();
  const axes = paintDecalFitAxes(points, normal);
  if (axes === null) return null;
  const { axisX, axisZ } = axes;
  const origin = points[0]!;
  const box = new THREE.Box3();
  const local = new THREE.Vector3();
  const measure = (point: THREE.Vector3): THREE.Vector3 => {
    local.subVectors(point, origin);
    return new THREE.Vector3(local.dot(axisX), local.dot(normal), local.dot(axisZ));
  };
  for (const point of mode === 'surface' ? points : corners) box.expandByPoint(measure(point));
  const depth = Math.max(...corners.map((point) => -measure(point).y));
  if (mode === 'surface') {
    box.min.y = -Math.max(Math.min(PAINT_DECAL_FIT_REACH, depth * 0.5), 1e-3);
    box.max.y = PAINT_DECAL_FIT_REACH;
  } else {
    box.min.y -= 1e-3;
    box.max.y += PAINT_DECAL_FIT_REACH;
  }
  const size = box.getSize(new THREE.Vector3());
  if (size.x < 1e-6 || size.z < 1e-6) return null;
  const center = box.getCenter(new THREE.Vector3());
  const position = origin
    .clone()
    .addScaledVector(axisX, center.x)
    .addScaledVector(normal, center.y)
    .addScaledVector(axisZ, center.z);
  const rotation = new THREE.Matrix4().makeBasis(axisX, normal, axisZ);
  return new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromRotationMatrix(rotation), size);
}

/**
 * Chooses the box axes on a face plane. Decal images run up the volume's -Z, so
 * on walls -Z is world up; elsewhere X follows the longest edge.
 *
 * @param points Face polygon in world space.
 * @param normal Unit face normal.
 * @returns Unit X and Z axes, right-handed with the normal as Y, or null.
 */
function paintDecalFitAxes(
  points: readonly THREE.Vector3[],
  normal: THREE.Vector3,
): { axisX: THREE.Vector3; axisZ: THREE.Vector3 } | null {
  if (Math.abs(normal.y) < PAINT_DECAL_FIT_WALL) {
    const axisZ = new THREE.Vector3(0, -1, 0).addScaledVector(normal, normal.y).normalize();
    return { axisX: new THREE.Vector3().crossVectors(normal, axisZ), axisZ };
  }
  const axisX = paintDecalFitLongestEdge(points, normal);
  return axisX === null ? null : { axisX, axisZ: new THREE.Vector3().crossVectors(axisX, normal) };
}

/**
 * Returns the direction of the longest edge of a polygon, flattened onto its
 * plane.
 *
 * @param points Polygon.
 * @param normal Plane normal.
 * @returns Unit direction, or null when every edge is degenerate.
 */
function paintDecalFitLongestEdge(points: readonly THREE.Vector3[], normal: THREE.Vector3): THREE.Vector3 | null {
  let best: THREE.Vector3 | null = null;
  let bestLength = 1e-9;
  for (let index = 0; index < points.length; index++) {
    const edge = new THREE.Vector3().subVectors(points[(index + 1) % points.length]!, points[index]!);
    edge.addScaledVector(normal, -edge.dot(normal));
    const length = edge.length();
    if (length <= bestLength) continue;
    bestLength = length;
    best = edge.divideScalar(length);
  }
  return best;
}

/**
 * Creates a decal volume at a fitted place, in a plain color with hard edges,
 * ready to be added to a parent.
 *
 * @param fit World matrix from {@link paintDecalFit}.
 * @param parent Parent the volume will be added to.
 * @param color 0xRRGGBB.
 * @returns Volume mesh, not yet added.
 */
export function paintDecalVolumeCreate(fit: THREE.Matrix4, parent: THREE.Object3D, color: number): THREE.Mesh {
  const volume = modifierVolumeTemplateCreate('decal');
  parent.updateWorldMatrix(true, false);
  const local = parent.matrixWorld.clone().invert().multiply(fit);
  local.decompose(volume.position, volume.quaternion, volume.scale);
  const settings = ModifierVolume.read(volume);
  const hex = `#${color.toString(16).padStart(6, '0')}`;
  ModifierVolume.write(volume, {
    ...settings,
    modifiers: settings.modifiers.map((step) => ({
      ...step,
      parameters: { ...step.parameters, color: hex, edgeFade: 0 },
    })),
  });
  return volume;
}
