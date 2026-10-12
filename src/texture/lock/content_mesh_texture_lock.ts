import * as THREE from 'three';
import { FaceTextureMapping, cloneFaceTextureMapping } from '@/texture/uv/face_texture_mapping.js';
import { getFaceTextureMaps, setFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';
import { computeRegionWorldNormal } from '@/texture/uv/planar_uv_projector.js';
import { fitSurfaceUvMatrixFromWorldSamples } from '@/texture/uv_matrix/surface_uv_matrix_fit.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';

const scratchLocal = new THREE.Vector3();
const scratchWorld = new THREE.Vector3();

/**
 * Rewrites stored face texture UV matrices so a world-space rebake would
 * reproduce the mesh's current vertex UVs. Used when Tex Lock mode changes so
 * content meshes keep their look. Does not modify the UV attribute.
 *
 * @param mesh Content mesh with face texture maps and UV attribute.
 */
export function syncContentMeshFaceMappingsToCurrentUvs(mesh: THREE.Mesh): void {
  if (!mesh.geometry) return;
  const entries = getFaceTextureMaps(mesh);
  if (entries.length === 0) return;
  mesh.updateMatrixWorld(true);
  const nextEntries = entries.map((entry) => ({
    triangleIndices: entry.triangleIndices.slice(),
    mapping: fitFaceMappingToCurrentUvs(mesh, entry.triangleIndices, entry.mapping),
  }));
  setFaceTextureMaps(mesh, nextEntries);
}

/**
 * Returns whether stored face UV matrices rebake to the mesh's current UVs.
 *
 * @param mesh Content mesh with face maps and UV attribute.
 * @returns True when mappings match current UVs within tolerance.
 */
export function contentMeshMappingsMatchCurrentUvs(mesh: THREE.Mesh): boolean {
  if (!mesh.geometry) return false;
  const entries = getFaceTextureMaps(mesh);
  if (entries.length === 0) return true;
  mesh.updateMatrixWorld(true);
  const uv = mesh.geometry.getAttribute('uv');
  const position = mesh.geometry.getAttribute('position');
  if (!uv || !position) return false;
  const index = mesh.geometry.getIndex();
  for (const entry of entries) {
    for (const faceIndex of entry.triangleIndices) {
      for (let corner = 0; corner < 3; corner++) {
        const vertexIndex = index ? index.getX(faceIndex * 3 + corner) : faceIndex * 3 + corner;
        scratchLocal.fromBufferAttribute(position, vertexIndex);
        scratchWorld.copy(scratchLocal).applyMatrix4(mesh.matrixWorld);
        const projected = entry.mapping.uv.project(scratchWorld);
        if (Math.abs(projected.u - uv.getX(vertexIndex)) > 1e-3) return false;
        if (Math.abs(projected.v - uv.getY(vertexIndex)) > 1e-3) return false;
      }
    }
  }
  return true;
}

/**
 * Fits a world-space UV matrix so bake matches current UVs on a face.
 *
 * @param mesh Content mesh.
 * @param triangleIndices Face region triangles.
 * @param mapping Current stored mapping (texture preserved).
 * @returns Mapping with UV matrix fitted to current UVs.
 */
export function fitFaceMappingToCurrentUvs(
  mesh: THREE.Mesh,
  triangleIndices: number[],
  mapping: FaceTextureMapping,
): FaceTextureMapping {
  const samples = collectRegionWorldUvSamples(mesh, triangleIndices);
  if (samples.length < 3) return cloneFaceTextureMapping(mapping);
  const faceNormal = computeRegionWorldNormal(mesh, triangleIndices);
  const fitted = fitUvMatrixFromSamples(samples, faceNormal);
  return {
    textureId: mapping.textureId,
    uv: fitted,
    align: mapping.align ?? 'face',
  };
}

/** One vertex sample with world position and current UV. */
interface WorldUvSample {
  world: THREE.Vector3;
  u: number;
  v: number;
}

/**
 * Collects unique world-position / UV samples for a face region.
 *
 * @param mesh Content mesh.
 * @param triangleIndices Region triangles.
 * @returns Sample list.
 */
function collectRegionWorldUvSamples(mesh: THREE.Mesh, triangleIndices: number[]): WorldUvSample[] {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  if (!position || !uv) return [];
  const index = geometry.getIndex();
  const seen = new Set<number>();
  const samples: WorldUvSample[] = [];
  triangleIndices.forEach((faceIndex) => {
    for (let corner = 0; corner < 3; corner++) {
      const vertexIndex = index ? index.getX(faceIndex * 3 + corner) : faceIndex * 3 + corner;
      if (seen.has(vertexIndex)) continue;
      seen.add(vertexIndex);
      scratchLocal.fromBufferAttribute(position, vertexIndex);
      scratchWorld.copy(scratchLocal).applyMatrix4(mesh.matrixWorld);
      samples.push({
        world: scratchWorld.clone(),
        u: uv.getX(vertexIndex),
        v: uv.getY(vertexIndex),
      });
    }
  });
  return samples;
}

/**
 * Fits a UV matrix from world samples using three non-collinear points.
 *
 * @param samples Region samples.
 * @param faceNormal Face normal.
 * @returns Fitted UV matrix.
 */
function fitUvMatrixFromSamples(samples: WorldUvSample[], faceNormal: THREE.Vector3): SurfaceUvMatrix {
  void faceNormal;
  const fitted = fitSurfaceUvMatrixFromWorldSamples(samples);
  if (!fitted) {
    return SurfaceUvMatrix.identity();
  }
  return fitted;
}
