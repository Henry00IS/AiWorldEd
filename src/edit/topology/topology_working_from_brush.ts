import * as THREE from 'three';
import { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import type { TopologyWorkingFace } from './topology_working_face.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';

/**
 * Builds working geometry from a solid brush.
 *
 * @param brush Source brush.
 * @returns Working copy.
 */
export function brushToWorkingGeometry(brush: SolidBrush): TopologyWorkingGeometry {
  return {
    positions: brush.vertices.map((vertex) => vertex.clone()),
    faces: readBrushWorkingFaces(brush),
  };
}

/**
 * Rebuilds a solid brush from working geometry face loops.
 *
 * @param geometry Working geometry.
 * @returns New brush, or null when the loops are not a valid solid.
 */
export function workingGeometryToBrush(geometry: TopologyWorkingGeometry): SolidBrush | null {
  const loops = collectBrushFacePositionLoops(geometry);
  return SolidBrushFactory.createFromFaceLoops(loops);
}

/**
 * Reads brush faces as working faces with placeholder UVs.
 *
 * @param brush Source brush.
 * @returns Working faces.
 */
function readBrushWorkingFaces(brush: SolidBrush): TopologyWorkingFace[] {
  const faces: TopologyWorkingFace[] = [];
  for (const face of brush.faces) {
    const vertexIndices = brush.getFaceVertexIndices(face);
    faces.push({
      vertexIndices,
      cornerUvs: createPlaceholderCornerUvs(vertexIndices.length),
      textureId: DEFAULT_CHECKER_TEXTURE_ID,
    });
  }
  return faces;
}

/**
 * Creates zero UVs for brush faces that do not store corner UVs.
 *
 * @param cornerCount Corner count.
 * @returns Placeholder UV list.
 */
function createPlaceholderCornerUvs(cornerCount: number): Array<{ u: number; v: number }> {
  const uvs: Array<{ u: number; v: number }> = [];
  for (let index = 0; index < cornerCount; index++) {
    uvs.push({ u: 0, v: 0 });
  }
  return uvs;
}

/**
 * Collects face loops as world/local point rings for brush rebuild.
 *
 * @param geometry Working geometry.
 * @returns Position rings.
 */
function collectBrushFacePositionLoops(geometry: TopologyWorkingGeometry): THREE.Vector3[][] {
  const loops: THREE.Vector3[][] = [];
  for (const face of geometry.faces) {
    const loop = collectOneBrushFaceLoop(geometry, face);
    if (loop) {
      loops.push(loop);
    }
  }
  return loops;
}

/**
 * Collects one face loop as positions.
 *
 * @param geometry Working geometry.
 * @param face Working face.
 * @returns Position ring, or null when a vertex is missing.
 */
function collectOneBrushFaceLoop(geometry: TopologyWorkingGeometry, face: TopologyWorkingFace): THREE.Vector3[] | null {
  const loop: THREE.Vector3[] = [];
  for (const vertexIndex of face.vertexIndices) {
    const position = geometry.positions[vertexIndex];
    if (!position) {
      return null;
    }
    loop.push(position.clone());
  }
  if (loop.length < 3) {
    return null;
  }
  return loop;
}
