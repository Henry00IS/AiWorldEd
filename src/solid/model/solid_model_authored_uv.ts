import type { Object3D } from 'three';
import type { FaceTextureMapping } from '@/texture/uv/face_texture_mapping.js';
import { convertWorldFaceMappingToBrushLocal } from '@/solid/brush/solid_brush_uv_space.js';
import type { SolidBrushInstance } from './solid_brush_instance.js';
import { solidTriangleSourceIsDerived } from './solid_triangle_source_derived.js';

/** Per-triangle source linking a result triangle to a brush face. */
export type SolidTriangleSource = {
  brushId: string;
  surfaceIndex: number;
  derivedId?: string;
};

/**
 * Applies one result-mesh mapping to every unique brush face that owns the
 * given result triangles.
 *
 * @param triangleIndices Result triangle indices for the region.
 * @param mapping Authored mapping from the UV editor or texture tools.
 * @param sources Per-triangle brush surface sources.
 * @param findBrush Resolves a brush instance by id.
 * @param solidRoot Solid model root used for world-to-local conversion.
 */
export function writeMapEntryToBrushFaces(
  triangleIndices: number[],
  mapping: FaceTextureMapping,
  sources: readonly SolidTriangleSource[],
  findBrush: (brushId: string) => SolidBrushInstance | undefined,
  solidRoot: Object3D,
): void {
  const written = new Set<string>();
  for (const triangleIndex of triangleIndices) {
    writeOneTriangleSourceMapping(triangleIndex, mapping, sources, written, findBrush, solidRoot);
  }
}

/**
 * Writes mapping for a single triangle source if not already written this pass.
 * Triangles of modifier outputs are skipped: their mapping lives in the copy's
 * mirrored or moved frame and would corrupt the authored source face.
 *
 * @param triangleIndex Result triangle index.
 * @param mapping Authored mapping.
 * @param sources Per-triangle brush surface sources.
 * @param written Keys already written this pass.
 * @param findBrush Resolves a brush instance by id.
 * @param solidRoot Solid model root used for world-to-local conversion.
 */
function writeOneTriangleSourceMapping(
  triangleIndex: number,
  mapping: FaceTextureMapping,
  sources: readonly SolidTriangleSource[],
  written: Set<string>,
  findBrush: (brushId: string) => SolidBrushInstance | undefined,
  solidRoot: Object3D,
): void {
  const source = sources[triangleIndex];
  if (!source?.brushId || solidTriangleSourceIsDerived(source)) return;
  const key = `${source.brushId}:${source.surfaceIndex}`;
  if (written.has(key)) return;
  written.add(key);
  const brush = findBrush(source.brushId);
  if (!brush) return;
  const localMapping = convertWorldFaceMappingToBrushLocal(mapping, brush, solidRoot);
  brush.setFaceMapping(source.surfaceIndex, localMapping);
}

/**
 * Collects unique brush ids that own the given result triangles.
 *
 * @param triangleIndices Result triangle indices.
 * @param sources Per-triangle brush surface sources.
 * @returns Set of brush ids.
 */
export function collectBrushIdsForTriangles(
  triangleIndices: readonly number[],
  sources: readonly SolidTriangleSource[],
): Set<string> {
  const brushIds = new Set<string>();
  for (const triangleIndex of triangleIndices) {
    const source = sources[triangleIndex];
    if (source?.brushId) brushIds.add(source.brushId);
  }
  return brushIds;
}
