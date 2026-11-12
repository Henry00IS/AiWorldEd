import * as THREE from 'three';
import { MODIFIER_VOLUME_BEVEL_EDGE_KEY } from '@/modifier/volume/modifier_volume_bevel_keys.js';
import { modifierStackFrame } from '@/modifier/stack/evaluate/modifier_stack_frame.js';
import { modifierStackAxis } from '@/modifier/stack/kinds/array/modifier_stack_array_math.js';
import {
  modifierStackMirrorBox,
  modifierStackMirrorDistance,
  modifierStackMirrorKeptSign,
} from '@/modifier/stack/kinds/array/modifier_stack_mirror_plane.js';

/**
 * Guide line color, apart from the orange volume box and the blue bounds
 * guides.
 */
const MODIFIER_STACK_MIRROR_GUIDE_COLOR = 0xff3fb4;

/**
 * Builds one mirror plane outline with diagonals, and a kept-side arrow when
 * bisecting.
 *
 * @param volume Modifier volume.
 * @param parameters Normalized mirror parameters.
 * @returns Guide lines in the volume's local space.
 */
export function modifierStackMirrorGuide(
  volume: THREE.Object3D,
  parameters: Record<string, unknown>,
): THREE.LineSegments {
  const box = modifierStackMirrorBox(volume, parameters['space']);
  const axis = modifierStackAxis(parameters['axis']);
  const points = modifierStackMirrorGuidePoints(box, axis, modifierStackMirrorDistance(axis, parameters, box));
  if (parameters['bisect'] === true) points.push(...modifierStackMirrorArrow(box, axis, points, parameters));
  const toLocal = volume.matrixWorld.clone().invert().multiply(modifierStackFrame(volume, parameters['space']));
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map((point) => point.clone().applyMatrix4(toLocal)));
  const material = new THREE.LineBasicMaterial({ color: MODIFIER_STACK_MIRROR_GUIDE_COLOR, depthTest: false });
  const lines = new THREE.LineSegments(geometry, material);
  lines.userData[MODIFIER_VOLUME_BEVEL_EDGE_KEY] = true;
  lines.renderOrder = 10;
  lines.raycast = () => undefined;
  return lines;
}

/**
 * Lists the plane rectangle and its diagonals as segment pairs, in the frame.
 *
 * @param box Volume box in its frame.
 * @param axis Plane normal.
 * @param distance Plane position along the axis.
 * @returns Segment end points.
 */
function modifierStackMirrorGuidePoints(box: THREE.Box3, axis: THREE.Vector3, distance: number): THREE.Vector3[] {
  const index = axis.x ? 0 : axis.y ? 1 : 2;
  const [first, second] = [(index + 1) % 3, (index + 2) % 3];
  const corner = (u: number, v: number): THREE.Vector3 => {
    const point = new THREE.Vector3().setComponent(index, distance);
    point.setComponent(first, (u ? box.max : box.min).getComponent(first));
    return point.setComponent(second, (v ? box.max : box.min).getComponent(second));
  };
  const [a, b, c, d] = [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)];
  return [a, b, b, c, c, d, d, a, a.clone(), c.clone(), b.clone(), d.clone()];
}

/**
 * Builds an arrow from the plane centre towards the side Bisect keeps.
 *
 * @param box Volume box in its frame.
 * @param axis Plane normal.
 * @param plane Plane outline points; the first four corners are used.
 * @param parameters Normalized mirror parameters.
 * @returns Segment end points.
 */
function modifierStackMirrorArrow(
  box: THREE.Box3,
  axis: THREE.Vector3,
  plane: readonly THREE.Vector3[],
  parameters: Record<string, unknown>,
): THREE.Vector3[] {
  const centre = plane
    .slice(0, 4)
    .reduce((sum, point) => sum.add(point), new THREE.Vector3())
    .multiplyScalar(0.25);
  const size = box.getSize(new THREE.Vector3());
  const length = Math.max(0.25, size.dot(axis) * 0.25);
  const tip = centre.clone().addScaledVector(axis, length * modifierStackMirrorKeptSign(parameters));
  const side = new THREE.Vector3(axis.y || axis.z ? 1 : 0, axis.x ? 1 : 0, 0).multiplyScalar(length * 0.3);
  const back = centre.clone().lerp(tip, 0.7);
  return [centre, tip, tip.clone(), back.clone().add(side), tip.clone(), back.clone().sub(side)];
}
