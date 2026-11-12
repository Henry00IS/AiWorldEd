import * as THREE from 'three';
import { offscreenCaptureRender } from '@/viewports/capture/offscreen_capture.js';
import { fitCaptureCameraToMeshes } from '@/viewports/capture/offscreen_capture_fit.js';
import { offscreenCaptureLevelMeshes } from '@/viewports/capture/offscreen_capture_level.js';
import { isPerspectiveViewport, type ViewportEditor } from '@/viewports/core/viewport_editor.js';
import { OffscreenCaptureThumbnailEncoder } from '@/viewports/capture/offscreen_capture_thumbnail_encoder.js';
import { sceneFileThumbnailAccept } from '@/io/scene_file/scene_file_thumbnail.js';

/** Thumbnail edge in pixels. */
export const OFFSCREEN_CAPTURE_THUMBNAIL_SIZE = 256;

/** Smallest view edge, in CSS pixels, worth a screen grab. */
const OFFSCREEN_CAPTURE_THUMBNAIL_VIEW_MIN = 48;

/** Longest wait for the next frame before falling back to a framed render. */
const OFFSCREEN_CAPTURE_THUMBNAIL_FRAME_WAIT_MS = 500;

/** What thumbnails are taken from. */
export interface OffscreenCaptureThumbnailHost {
  /** Shared canvas every main-window view draws into. */
  canvas(): HTMLCanvasElement;
  /** Views of the main window. */
  viewports(): readonly ViewportEditor[];
  /** Runs work once, right after the next frame was drawn. */
  afterRender(run: () => void): void;
  renderer(): THREE.WebGLRenderer;
  scene(): THREE.Scene;
  /** Level root. */
  world(): THREE.Object3D;
}

/** Square of the canvas to grab, in canvas pixels. */
export interface OffscreenCaptureThumbnailCrop {
  x: number;
  y: number;
  side: number;
}

/** A thumbnail bitmap before encoding. */
interface OffscreenCaptureThumbnailBitmap {
  image: ImageBitmap;
}

/**
 * Takes level thumbnails: a screen grab of the largest Perspective view of the
 * main window, or the whole level framed off-screen on the views' grey when no
 * Perspective view shows. Encoding runs in a worker so the save is not stalled
 * by WebP compression.
 */
export class OffscreenCaptureThumbnailTaker {
  private readonly host: OffscreenCaptureThumbnailHost;
  private readonly encoder = new OffscreenCaptureThumbnailEncoder();

  /**
   * Creates the taker.
   *
   * @param host Canvas, views and renderer.
   */
  constructor(host: OffscreenCaptureThumbnailHost) {
    this.host = host;
  }

  /**
   * Takes one thumbnail, or null when there is nothing to show or encoding
   * failed or the image is larger than the file entry cap.
   *
   * @returns WebP image, or null.
   */
  async take(): Promise<Blob | null> {
    const grabbed = await this.viewGrab();
    const bitmap = grabbed ?? (await this.framedRender());
    if (bitmap === null) return null;
    return sceneFileThumbnailAccept(await this.encoder.encode(bitmap.image));
  }

  /**
   * Grabs the largest Perspective view right after the next frame.
   *
   * @returns Bitmap, or null without a usable view or frame.
   */
  private viewGrab(): Promise<OffscreenCaptureThumbnailBitmap | null> {
    if (offscreenCaptureThumbnailView(this.host.viewports(), this.host.canvas()) === null) return Promise.resolve(null);
    return this.viewGrabWait();
  }

  /**
   * Waits for the next drawn frame, then grabs the view, or gives up.
   *
   * @returns Bitmap, or null when the frame did not arrive in time.
   */
  private viewGrabWait(): Promise<OffscreenCaptureThumbnailBitmap | null> {
    return new Promise((resolve) => {
      let waiting = true;
      const timer = setTimeout(() => {
        waiting = false;
        resolve(null);
      }, OFFSCREEN_CAPTURE_THUMBNAIL_FRAME_WAIT_MS);
      this.host.afterRender(() => {
        if (!waiting) return;
        clearTimeout(timer);
        void this.viewGrabNow().then(resolve);
      });
    });
  }

  /**
   * Starts the grab of the largest Perspective view from the frame just drawn.
   *
   * @returns Bitmap, or null when no view is usable any more.
   */
  private async viewGrabNow(): Promise<OffscreenCaptureThumbnailBitmap | null> {
    const canvas = this.host.canvas();
    const crop = offscreenCaptureThumbnailView(this.host.viewports(), canvas);
    if (crop === null) return null;
    const size = OFFSCREEN_CAPTURE_THUMBNAIL_SIZE;
    const options: ImageBitmapOptions = { resizeWidth: size, resizeHeight: size, resizeQuality: 'high' };
    return { image: await createImageBitmap(canvas, crop.x, crop.y, crop.side, crop.side, options) };
  }

  /**
   * Renders the whole level framed off-screen on the views' grey.
   *
   * @returns Bitmap, or null for an empty level.
   */
  private async framedRender(): Promise<OffscreenCaptureThumbnailBitmap | null> {
    const camera = offscreenCaptureThumbnailFramedCamera(this.host.world());
    if (camera === null) return null;
    const size = OFFSCREEN_CAPTURE_THUMBNAIL_SIZE;
    const options = { size, shading: 'solid', includeHelpers: false, matchViewports: true } as const;
    const pixels = offscreenCaptureRender(this.host.renderer(), this.host.scene(), camera, options);
    return { image: await createImageBitmap(new ImageData(pixels.rgba, size, size)) };
  }
}

/**
 * Poses a perspective camera that frames the level, or null when empty.
 *
 * @param world Level root.
 * @returns Posed camera, or null.
 */
function offscreenCaptureThumbnailFramedCamera(world: THREE.Object3D): THREE.PerspectiveCamera | null {
  const meshes = offscreenCaptureLevelMeshes(world);
  if (meshes.length === 0) return null;
  const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 5000);
  const fit = fitCaptureCameraToMeshes(camera, meshes, 'iso', 1.2, undefined);
  camera.position.copy(fit.position);
  camera.up.copy(fit.up);
  camera.lookAt(fit.lookAt);
  return camera;
}

/**
 * Finds the largest Perspective view drawn into the canvas and returns the
 * centre square of it, in canvas pixels.
 *
 * @param viewports Views of the main window.
 * @param canvas Shared canvas.
 * @returns Crop, or null when no Perspective view is large enough.
 */
export function offscreenCaptureThumbnailView(
  viewports: readonly ViewportEditor[],
  canvas: HTMLCanvasElement,
): OffscreenCaptureThumbnailCrop | null {
  const bounds = canvas.getBoundingClientRect();
  const view = offscreenCaptureThumbnailLargestView(viewports, canvas);
  return view === null || bounds.width <= 0 ? null : offscreenCaptureThumbnailCrop(view, bounds, canvas.width);
}

/**
 * Finds the largest connected Perspective view in the canvas's document.
 *
 * @param viewports Views of the main window.
 * @param canvas Shared canvas.
 * @returns View rectangle, or null.
 */
function offscreenCaptureThumbnailLargestView(
  viewports: readonly ViewportEditor[],
  canvas: HTMLCanvasElement,
): DOMRect | null {
  let best: DOMRect | null = null;
  for (const viewport of viewports) {
    const rect = offscreenCaptureThumbnailViewRect(viewport, canvas);
    if (rect === null) continue;
    if (best === null || rect.width * rect.height > best.width * best.height) best = rect;
  }
  return best;
}

/**
 * Returns the rectangle of a Perspective view when it is large enough and drawn
 * into the same document as the canvas.
 *
 * @param viewport View.
 * @param canvas Shared canvas.
 * @returns Rectangle, or null.
 */
function offscreenCaptureThumbnailViewRect(viewport: ViewportEditor, canvas: HTMLCanvasElement): DOMRect | null {
  const element = viewport.getContentElement();
  if (!isPerspectiveViewport(viewport) || !element.isConnected || element.ownerDocument !== canvas.ownerDocument)
    return null;
  const rect = element.getBoundingClientRect();
  return Math.min(rect.width, rect.height) < OFFSCREEN_CAPTURE_THUMBNAIL_VIEW_MIN ? null : rect;
}

/**
 * Returns the centre square of a view in canvas pixels.
 *
 * @param view View rectangle in CSS pixels.
 * @param bounds Canvas rectangle in CSS pixels.
 * @param canvasWidth Canvas width in pixels.
 * @returns Crop.
 */
export function offscreenCaptureThumbnailCrop(
  view: DOMRectReadOnly,
  bounds: DOMRectReadOnly,
  canvasWidth: number,
): OffscreenCaptureThumbnailCrop {
  const scale = canvasWidth / bounds.width;
  const side = Math.min(view.width, view.height) * scale;
  const x = (view.left - bounds.left) * scale + (view.width * scale - side) / 2;
  const y = (view.top - bounds.top) * scale + (view.height * scale - side) / 2;
  return { x: Math.round(x), y: Math.round(y), side: Math.round(side) };
}
