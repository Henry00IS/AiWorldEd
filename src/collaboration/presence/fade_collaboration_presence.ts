import * as THREE from 'three';

/**
 * Distance from the viewing camera below which a remote gizmo is hidden, in
 * meters.
 */
export const FADE_COLLABORATION_PRESENCE_NEAR = 0.5;
/**
 * Distance from the viewing camera beyond which a remote gizmo is fully
 * visible, in meters.
 */
export const FADE_COLLABORATION_PRESENCE_FAR = 2;

const fadeEye = new THREE.Vector3();

/**
 * Returns how visible a remote gizmo is at a distance from the viewing camera:
 * 0 at or below `near`, 1 at or beyond `far`, with a smooth ease in between.
 * Keeps a remote camera that sits at or near the viewer's own camera from
 * filling the view.
 *
 * @param distance Distance from the viewing camera in meters.
 * @param near Distance where the fade starts showing the gizmo.
 * @param far Distance where the gizmo is fully visible.
 * @returns Opacity factor from 0 to 1.
 */
export function fadeCollaborationPresence(
  distance: number,
  near = FADE_COLLABORATION_PRESENCE_NEAR,
  far = FADE_COLLABORATION_PRESENCE_FAR,
): number {
  if (!Number.isFinite(distance) || distance <= near) return 0;
  if (distance >= far) return 1;
  const t = (distance - near) / (far - near);
  return t * t * (3 - 2 * t);
}

/**
 * Returns the fade of a remote gizmo for the camera of the pane being drawn.
 * Orthographic panes look from far away at a fixed scale, so they never fade.
 *
 * @param camera Camera of the current pane, with its world matrix up to date.
 * @param position World position of the gizmo.
 * @returns Opacity factor from 0 to 1.
 */
export function fadeCollaborationPresenceCamera(camera: THREE.Camera, position: THREE.Vector3): number {
  if (camera instanceof THREE.OrthographicCamera) return 1;
  return fadeCollaborationPresence(fadeEye.setFromMatrixPosition(camera.matrixWorld).distanceTo(position));
}
