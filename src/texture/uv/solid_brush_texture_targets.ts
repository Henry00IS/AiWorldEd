import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { SOLID_TRIANGLE_SOURCES_USERDATA_KEY } from '@/solid/model/solid_model_keys.js';
import type { TextureApplyTarget } from './face_texture_applier.js';

/** Per-triangle solid source row on the CSG result mesh. */
interface SolidTriangleSourceRow {
  brushId?: string;
  surfaceIndex?: number;
}

/**
 * Builds UV apply targets for a solid brush preview mesh by mapping each
 * authored brush face to its live result-mesh triangles. Never targets the
 * brush hull itself (hull materials must stay brush helpers).
 *
 * @param brushMesh Selected solid brush preview mesh.
 * @param surfaceIndices Brush faces to target; omit for every face.
 * @returns One target per visible brush face on the result mesh.
 */
export function buildTargetsFromSolidBrushMesh(
  brushMesh: THREE.Mesh,
  surfaceIndices?: readonly number[],
): TextureApplyTarget[] {
  if (!SolidBrushVisual.isBrushObject(brushMesh)) {
    return [];
  }
  const model = SolidModel.fromObject(brushMesh);
  if (!model) {
    return [];
  }
  const brush = model.findBrushByMesh(brushMesh);
  if (!brush) {
    return [];
  }
  const resultMesh = model.getResultMesh();
  const bySurface = collectResultTrianglesByBrushSurface(resultMesh, brush.id);
  if (surfaceIndices)
    for (const surface of bySurface.keys()) if (!surfaceIndices.includes(surface)) bySurface.delete(surface);
  return buildTargetsFromSurfaceTriangleMap(resultMesh, bySurface);
}

/**
 * Returns whether a mesh is a solid brush preview that must not receive content
 * UV rebakes or surface material rebuilds.
 *
 * @param mesh Candidate mesh.
 * @returns True for solid brush helper meshes.
 */
export function isSolidBrushPreviewMesh(mesh: THREE.Mesh): boolean {
  return SolidBrushVisual.isBrushObject(mesh);
}

/**
 * Groups result triangles for one brush id by surface index.
 *
 * @param resultMesh Solid CSG result mesh.
 * @param brushId Brush instance id.
 * @returns Map of surface index to triangle indices.
 */
function collectResultTrianglesByBrushSurface(resultMesh: THREE.Mesh, brushId: string): Map<number, number[]> {
  const sources = readSolidTriangleSources(resultMesh);
  const bySurface = new Map<number, number[]>();
  if (!sources) {
    return bySurface;
  }
  for (let triangleIndex = 0; triangleIndex < sources.length; triangleIndex++) {
    appendTriangleIfOwnedByBrush(sources[triangleIndex], brushId, triangleIndex, bySurface);
  }
  return bySurface;
}

/**
 * Adds one triangle to the surface map when it belongs to the brush.
 *
 * @param source Triangle source row.
 * @param brushId Expected brush id.
 * @param triangleIndex Result triangle index.
 * @param bySurface Accumulator map.
 */
function appendTriangleIfOwnedByBrush(
  source: SolidTriangleSourceRow | undefined,
  brushId: string,
  triangleIndex: number,
  bySurface: Map<number, number[]>,
): void {
  if (!source?.brushId || source.brushId !== brushId) {
    return;
  }
  if (typeof source.surfaceIndex !== 'number') {
    return;
  }
  const list = bySurface.get(source.surfaceIndex);
  if (list) {
    list.push(triangleIndex);
    return;
  }
  bySurface.set(source.surfaceIndex, [triangleIndex]);
}

/**
 * Builds apply targets from a surface-index triangle map.
 *
 * @param resultMesh Solid result mesh.
 * @param bySurface Surface index to triangles.
 * @returns Texture apply targets.
 */
function buildTargetsFromSurfaceTriangleMap(
  resultMesh: THREE.Mesh,
  bySurface: Map<number, number[]>,
): TextureApplyTarget[] {
  const targets: TextureApplyTarget[] = [];
  bySurface.forEach((triangleIndices) => {
    if (triangleIndices.length === 0) {
      return;
    }
    targets.push({
      mesh: resultMesh,
      triangleIndices: triangleIndices.slice(),
      previousMapping: null,
    });
  });
  return targets;
}

/**
 * Reads solid triangle sources from the result mesh.
 *
 * @param resultMesh Solid result mesh.
 * @returns Source rows, or null when missing.
 */
function readSolidTriangleSources(resultMesh: THREE.Mesh): SolidTriangleSourceRow[] | null {
  const raw = resultMesh.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY];
  if (!Array.isArray(raw) || raw.length === 0) {
    return null;
  }
  return raw as SolidTriangleSourceRow[];
}
