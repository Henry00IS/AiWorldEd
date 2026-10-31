import * as THREE from 'three';

const screenViewport = new THREE.Vector4();
const screenView = new THREE.Vector3();

/**
 * Returns how many world units one screen pixel covers at a position, for the
 * viewport being drawn right now. Used to keep name tags and camera gizmos
 * readable at any distance and zoom.
 *
 * @param renderer Renderer drawing the current pane.
 * @param camera Camera of the current pane.
 * @param position World position.
 * @returns World units per CSS pixel.
 */
export function screenCollaborationWorldPerPixel(
  renderer: THREE.WebGLRenderer,
  camera: THREE.Camera,
  position: THREE.Vector3,
): number {
  renderer.getCurrentViewport(screenViewport);
  const height = Math.max(1, screenViewport.w / Math.max(1e-3, renderer.getPixelRatio()));
  return screenCollaborationWorldHeight(camera, position) / height;
}

/**
 * Returns the world height of the view at a position.
 *
 * @param camera Viewing camera.
 * @param position World position.
 * @returns Visible world height.
 */
export function screenCollaborationWorldHeight(camera: THREE.Camera, position: THREE.Vector3): number {
  if (camera instanceof THREE.OrthographicCamera) return (camera.top - camera.bottom) / Math.max(1e-6, camera.zoom);
  if (!(camera instanceof THREE.PerspectiveCamera)) return 1;
  const depth = Math.max(0.01, -screenView.copy(position).applyMatrix4(camera.matrixWorldInverse).z);
  return (2 * depth * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / Math.max(1e-6, camera.zoom);
}
