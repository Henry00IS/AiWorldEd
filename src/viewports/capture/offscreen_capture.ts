import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { prepareCheckerMaterialsForCapture } from './offscreen_capture_materials.js';
import { prepareBrushOverlapMaterials } from '@/viewports/shading/shading_brush_overlap_materials.js';

/**
 * Shading styles for off-screen captures. overlap = brush hull overdraw
 * (intersections stack brighter; cutters warm).
 */
export type OffscreenCaptureShading = 'solid' | 'overlap' | 'flat';

/** What to render. */
export interface OffscreenCaptureOptions {
  /** Square edge in pixels. */
  size: number;
  shading: OffscreenCaptureShading;
  /** When false, editor overlays (grids, gizmos, selection) are hidden. */
  includeHelpers: boolean;
  /**
   * When true, colors are encoded like the on-screen views, so the background
   * is the same grey and the image matches a screen grab; otherwise the raw
   * render target values are read back.
   */
  matchViewports?: boolean;
}

/** Rendered pixels, top row first, ready for ImageData. */
export interface OffscreenCapturePixels {
  width: number;
  height: number;
  rgba: Uint8ClampedArray<ArrayBuffer>;
}

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

/**
 * Renders a scene with a temporary camera into an off-screen texture and reads
 * it back. Restores renderer and scene state, so the live viewports are
 * unchanged.
 *
 * @param renderer Shared WebGL renderer.
 * @param scene Scene to render.
 * @param camera Posed camera (not parented into the scene).
 * @param options Size, shading and helper visibility.
 * @returns Pixels, top row first.
 */
export function offscreenCaptureRender(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  options: OffscreenCaptureOptions,
): OffscreenCapturePixels {
  const resolution = options.size;
  camera.aspect = 1;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const renderTarget = createCaptureRenderTarget(resolution, options.matchViewports === true);
  const snapshot = captureRendererState(renderer);
  const helperRestore = prepareHelperVisibility(scene, options.includeHelpers);
  const shadingRestore = applyCaptureShading(scene, options.shading);
  const lightRig = attachWorldCaptureLights(scene, camera);
  try {
    drawCapturePass(renderer, scene, camera, renderTarget, resolution);
    const raw = new Uint8Array(resolution * resolution * 4);
    renderer.readRenderTargetPixels(renderTarget, 0, 0, resolution, resolution, raw);
    return { width: resolution, height: resolution, rgba: flipRgbaPixelsVertically(raw, resolution, resolution) };
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
function applyCaptureShading(scene: THREE.Scene, shading: OffscreenCaptureShading): () => void {
  if (shading === 'overlap') {
    return prepareBrushOverlapMaterials(scene);
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
 * @param matchViewports Whether colors are encoded like the on-screen views.
 * @returns Render target.
 */
function createCaptureRenderTarget(resolution: number, matchViewports: boolean): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(resolution, resolution, {
    depthBuffer: true,
    stencilBuffer: false,
    ...(matchViewports ? { colorSpace: THREE.SRGBColorSpace } : {}),
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
 * Returns true when an object is an editor overlay that should stay out of a
 * clean capture.
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
  ambient.name = 'offscreen_capture_ambient';
  const key = new THREE.DirectionalLight(Theme.lightDirectional, 1.15);
  key.name = 'offscreen_capture_key';
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
 * Flips a tightly packed RGBA buffer vertically (WebGL bottom-left origin).
 *
 * @param source Bottom-up RGBA bytes from readRenderTargetPixels.
 * @param width Image width in pixels.
 * @param height Image height in pixels.
 * @returns Top-down RGBA bytes suitable for canvas ImageData.
 */
export function flipRgbaPixelsVertically(
  source: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray<ArrayBuffer> {
  const rowBytes = width * 4;
  const output = new Uint8ClampedArray(source.length);
  for (let row = 0; row < height; row++) {
    const sourceOffset = row * rowBytes;
    const destOffset = (height - 1 - row) * rowBytes;
    output.set(source.subarray(sourceOffset, sourceOffset + rowBytes), destOffset);
  }
  return output;
}
