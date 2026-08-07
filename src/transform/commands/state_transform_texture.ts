import * as THREE from 'three';
import { FaceTextureMapEntry, cloneFaceTextureMapEntry } from '@/texture/uv/face_texture_mapping.js';
import { getFaceTextureMaps, setFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { isContentMeshEligibleForTextureLockRebake } from '@/texture/lock/texture_lock_settings.js';
import type { FaceSurfaceDescriptionSerialized } from '@/texture/uv_matrix/face_surface_description.js';

/** Serialized solid-brush face surface state for one mesh. */
export interface SolidBrushTransformTextureSnapshot {
  kind: 'solid';
  mesh: THREE.Mesh;
  brushId: string;
  defaultSurface: FaceSurfaceDescriptionSerialized;
  faceSurfaces: (FaceSurfaceDescriptionSerialized | undefined)[];
  /** Optional legacy planar default mapping. */
  defaultMapping?: unknown;
  faceMappings?: unknown[];
}

/** Face texture maps and UV attribute values for one content mesh. */
export interface ContentMeshTransformTextureSnapshot {
  kind: 'content';
  mesh: THREE.Mesh;
  maps: FaceTextureMapEntry[];
  uvArray: Float32Array | null;
}

/** Texture state snapshot for one mesh. */
export type TransformTextureSnapshot = SolidBrushTransformTextureSnapshot | ContentMeshTransformTextureSnapshot;

/**
 * Builds texture snapshots for each mesh that is a solid brush or eligible
 * content mesh.
 *
 * @param meshes Meshes to capture texture state from.
 * @returns Snapshots only for meshes that produced a solid or content capture.
 */
export function captureTransformTextureState(meshes: readonly THREE.Mesh[]): TransformTextureSnapshot[] {
  const snapshots: TransformTextureSnapshot[] = [];
  for (const mesh of meshes) {
    const solid = captureSolidBrushTexture(mesh);
    if (solid) {
      snapshots.push(solid);
      continue;
    }
    const content = captureContentMeshTexture(mesh);
    if (content) snapshots.push(content);
  }
  return snapshots;
}

/**
 * Applies each snapshot to its mesh according to the snapshot kind.
 *
 * @param snapshots Texture snapshots to apply.
 */
export function restoreTransformTextureState(snapshots: readonly TransformTextureSnapshot[]): void {
  for (const snapshot of snapshots) {
    if (snapshot.kind === 'solid') {
      restoreSolidBrushTexture(snapshot);
      continue;
    }
    restoreContentMeshTexture(snapshot);
  }
}

/**
 * Captures serialized default and per-face surfaces for a solid brush mesh.
 *
 * @param mesh Mesh that may belong to a solid brush.
 * @returns Snapshot when the mesh is a solid brush with a resolvable model
 *   brush; otherwise null.
 */
function captureSolidBrushTexture(mesh: THREE.Mesh): SolidBrushTransformTextureSnapshot | null {
  if (!SolidBrushVisual.isBrushObject(mesh)) return null;
  const model = SolidModel.fromObject(mesh);
  if (!model) return null;
  const brush = model.findBrushByMesh(mesh);
  if (!brush) return null;
  return {
    kind: 'solid',
    mesh,
    brushId: brush.id,
    defaultSurface: brush.serializeDefaultSurface(),
    faceSurfaces: brush.serializeFaceSurfaces(),
  };
}

/**
 * Captures cloned face texture maps and a copy of the UV attribute array for a
 * content mesh.
 *
 * @param mesh Mesh that may be ordinary content geometry.
 * @returns Snapshot when the mesh is eligible content with geometry; otherwise
 *   null.
 */
function captureContentMeshTexture(mesh: THREE.Mesh): ContentMeshTransformTextureSnapshot | null {
  if (!isContentMeshEligibleForTextureLockRebake(mesh)) return null;
  if (!mesh.geometry) return null;
  const maps = getFaceTextureMaps(mesh).map((entry) => cloneFaceTextureMapEntry(entry));
  const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute | null;
  const uvArray = uv ? new Float32Array(uv.array as ArrayLike<number>) : null;
  return { kind: 'content', mesh, maps, uvArray };
}

/**
 * Restores default and per-face surface serializations onto a solid brush from
 * a snapshot.
 *
 * @param snapshot Solid brush texture snapshot to apply.
 */
function restoreSolidBrushTexture(snapshot: SolidBrushTransformTextureSnapshot): void {
  const model = SolidModel.fromObject(snapshot.mesh);
  if (!model) return;
  const brush = model.findBrush(snapshot.brushId) ?? model.findBrushByMesh(snapshot.mesh);
  if (!brush) return;
  if (snapshot.defaultSurface || snapshot.faceSurfaces) {
    brush.restoreFaceSurfaces(snapshot.defaultSurface, snapshot.faceSurfaces);
  }
}

/**
 * Restores face texture maps and the UV attribute onto a content mesh from a
 * snapshot.
 *
 * @param snapshot Content mesh texture snapshot to apply.
 */
function restoreContentMeshTexture(snapshot: ContentMeshTransformTextureSnapshot): void {
  setFaceTextureMaps(snapshot.mesh, snapshot.maps);
  if (!snapshot.uvArray) return;
  const uv = snapshot.mesh.geometry.getAttribute('uv') as THREE.BufferAttribute | null;
  if (uv && uv.array.length === snapshot.uvArray.length) {
    (uv.array as Float32Array).set(snapshot.uvArray);
    uv.needsUpdate = true;
    return;
  }
  snapshot.mesh.geometry.setAttribute('uv', new THREE.BufferAttribute(snapshot.uvArray.slice(), 2));
}
