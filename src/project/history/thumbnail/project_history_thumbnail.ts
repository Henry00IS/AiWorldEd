import * as THREE from 'three';
import { offscreenCaptureRender } from '@/viewports/capture/offscreen_capture.js';
import { fitCaptureCameraToMeshes } from '@/viewports/capture/offscreen_capture_fit.js';
import { offscreenCaptureLevelMeshes } from '@/viewports/capture/offscreen_capture_level.js';
import { isPerspectiveViewport, type ViewportEditor } from '@/viewports/core/viewport_editor.js';
import type {
  ProjectHistoryThumbnailCapture,
  ProjectHistoryThumbnailShot,
} from '@/project/history/store/project_history_recorder.js';
import { ProjectHistoryThumbnailEncoder } from './project_history_thumbnail_encoder.js';

/** Thumbnail edge in pixels. */
export const PROJECT_HISTORY_THUMBNAIL_SIZE = 256;

/** Smallest view edge, in CSS pixels, worth a screen grab. */
const PROJECT_HISTORY_THUMBNAIL_VIEW_MIN = 48;

/** Longest wait for the next frame before falling back to a framed render. */
const PROJECT_HISTORY_THUMBNAIL_FRAME_WAIT_MS = 500;

/** What thumbnails are taken from. */
export interface ProjectHistoryThumbnailHost {
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
export interface ProjectHistoryThumbnailCrop {
  x: number;
  y: number;
  side: number;
}

/** Timings of the last thumbnail, for measurements. */
export interface ProjectHistoryThumbnailTimings {
  source: ProjectHistoryThumbnailShot['source'] | null;
  /** Main-thread time of the grab or framed render. */
  mainMs: number;
  /** Time until the encoded image was ready. */
  totalMs: number;
}

/**
 * Takes Level History thumbnails: a screen grab of the largest Perspective view
 * of the main window (grid, gizmos and tools included, the view's own menus are
 * not part of the canvas), or the whole level framed off-screen on the views'
 * grey when no Perspective view shows.
 */
export class ProjectHistoryThumbnailTaker {
  private readonly host: ProjectHistoryThumbnailHost;
  private readonly encoder = new ProjectHistoryThumbnailEncoder();
  private last: ProjectHistoryThumbnailTimings = { source: null, mainMs: 0, totalMs: 0 };

  /**
   * Creates the taker.
   *
   * @param host Canvas, views and renderer.
   */
  constructor(host: ProjectHistoryThumbnailHost) {
    this.host = host;
  }

  /**
   * Returns the capture function the history records with.
   *
   * @returns Capture.
   */
  capture(): ProjectHistoryThumbnailCapture {
    return () => this.take();
  }

  /**
   * Returns the timings of the last thumbnail.
   *
   * @returns Timings.
   */
  timings(): ProjectHistoryThumbnailTimings {
    return { ...this.last };
  }

  /**
   * Takes one thumbnail.
   *
   * @returns Encoded thumbnail, or null when there is nothing to show.
   */
  async take(): Promise<ProjectHistoryThumbnailShot | null> {
    const started = performance.now();
    const grabbed = await this.viewGrab();
    const bitmap = grabbed ?? (await this.framedRender());
    if (bitmap === null) return null;
    const blob = await this.encoder.encode(bitmap.image);
    this.last = { source: bitmap.source, mainMs: bitmap.mainMs, totalMs: performance.now() - started };
    return blob === null ? null : { blob, source: bitmap.source };
  }

  /**
   * Grabs the largest Perspective view right after the next frame.
   *
   * @returns Bitmap, or null without a usable view or frame.
   */
  private viewGrab(): Promise<ProjectHistoryThumbnailBitmap | null> {
    if (projectHistoryThumbnailView(this.host.viewports(), this.host.canvas()) === null) return Promise.resolve(null);
    return new Promise((resolve) => {
      let waiting = true;
      const timer = setTimeout(() => {
        waiting = false;
        resolve(null);
      }, PROJECT_HISTORY_THUMBNAIL_FRAME_WAIT_MS);
      this.host.afterRender(() => {
        if (!waiting) return;
        clearTimeout(timer);
        resolve(this.viewGrabNow());
      });
    });
  }

  /**
   * Starts the grab of the largest Perspective view from the frame just drawn.
   *
   * @returns Bitmap, or null when no view is usable any more.
   */
  private async viewGrabNow(): Promise<ProjectHistoryThumbnailBitmap | null> {
    const started = performance.now();
    const canvas = this.host.canvas();
    const crop = projectHistoryThumbnailView(this.host.viewports(), canvas);
    if (crop === null) return null;
    const size = PROJECT_HISTORY_THUMBNAIL_SIZE;
    const options: ImageBitmapOptions = { resizeWidth: size, resizeHeight: size, resizeQuality: 'high' };
    const pending = createImageBitmap(canvas, crop.x, crop.y, crop.side, crop.side, options);
    const mainMs = performance.now() - started;
    return { image: await pending, source: 'view', mainMs };
  }

  /**
   * Renders the whole level framed off-screen on the views' grey.
   *
   * @returns Bitmap, or null for an empty level.
   */
  private async framedRender(): Promise<ProjectHistoryThumbnailBitmap | null> {
    const started = performance.now();
    const meshes = offscreenCaptureLevelMeshes(this.host.world());
    if (meshes.length === 0) return null;
    const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 5000);
    const fit = fitCaptureCameraToMeshes(camera, meshes, 'iso', 1.2, undefined);
    camera.position.copy(fit.position);
    camera.up.copy(fit.up);
    camera.lookAt(fit.lookAt);
    const size = PROJECT_HISTORY_THUMBNAIL_SIZE;
    const options = { size, shading: 'solid', includeHelpers: false, matchViewports: true } as const;
    const pixels = offscreenCaptureRender(this.host.renderer(), this.host.scene(), camera, options);
    const pending = createImageBitmap(new ImageData(pixels.rgba, size, size));
    const mainMs = performance.now() - started;
    return { image: await pending, source: 'framed', mainMs };
  }
}

/** A thumbnail bitmap before encoding. */
interface ProjectHistoryThumbnailBitmap {
  image: ImageBitmap;
  source: ProjectHistoryThumbnailShot['source'];
  mainMs: number;
}

/**
 * Finds the largest Perspective view drawn into the canvas and returns the
 * centre square of it, in canvas pixels.
 *
 * @param viewports Views of the main window.
 * @param canvas Shared canvas.
 * @returns Crop, or null when no Perspective view is large enough.
 */
export function projectHistoryThumbnailView(
  viewports: readonly ViewportEditor[],
  canvas: HTMLCanvasElement,
): ProjectHistoryThumbnailCrop | null {
  const bounds = canvas.getBoundingClientRect();
  let best: DOMRect | null = null;
  for (const viewport of viewports) {
    const element = viewport.getContentElement();
    if (!isPerspectiveViewport(viewport) || !element.isConnected || element.ownerDocument !== canvas.ownerDocument)
      continue;
    const rect = element.getBoundingClientRect();
    if (Math.min(rect.width, rect.height) < PROJECT_HISTORY_THUMBNAIL_VIEW_MIN) continue;
    if (best === null || rect.width * rect.height > best.width * best.height) best = rect;
  }
  return best === null || bounds.width <= 0 ? null : projectHistoryThumbnailCrop(best, bounds, canvas.width);
}

/**
 * Returns the centre square of a view in canvas pixels.
 *
 * @param view View rectangle in CSS pixels.
 * @param bounds Canvas rectangle in CSS pixels.
 * @param canvasWidth Canvas width in pixels.
 * @returns Crop.
 */
export function projectHistoryThumbnailCrop(
  view: DOMRectReadOnly,
  bounds: DOMRectReadOnly,
  canvasWidth: number,
): ProjectHistoryThumbnailCrop {
  const scale = canvasWidth / bounds.width;
  const side = Math.min(view.width, view.height) * scale;
  const x = (view.left - bounds.left) * scale + (view.width * scale - side) / 2;
  const y = (view.top - bounds.top) * scale + (view.height * scale - side) / 2;
  return { x: Math.round(x), y: Math.round(y), side: Math.round(side) };
}
