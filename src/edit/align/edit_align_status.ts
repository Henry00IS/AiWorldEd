import type { EditAlignRequest } from './edit_align_request.js';

/**
 * Builds the status bar text that reports an Edit Mode alignment.
 *
 * @param request Alignment that ran.
 * @param movedVertexCount Selected vertex count, 0 when nothing moved, or -1
 *   when nothing was selected.
 * @returns Status text.
 */
export function editAlignStatusMessage(request: EditAlignRequest, movedVertexCount: number): string {
  if (movedVertexCount < 0) return 'Select vertices, edges or faces to align';
  if (movedVertexCount === 0) return 'Selection is already aligned';
  const vertices = movedVertexCount === 1 ? '1 vertex' : `${movedVertexCount} vertices`;
  if (request.kind === 'grid') return `Aligned ${vertices} to the grid`;
  return `Aligned ${vertices} to their ${editAlignAnchorWords[request.anchor]} ${request.axis.toUpperCase()}`;
}

/** Status words of each axis anchor. */
const editAlignAnchorWords = { min: 'minimum', center: 'center', max: 'maximum' } as const;
