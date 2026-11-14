import * as THREE from 'three';

const noteViewport = new THREE.Vector4();
const noteView = new THREE.Vector3();

/**
 * Returns how many world units one CSS pixel covers at a position in the pane
 * being drawn right now, so a label keeps its size on screen at any distance or
 * zoom.
 *
 * @param renderer Renderer drawing the current pane.
 * @param camera Pane camera.
 * @param position World position.
 * @returns World units per CSS pixel.
 */
export function levelNoteWorldPerPixel(
  renderer: THREE.WebGLRenderer,
  camera: THREE.Camera,
  position: THREE.Vector3,
): number {
  renderer.getCurrentViewport(noteViewport);
  const pixels = Math.max(1, noteViewport.w / Math.max(1e-3, renderer.getPixelRatio()));
  return levelNoteViewHeight(camera, position) / pixels;
}

/**
 * Returns the visible world height of a camera's view at a position.
 *
 * @param camera Camera.
 * @param position World position.
 * @returns World height.
 */
function levelNoteViewHeight(camera: THREE.Camera, position: THREE.Vector3): number {
  if (camera instanceof THREE.OrthographicCamera) return (camera.top - camera.bottom) / Math.max(1e-6, camera.zoom);
  if (!(camera instanceof THREE.PerspectiveCamera)) return 1;
  const depth = Math.max(0.01, -noteView.copy(position).applyMatrix4(camera.matrixWorldInverse).z);
  return (2 * depth * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / Math.max(1e-6, camera.zoom);
}
