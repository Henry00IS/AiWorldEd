import * as THREE from 'three';
import { editAxisDragParameter } from '@/edit/tool/edit_axis_drag.js';
import type { EditorViewportPickContext } from '@/editor/window/editor_viewport_pick_context.js';
import type { ModifierStackPath } from '@/modifier/stack/widgets/modifier_stack_path_record.js';
import type { PathAssetPoint } from '@/path/model/path_asset.js';
import { pathAssetStretchWalks } from '@/path/model/path_asset_script.js';

/** Decimals a point placed in the scene keeps, so stored paths stay tidy. */
const GENERATOR_PATH_DECIMALS = 6;

/**
 * Returns the ray from a pane's camera through a client point.
 *
 * @param pane Pane.
 * @param clientX Client X.
 * @param clientY Client Y.
 * @returns World ray.
 */
export function generatorPointerRay(pane: EditorViewportPickContext, clientX: number, clientY: number): THREE.Ray {
  const rect = pane.pickElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -(((clientY - rect.top) / rect.height) * 2 - 1),
  );
  const caster = new THREE.Raycaster();
  caster.setFromCamera(ndc, pane.camera);
  return caster.ray;
}

/**
 * Returns the world point under a client point on the grid plane through an
 * anchor that faces the camera most: level in a top view, upright in a front or
 * side view. The two plane coordinates are snapped by the grid; the third stays
 * the anchor's.
 *
 * @param pane Pane.
 * @param clientX Client X.
 * @param clientY Client Y.
 * @param anchor World point the plane runs through.
 * @param snap Snaps a world coordinate to the grid.
 * @returns World point, or null when the pane looks along the plane.
 */
export function generatorPathPlanePoint(
  pane: EditorViewportPickContext,
  clientX: number,
  clientY: number,
  anchor: THREE.Vector3,
  snap: (value: number) => number,
): THREE.Vector3 | null {
  const ray = generatorPointerRay(pane, clientX, clientY);
  const facing = [Math.abs(ray.direction.x), Math.abs(ray.direction.y), Math.abs(ray.direction.z)];
  const axis = facing.indexOf(Math.max(...facing));
  const normal = new THREE.Vector3().setComponent(axis, 1);
  const hit = ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(normal, anchor), new THREE.Vector3());
  if (!hit) return null;
  for (const each of [0, 1, 2])
    hit.setComponent(each, each === axis ? anchor.getComponent(each) : snap(hit.getComponent(each)));
  return hit;
}

/**
 * Returns the world point under a client point on the axis line through an
 * anchor, the distance travelled along it snapped by the grid.
 *
 * @param pane Pane.
 * @param clientX Client X.
 * @param clientY Client Y.
 * @param anchor World point the line runs through.
 * @param unit Unit world direction of the line.
 * @param snap Snaps a distance to the grid.
 * @returns World point, or null when the pane looks along the line.
 */
export function generatorPathAxisPoint(
  pane: EditorViewportPickContext,
  clientX: number,
  clientY: number,
  anchor: THREE.Vector3,
  unit: THREE.Vector3,
  snap: (value: number) => number,
): THREE.Vector3 | null {
  const ray = generatorPointerRay(pane, clientX, clientY);
  const along = editAxisDragParameter(anchor, unit, ray.origin, ray.direction);
  return along === null ? null : anchor.clone().addScaledVector(unit, snap(along));
}

/**
 * Places a path point in the world.
 *
 * @param path Path input.
 * @param point Point in script coordinates.
 * @returns World point.
 */
export function generatorPathWorld(path: ModifierStackPath, point: PathAssetPoint): THREE.Vector3 {
  return new THREE.Vector3(...point).applyMatrix4(path.frame);
}

/**
 * Turns a world point into a path point in script coordinates.
 *
 * @param path Path input.
 * @param world World point.
 * @returns Point in script coordinates.
 */
export function generatorPathScript(path: ModifierStackPath, world: THREE.Vector3): PathAssetPoint {
  const local = world.clone().applyMatrix4(path.frame.clone().invert());
  const tidy = (value: number): number => Number(value.toFixed(GENERATOR_PATH_DECIMALS)) || 0;
  return [tidy(local.x), tidy(local.y), tidy(local.z)];
}

/**
 * Returns the world line of each stretch of a path.
 *
 * @param path Path input.
 * @returns World points of each stretch, in stretch order.
 */
export function generatorPathStretchWalks(path: ModifierStackPath): THREE.Vector3[][] {
  return pathAssetStretchWalks(path.path).map((walk) =>
    walk.map((point) => new THREE.Vector3(point[0], point[1], point[2]).applyMatrix4(path.frame)),
  );
}
