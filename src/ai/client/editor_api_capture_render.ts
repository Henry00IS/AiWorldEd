import * as THREE from 'three';
import { Theme } from '@/theme.js';
import type { CaptureViewShading } from './editor_api_capture_types.js';
import { prepareCheckerMaterialsForCapture } from './editor_api_capture_materials.js';
import { prepareOverlapCaptureMaterials } from './editor_api_capture_overlap.js';
import {
  clampCaptureResolution,
  encodeCaptureImageForMcp,
  encodeCapturePng,
  flipRgbaPixelsVertically,
  type EncodedCaptureImage,
} from './editor_api_capture_pixels.js';

/** Snapshot of renderer state restored after an offline capture. */
interface RendererStateSnapshot {
  renderTarget: THREE.WebGLRenderTarget | null;
  viewport: THREE.Vector4;
  scissor: THREE.Vector4;
  scissorTest: boolean;
  autoClear: boolean;
}

/** Temporary lights added for a capture pass. */
interface CaptureLightRig {
  ambient: THREE.AmbientLight;
  key: THREE.DirectionalLight;
}

/** Result of a successful offline render pass. */
export type CaptureRenderOutput = EncodedCaptureImage;

/**
 * Renders the shared scene with a temporary camera into an offline texture.
 * Restores renderer and scene state so the live editor is unchanged.
 *
 * @param renderer Shared WebGL renderer from the editor workspace.
 * @param scene Shared editor scene.
 * @param camera Capture camera already posed (not parented into the scene).
 * @param shading Capture shading mode.
 * @param size Requested square resolution.
 * @param includeHelpers When false, hides shared helper overlays during
 *   capture.
 * @param lossless True for a full-resolution PNG instead of a budgeted JPEG.
 * @returns Image base64 payload and size metadata.
 */
export function renderSceneToCaptureImage(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  shading: CaptureViewShading,
  size: number | undefined,
  includeHelpers: boolean,
  lossless = false,
): CaptureRenderOutput {
  const resolution = clampCaptureResolution(size);
  camera.aspect = 1;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const renderTarget = createCaptureRenderTarget(resolution);
  const snapshot = captureRendererState(renderer);
  const helperRestore = prepareHelperVisibility(scene, includeHelpers);
  const shadingRestore = applyCaptureShading(scene, shading);
  const lightRig = attachWorldCaptureLights(scene, camera);
  try {
    drawCapturePass(renderer, scene, camera, renderTarget, resolution);
    return readRenderTargetAsCaptureImage(renderer, renderTarget, resolution, lossless);
  } finally {
    detachWorldCaptureLights(scene, lightRig);
    shadingRestore();
    helperRestore();
    restoreRendererState(renderer, snapshot);
    renderTarget.dispose();
  }
}

/**
 * Applies solid checker→white, flat override, or brush-overlap prep.
 *
 * @param scene Shared editor scene.
 * @param shading Capture shading.
 * @returns Restore callback.
 */
function applyCaptureShading(scene: THREE.Scene, shading: CaptureViewShading): () => void {
  if (shading === 'overlap') {
    return prepareOverlapCaptureMaterials(scene);
  }
  if (shading === 'flat') {
    const previous = scene.overrideMaterial;
    const material = new THREE.MeshBasicMaterial({ color: 0xcccccc });
    scene.overrideMaterial = material;
    return () => {
      scene.overrideMaterial = previous;
      material.dispose();
    };
  }
  return prepareCheckerMaterialsForCapture(scene);
}

/**
 * Allocates a square color render target for capture.
 *
 * @param resolution Square pixel size.
 * @returns Render target.
 */
function createCaptureRenderTarget(resolution: number): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(resolution, resolution, {
    depthBuffer: true,
    stencilBuffer: false,
  });
}

/**
 * Snapshots viewport/scissor/render-target state for later restore.
 *
 * @param renderer WebGL renderer.
 * @returns Snapshot bag.
 */
function captureRendererState(renderer: THREE.WebGLRenderer): RendererStateSnapshot {
  return {
    renderTarget: renderer.getRenderTarget(),
    viewport: renderer.getViewport(new THREE.Vector4()),
    scissor: renderer.getScissor(new THREE.Vector4()),
    scissorTest: renderer.getScissorTest(),
    autoClear: renderer.autoClear,
  };
}

/**
 * Restores renderer state after an offline pass.
 *
 * @param renderer WebGL renderer.
 * @param snapshot Prior state.
 */
function restoreRendererState(renderer: THREE.WebGLRenderer, snapshot: RendererStateSnapshot): void {
  renderer.setRenderTarget(snapshot.renderTarget);
  renderer.setViewport(snapshot.viewport);
  renderer.setScissor(snapshot.scissor);
  renderer.setScissorTest(snapshot.scissorTest);
  renderer.autoClear = snapshot.autoClear;
}

/**
 * Hides shared helper overlays when helpers should not appear in the capture.
 *
 * @param scene Shared editor scene.
 * @param includeHelpers Whether helpers stay visible.
 * @returns Restore callback.
 */
function prepareHelperVisibility(scene: THREE.Scene, includeHelpers: boolean): () => void {
  if (includeHelpers) {
    return () => undefined;
  }
  const restored: Array<{ object: THREE.Object3D; visible: boolean }> = [];
  scene.traverse((object) => {
    if (!shouldHideForCleanCapture(object)) {
      return;
    }
    restored.push({ object, visible: object.visible });
    object.visible = false;
  });
  return () => {
    for (const entry of restored) {
      entry.object.visible = entry.visible;
    }
  };
}

/**
 * Returns true when an object is an editor overlay that should stay out of AI
 * views.
 *
 * @param object Scene object.
 * @returns True when the object should be hidden for a clean capture.
 */
function shouldHideForCleanCapture(object: THREE.Object3D): boolean {
  const name = object.name || '';
  if (name === 'shared_helpers_root') return true;
  if (name === 'grids_root' || name === 'gizmo_transform' || name === 'gizmo_bounds') return true;
  if (name === 'infinite_grid_2d' || name === 'infinite_grid_3d') return true;
  if (name.startsWith('gizmo_transform')) return true;
  if (object.userData['isCadRuler'] === true) return true;
  if (object.userData['isSelectionHighlight'] === true) return true;
  if (object.userData['isWireframeOverlay'] === true) return true;
  if (object.userData['isClipPlanePreview'] === true) return true;
  return false;
}

/**
 * Adds temporary world-space lights for the capture (camera is not
 * scene-parented).
 *
 * @param scene Shared scene.
 * @param camera Posed capture camera.
 * @returns Light rig for later removal.
 */
function attachWorldCaptureLights(scene: THREE.Scene, camera: THREE.PerspectiveCamera): CaptureLightRig {
  const ambient = new THREE.AmbientLight(Theme.lightAmbient, 0.55);
  ambient.name = 'ai_capture_ambient';
  const key = new THREE.DirectionalLight(Theme.lightDirectional, 1.15);
  key.name = 'ai_capture_key';
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  key.position.copy(camera.position);
  key.target.position.copy(camera.position).add(forward);
  scene.add(ambient);
  scene.add(key);
  scene.add(key.target);
  return { ambient, key };
}

/**
 * Removes temporary capture lights from the scene.
 *
 * @param scene Shared scene.
 * @param rig Lights added for the pass.
 */
function detachWorldCaptureLights(scene: THREE.Scene, rig: CaptureLightRig): void {
  scene.remove(rig.ambient);
  scene.remove(rig.key);
  scene.remove(rig.key.target);
  rig.ambient.dispose();
  if (typeof rig.key.dispose === 'function') {
    rig.key.dispose();
  }
}

/**
 * Clears and draws one offline frame into the render target.
 *
 * Important: do not call renderer.setViewport() here. Three.js multiplies every
 * setViewport by the canvas pixel ratio. After setRenderTarget, the RT already
 * has a correct 1:1 pixel viewport; setViewport(0,0,size,size) would expand to
 * size*pixelRatio and only a corner of the view would land in the texture
 * (subjects appear squashed into one corner of the image).
 *
 * @param renderer WebGL renderer.
 * @param scene Shared scene.
 * @param camera Capture camera.
 * @param renderTarget Offline target.
 * @param resolution Square size (must match renderTarget width/height).
 */
function drawCapturePass(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  renderTarget: THREE.WebGLRenderTarget,
  resolution: number,
): void {
  ensureRenderTargetViewportMatchesResolution(renderTarget, resolution);
  renderer.setRenderTarget(renderTarget);
  renderer.setScissorTest(false);
  renderer.autoClear = true;
  renderer.setClearColor(Theme.viewportBackground, 1);
  renderer.clear(true, true, true);
  renderer.render(scene, camera);
}

/**
 * Ensures the RT viewport/scissor are exact pixel rectangles (no pixel-ratio).
 *
 * @param renderTarget Capture target.
 * @param resolution Expected square edge in pixels.
 */
function ensureRenderTargetViewportMatchesResolution(renderTarget: THREE.WebGLRenderTarget, resolution: number): void {
  renderTarget.viewport.set(0, 0, resolution, resolution);
  renderTarget.scissor.set(0, 0, resolution, resolution);
  renderTarget.scissorTest = false;
}

/**
 * Reads the render target, flips rows, and encodes an MCP-safe JPEG or a
 * lossless PNG.
 *
 * @param renderer WebGL renderer.
 * @param renderTarget Target just drawn.
 * @param resolution Square size.
 * @param lossless True for a full-resolution PNG.
 * @returns Encoded capture image.
 */
function readRenderTargetAsCaptureImage(
  renderer: THREE.WebGLRenderer,
  renderTarget: THREE.WebGLRenderTarget,
  resolution: number,
  lossless: boolean,
): EncodedCaptureImage {
  const pixelCount = resolution * resolution * 4;
  const raw = new Uint8Array(pixelCount);
  renderer.readRenderTargetPixels(renderTarget, 0, 0, resolution, resolution, raw);
  const flipped = flipRgbaPixelsVertically(raw, resolution, resolution);
  const ownerDocument = renderer.domElement.ownerDocument ?? document;
  if (lossless) return encodeCapturePng(flipped, resolution, resolution, ownerDocument);
  return encodeCaptureImageForMcp(flipped, resolution, resolution, resolution, undefined, ownerDocument);
}
