import * as THREE from 'three';
import type { EditorApiHost } from './editor_api_host.js';
import type { CaptureViewArgs, CaptureViewData, CaptureViewShading } from './editor_api_capture_types.js';
import { resolveCaptureCameraPose, type CaptureCameraPose } from './editor_api_capture_camera.js';
import { renderSceneToCaptureImage } from './editor_api_capture_render.js';
import type { EncodedCaptureImage } from './editor_api_capture_pixels.js';
import { MCP_CAPTURE_MAX_BASE64_CHARS } from './editor_api_capture_pixels.js';
import { vec3ToDto } from './editor_api_math.js';
import { failResult, okResult } from './editor_api_result.js';
import { sharedAiCaptureDebugStore } from './store_ai_capture_debug.js';
import type { McpToolResult } from '@/ai/shared/mcp_protocol_types.js';

/**
 * Offline world capture for MCP: render-to-texture without changing the live
 * editor viewports.
 */
export class EditorApiCapture {
  private readonly host: EditorApiHost;

  /**
   * Creates capture helpers bound to the editor host.
   *
   * @param host Injected editor systems including optional scene/renderer.
   */
  constructor(host: EditorApiHost) {
    this.host = host;
  }

  /**
   * Renders an offline view and returns a compact JPEG for the MCP image block.
   *
   * @param args Framing and shading options.
   * @returns Tool result with camera metadata and image payload.
   */
  captureView(args: CaptureViewArgs = {}): McpToolResult {
    const scene = this.resolveScene();
    if (!scene) {
      return failResult(
        'capture_view failed: editor scene is not available. Start MCP from the editor toolbar and try again.',
      );
    }
    const renderer = this.resolveRenderer();
    if (!renderer) {
      return failResult(
        'capture_view failed: WebGL renderer is not available. Start MCP from the editor toolbar and try again.',
      );
    }
    return this.executeCapture(scene, renderer, args);
  }

  /**
   * Runs camera setup and offline render for a validated scene/renderer pair.
   *
   * @param scene Shared editor scene.
   * @param renderer Shared WebGL renderer.
   * @param args Capture arguments.
   * @returns Tool result with image.
   */
  private executeCapture(scene: THREE.Scene, renderer: THREE.WebGLRenderer, args: CaptureViewArgs): McpToolResult {
    const shading = resolveShading(args.shading);
    const camera = createCaptureCamera(args.fov);
    const pose = resolveCaptureCameraPose(this.host.worldObject, args, camera);
    applyCapturePoseToCamera(camera, pose.position, pose.lookAt, pose.up);
    const rendered = renderSceneToCaptureImage(
      renderer,
      scene,
      camera,
      shading,
      args.size,
      Boolean(args.includeHelpers),
      Boolean(args.lossless),
    );
    if (!args.lossless && rendered.base64.length > MCP_CAPTURE_MAX_BASE64_CHARS) {
      return failResult(
        `capture_view failed: image is still too large after shrinking (${rendered.width}×${rendered.height}, ${rendered.base64.length} base64 chars).`,
      );
    }
    const data = buildCaptureData(rendered, shading, pose, camera.fov);
    const message = buildCaptureMessage(rendered, pose.framingMode);
    recordCaptureForDebugPanel(
      rendered,
      shading,
      pose.position,
      pose.lookAt,
      pose.framedBrushIds.length,
      message,
      pose.framingMode,
    );
    return okResult(message, data, {
      images: [{ mimeType: rendered.mimeType, data: rendered.base64 }],
    });
  }

  /**
   * Resolves the shared scene from the host when available.
   *
   * @returns Scene or null.
   */
  private resolveScene(): THREE.Scene | null {
    if (!this.host.getScene) {
      return null;
    }
    return this.host.getScene();
  }

  /**
   * Resolves the shared WebGL renderer from the host when available.
   *
   * @returns Renderer or null.
   */
  private resolveRenderer(): THREE.WebGLRenderer | null {
    if (!this.host.getRenderer) {
      return null;
    }
    return this.host.getRenderer();
  }
}

/**
 * Creates a temporary perspective camera for offline capture.
 *
 * @param fovDegrees Optional vertical FOV (default 60).
 * @returns Perspective camera.
 */
function createCaptureCamera(fovDegrees: number | undefined): THREE.PerspectiveCamera {
  const fov = typeof fovDegrees === 'number' && Number.isFinite(fovDegrees) ? fovDegrees : 60;
  return new THREE.PerspectiveCamera(Math.min(120, Math.max(10, fov)), 1, 0.05, 5000);
}

/**
 * Applies a resolved pose to the capture camera before rendering.
 *
 * @param camera Capture camera.
 * @param position World position.
 * @param lookAt World look-at.
 * @param up Camera up vector.
 */
function applyCapturePoseToCamera(
  camera: THREE.PerspectiveCamera,
  position: THREE.Vector3,
  lookAt: THREE.Vector3,
  up: THREE.Vector3,
): void {
  camera.position.copy(position);
  camera.up.copy(up);
  camera.lookAt(lookAt);
  camera.updateMatrixWorld(true);
}

/**
 * Normalizes the shading mode argument.
 *
 * @param shading Raw shading value.
 * @returns Supported shading mode.
 */
function resolveShading(shading: string | undefined): CaptureViewShading {
  if (shading === 'overlap' || shading === 'flat' || shading === 'solid') {
    return shading;
  }
  if (shading === 'wireframe') {
    return 'overlap';
  }
  return 'solid';
}

/**
 * Builds a short success message including framing and compression notes.
 *
 * @param rendered Encoded image.
 * @param framingMode Framing mode label.
 * @returns Human-readable message.
 */
function buildCaptureMessage(rendered: EncodedCaptureImage, framingMode: string): string {
  const base = `Captured view (${rendered.width}×${rendered.height} ${rendered.mimeType === 'image/png' ? 'PNG' : 'JPEG'}, ${framingMode})`;
  if (!rendered.reducedFromRequested) {
    return base;
  }
  return `${base}, compressed for MCP size limits`;
}

/**
 * Builds the JSON metadata payload for a successful capture.
 *
 * @param rendered Encoded image size/mime.
 * @param shading Shading mode used.
 * @param pose Resolved camera pose.
 * @param fov Vertical FOV in degrees.
 * @returns CaptureViewData.
 */
function buildCaptureData(
  rendered: EncodedCaptureImage,
  shading: CaptureViewShading,
  pose: CaptureCameraPose,
  fov: number,
): CaptureViewData {
  return {
    width: rendered.width,
    height: rendered.height,
    mimeType: rendered.mimeType,
    shading,
    camera: {
      position: vec3ToDto(pose.position),
      lookAt: vec3ToDto(pose.lookAt),
      fov,
    },
    framedBrushIds: pose.framedBrushIds,
    framedBrushCount: pose.framedBrushIds.length,
    framingMode: pose.framingMode,
    imageBytes: rendered.byteLength,
    jpegQuality: rendered.quality,
    compressedForMcp: rendered.reducedFromRequested,
  };
}

/**
 * Stores the capture in the floating AI Captures debug panel history.
 *
 * @param rendered Encoded image.
 * @param shading Shading mode label.
 * @param position Camera position.
 * @param lookAt Camera look-at.
 * @param framedBrushCount Number of framed brushes.
 * @param message Capture success message.
 * @param framingMode Framing mode label.
 */
function recordCaptureForDebugPanel(
  rendered: EncodedCaptureImage,
  shading: CaptureViewShading,
  position: THREE.Vector3,
  lookAt: THREE.Vector3,
  framedBrushCount: number,
  message: string,
  framingMode: string,
): void {
  sharedAiCaptureDebugStore.record({
    mimeType: rendered.mimeType,
    base64: rendered.base64,
    width: rendered.width,
    height: rendered.height,
    shading,
    cameraSummary: `${framingMode} · ${formatCameraSummary(position, lookAt)}`,
    framedBrushCount,
    message,
  });
}

/**
 * Builds a short camera line for the debug list.
 *
 * @param position Camera world position.
 * @param lookAt Look-at point.
 * @returns Summary string.
 */
function formatCameraSummary(position: THREE.Vector3, lookAt: THREE.Vector3): string {
  return `cam (${formatCoord(position.x)}, ${formatCoord(position.y)}, ${formatCoord(position.z)}) → (${formatCoord(lookAt.x)}, ${formatCoord(lookAt.y)}, ${formatCoord(lookAt.z)})`;
}

/**
 * Formats one coordinate with limited precision for list display.
 *
 * @param value Coordinate component.
 * @returns Rounded string.
 */
function formatCoord(value: number): string {
  return value.toFixed(2);
}
