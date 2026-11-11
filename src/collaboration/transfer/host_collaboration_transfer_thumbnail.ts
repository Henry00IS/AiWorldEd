import { CURVE_FILE_MAX_BYTES, curveFileNameIs, curveFileRead } from '@/curve/model/curve_file.js';
import { curveDrawGraphPng } from '@/curve/ui/curve_draw_graph.js';
import { sceneFileNameIs } from '@/io/scene_file/scene_file_extension.js';
import { sceneFileThumbnailRead } from '@/io/scene_file/scene_file_thumbnail.js';
import {
  OFFSCREEN_CAPTURE_LETTERBOX_HEIGHT,
  OFFSCREEN_CAPTURE_LETTERBOX_WIDTH,
  offscreenCaptureLetterboxBlob,
} from '@/viewports/capture/offscreen_capture_letterbox.js';

/** Renders the PNG preview of a shared file, or null when it has none. */
export type HostCollaborationTransferThumbnailRender = (file: Blob, name: string) => Promise<Blob | null>;

/**
 * Renders the link preview of a shared file: a letterboxed level thumbnail for
 * an .aiworld file, or the curve editor's graph for an .aicurve file, as a
 * PNG.
 *
 * @param file Shared file.
 * @param name File name.
 * @returns PNG, or null for other files and files with no preview.
 */
export async function hostCollaborationTransferThumbnail(file: Blob, name: string): Promise<Blob | null> {
  if (sceneFileNameIs(name)) return hostCollaborationTransferLevelThumbnail(file);
  if (!curveFileNameIs(name) || file.size > CURVE_FILE_MAX_BYTES) return null;
  const result = curveFileRead(await file.text());
  if ('error' in result) return null;
  return curveDrawGraphPng(result.curve, OFFSCREEN_CAPTURE_LETTERBOX_WIDTH, OFFSCREEN_CAPTURE_LETTERBOX_HEIGHT);
}

/**
 * Renders the letterboxed PNG preview of a shared level file.
 *
 * @param file Shared .aiworld file.
 * @returns PNG, or null when the file has no thumbnail.
 */
async function hostCollaborationTransferLevelThumbnail(file: Blob): Promise<Blob | null> {
  const thumbnail = await sceneFileThumbnailRead(file);
  return thumbnail === null ? null : offscreenCaptureLetterboxBlob(thumbnail);
}

/**
 * Returns the announced name of a file's preview.
 *
 * @param name File name.
 * @returns Name with a .png extension.
 */
export function hostCollaborationTransferThumbnailName(name: string): string {
  return `${name.replace(/\.[^./\\]*$/u, '')}.png`;
}
