import { CURVE_FILE_MAX_BYTES, curveFileNameIs, curveFileRead } from '@/curve/model/curve_file.js';
import { curveDrawGraphPng } from '@/curve/ui/curve_draw_graph.js';

/** Width of a link preview image, the large Open Graph card size. */
const HOST_COLLABORATION_TRANSFER_THUMBNAIL_WIDTH = 1200;
/** Height of a link preview image. */
const HOST_COLLABORATION_TRANSFER_THUMBNAIL_HEIGHT = 630;

/** Renders the PNG preview of a shared file, or null when it has none. */
export type HostCollaborationTransferThumbnailRender = (file: Blob, name: string) => Promise<Blob | null>;

/**
 * Renders the link preview of a shared .aicurve file: the curve editor's graph,
 * as the chat card shows it, as a PNG.
 *
 * @param file Shared file.
 * @param name File name.
 * @returns PNG, or null for other files and unreadable curves.
 */
export async function hostCollaborationTransferThumbnail(file: Blob, name: string): Promise<Blob | null> {
  if (!curveFileNameIs(name) || file.size > CURVE_FILE_MAX_BYTES) return null;
  const result = curveFileRead(await file.text());
  if ('error' in result) return null;
  return curveDrawGraphPng(
    result.curve,
    HOST_COLLABORATION_TRANSFER_THUMBNAIL_WIDTH,
    HOST_COLLABORATION_TRANSFER_THUMBNAIL_HEIGHT,
  );
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
