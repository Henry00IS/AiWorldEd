import * as THREE from 'three';
import { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidPlane } from '@/solid/brush/solid_plane.js';
import { SolidBrushVisual } from './solid_brush_visual.js';
import { findSolidModelRoot } from './solid_group.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import { FaceTextureMapping, FaceTextureMappingWithTrs } from '@/texture/uv/face_texture_mapping.js';
import {
  FaceSurfaceDescription,
  FaceSurfaceDescriptionSerialized,
  cloneFaceSurface,
  createDefaultFaceSurface,
  deserializeFaceSurface,
  serializeFaceSurface,
} from '@/texture/uv_matrix/face_surface_description.js';
import {
  faceTextureMappingToSurface,
  surfaceToFaceTextureMapping,
} from '@/texture/uv_matrix/legacy_mapping_migrate.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';

const scratchLocalMatrix = new THREE.Matrix4();
const scratchLocalQuaternion = new THREE.Quaternion();
const scratchModelMatrix = new THREE.Matrix4();
const scratchRootInverse = new THREE.Matrix4();

/**
 * Composes a TRS matrix into a shared scratch and returns a clone for callers
 * that retain the matrix.
 *
 * @param position Local position.
 * @param rotation Local rotation.
 * @param scale Local scale.
 * @returns Independent matrix.
 */
function composeLocalMatrix(position: THREE.Vector3, rotation: THREE.Euler, scale: THREE.Vector3): THREE.Matrix4 {
  scratchLocalQuaternion.setFromEuler(rotation);
  return scratchLocalMatrix.compose(position, scratchLocalQuaternion, scale).clone();
}

/**
 * A brush placed inside a solid model with local transform and CSG operation.
 * Surface texture and UV matrix are authored per brush face in brush-local
 * space and baked into the compiled result mesh on rebuild.
 */
export class SolidBrushInstance {
  readonly id: string;
  name: string;
  operation: SolidOperation;
  brush: SolidBrush;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  visible: boolean;
  mesh: THREE.Mesh | null;
  /** Default surface for faces without a per-face override. */
  private defaultSurface: FaceSurfaceDescription;
  /** Sparse per-face surface overrides (index matches brush.faces). */
  private faceSurfaces: (FaceSurfaceDescription | undefined)[];

  /**
   * Creates a solid brush instance.
   *
   * @param id Stable unique identifier.
   * @param name Display name.
   * @param brush Local convex brush geometry.
   * @param operation CSG operation for this brush.
   */
  constructor(id: string, name: string, brush: SolidBrush, operation: SolidOperation = SolidOperation.Additive) {
    this.id = id;
    this.name = name;
    this.brush = brush;
    this.operation = operation;
    this.position = new THREE.Vector3();
    this.rotation = new THREE.Euler(0, 0, 0, 'XYZ');
    this.scale = new THREE.Vector3(1, 1, 1);
    this.visible = true;
    this.mesh = null;
    this.defaultSurface = createDefaultFaceSurface(DEFAULT_CHECKER_TEXTURE_ID);
    this.faceSurfaces = [];
  }

  /**
   * Default surface texture identity for faces without overrides.
   *
   * @returns Texture id string.
   */
  get surfaceTextureId(): string {
    return this.defaultSurface.textureId;
  }

  /**
   * Sets the default surface texture identity (does not clear face overrides).
   *
   * @param textureId Texture identity.
   */
  set surfaceTextureId(textureId: string) {
    this.defaultSurface.textureId = textureId || DEFAULT_CHECKER_TEXTURE_ID;
  }

  /**
   * Returns the authored face surface (texture + UV matrix) for a brush face.
   *
   * @param surfaceIndex Brush face index.
   * @returns Cloned face surface description.
   */
  getFaceSurface(surfaceIndex: number): FaceSurfaceDescription {
    const override = this.faceSurfaces[surfaceIndex];
    if (override) return cloneFaceSurface(override);
    return this.buildDefaultFaceSurface(surfaceIndex);
  }

  /**
   * Sets the full face surface for one brush face.
   *
   * @param surfaceIndex Brush face index.
   * @param surface Surface to store (cloned).
   */
  setFaceSurface(surfaceIndex: number, surface: FaceSurfaceDescription): void {
    if (surfaceIndex < 0) return;
    this.faceSurfaces[surfaceIndex] = cloneFaceSurface(surface);
  }

  /**
   * Returns the full UV/texture mapping for a brush face (texture + UV matrix).
   *
   * @param surfaceIndex Brush face index.
   * @returns Cloned face texture mapping.
   */
  getSurfaceMapping(surfaceIndex: number): FaceTextureMappingWithTrs {
    const surface = this.getFaceSurface(surfaceIndex);
    return surfaceToFaceTextureMapping(surface, this.faceNormalLocal(surfaceIndex));
  }

  /**
   * Returns the texture id for a brush face (per-face override or default).
   * Avoids cloning full face UV matrices.
   *
   * @param surfaceIndex Brush face index.
   * @returns Texture identity string.
   */
  getSurfaceTextureId(surfaceIndex: number): string {
    const override = this.faceSurfaces[surfaceIndex];
    if (override) return override.textureId;
    return this.defaultSurface.textureId || DEFAULT_CHECKER_TEXTURE_ID;
  }

  /**
   * Sets one brush face texture, preserving existing UV matrix.
   *
   * @param surfaceIndex Brush face index.
   * @param textureId Texture identity.
   */
  setFaceTextureId(surfaceIndex: number, textureId: string): void {
    if (surfaceIndex < 0) return;
    const surface = this.getFaceSurface(surfaceIndex);
    surface.textureId = textureId || DEFAULT_CHECKER_TEXTURE_ID;
    this.faceSurfaces[surfaceIndex] = surface;
  }

  /**
   * Sets the full UV/texture mapping for one brush face (stores UV matrix).
   *
   * @param surfaceIndex Brush face index.
   * @param mapping Mapping to store (cloned).
   */
  setFaceMapping(surfaceIndex: number, mapping: FaceTextureMapping): void {
    if (surfaceIndex < 0) return;
    this.faceSurfaces[surfaceIndex] = faceTextureMappingToSurface(mapping, this.faceNormalLocal(surfaceIndex));
  }

  /**
   * Sets the texture id on the default surface and every per-face override
   * while preserving all existing UV matrices.
   *
   * @param textureId Texture identity.
   */
  setAllFacesTextureId(textureId: string): void {
    const resolvedTextureId = textureId || DEFAULT_CHECKER_TEXTURE_ID;
    this.defaultSurface.textureId = resolvedTextureId;
    this.faceSurfacesTextureIdUpdateAll(resolvedTextureId);
  }

  /**
   * Sets the default surface texture without clearing per-face overrides.
   *
   * @param textureId Texture identity.
   */
  setSurfaceTextureIdOnly(textureId: string): void {
    this.defaultSurface.textureId = textureId || DEFAULT_CHECKER_TEXTURE_ID;
  }

  /**
   * Writes a texture id onto every existing per-face surface override.
   *
   * @param textureId Texture identity to apply.
   */
  private faceSurfacesTextureIdUpdateAll(textureId: string): void {
    for (let faceIndex = 0; faceIndex < this.faceSurfaces.length; faceIndex++) {
      const surface = this.faceSurfaces[faceIndex];
      if (!surface) {
        continue;
      }
      surface.textureId = textureId;
    }
  }

  /**
   * Serializes per-face texture overrides for legacy persistence.
   *
   * @returns Sparse face texture id list.
   */
  serializeFaceTextureIds(): (string | undefined)[] {
    return this.faceSurfaces.map((surface) => surface?.textureId);
  }

  /**
   * Restores per-face texture overrides from persistence (texture id only).
   *
   * @param ids Sparse face texture id list.
   */
  restoreFaceTextureIds(ids: (string | undefined)[] | undefined): void {
    if (!ids) {
      this.faceSurfaces = [];
      return;
    }
    this.faceSurfaces = ids.map((textureId) => {
      if (typeof textureId !== 'string' || textureId.length === 0) {
        return undefined;
      }
      return createDefaultFaceSurface(textureId);
    });
  }

  /**
   * Serializes full per-face surfaces for scene persistence.
   *
   * @returns Sparse list of serialized face surfaces.
   */
  serializeFaceSurfaces(): (FaceSurfaceDescriptionSerialized | undefined)[] {
    return this.faceSurfaces.map((surface) => (surface ? serializeFaceSurface(surface) : undefined));
  }

  /**
   * Serializes the default surface for scene persistence.
   *
   * @returns Serialized default surface.
   */
  serializeDefaultSurface(): FaceSurfaceDescriptionSerialized {
    return serializeFaceSurface(this.defaultSurface);
  }

  /**
   * Serializes full per-face UV mappings for legacy scene persistence.
   *
   * @returns Sparse list of face mappings.
   */
  serializeFaceMappings(): (FaceTextureMapping | undefined)[] {
    return this.faceSurfaces.map((surface, index) => {
      if (!surface) return undefined;
      return surfaceToFaceTextureMapping(surface, this.faceNormalLocal(index));
    });
  }

  /**
   * Serializes the default surface mapping for legacy scene persistence.
   *
   * @returns Cloned default mapping with UV matrix.
   */
  serializeDefaultMapping(): FaceTextureMapping {
    return surfaceToFaceTextureMapping(this.defaultSurface, new THREE.Vector3(0, 1, 0));
  }

  /**
   * Restores default and per-face UV surfaces from matrix serialization.
   *
   * @param defaultSurface Optional default surface.
   * @param faceSurfaces Optional sparse per-face surfaces.
   */
  restoreFaceSurfaces(
    defaultSurface: FaceSurfaceDescriptionSerialized | FaceSurfaceDescription | undefined,
    faceSurfaces: (FaceSurfaceDescriptionSerialized | FaceSurfaceDescription | undefined)[] | undefined,
  ): void {
    this.defaultSurface = this.coerceSurface(defaultSurface, new THREE.Vector3(0, 1, 0));
    this.faceSurfaces = faceSurfaces
      ? faceSurfaces.map((surface, index) =>
          surface ? this.coerceSurface(surface, this.faceNormalLocal(index)) : undefined,
        )
      : [];
  }

  /**
   * Restores default and per-face UV mappings from legacy planar form.
   *
   * @param defaultMapping Optional default mapping.
   * @param faceMappings Optional sparse per-face mappings.
   */
  restoreFaceMappings(
    defaultMapping: FaceTextureMapping | undefined,
    faceMappings: (FaceTextureMapping | undefined)[] | undefined,
  ): void {
    this.defaultSurface = defaultMapping
      ? faceTextureMappingToSurface(defaultMapping, new THREE.Vector3(0, 1, 0))
      : createDefaultFaceSurface(DEFAULT_CHECKER_TEXTURE_ID);
    if (!this.defaultSurface.textureId) {
      this.defaultSurface.textureId = DEFAULT_CHECKER_TEXTURE_ID;
    }
    this.faceSurfaces = faceMappings
      ? faceMappings.map((mapping, index) =>
          mapping ? faceTextureMappingToSurface(mapping, this.faceNormalLocal(index)) : undefined,
        )
      : [];
  }

  /**
   * Restores prior face texture id list and default texture without full maps.
   *
   * @param defaultTextureId Default surface texture id.
   * @param faceTextureIds Sparse per-face texture ids.
   */
  restoreTextureIdsOnly(defaultTextureId: string, faceTextureIds: (string | undefined)[]): void {
    this.defaultSurface.textureId = defaultTextureId || DEFAULT_CHECKER_TEXTURE_ID;
    this.faceSurfaces = faceTextureIds.map((textureId, index) => {
      if (typeof textureId !== 'string' || textureId.length === 0) {
        return undefined;
      }
      const existing = this.faceSurfaces[index];
      if (existing) {
        const copy = cloneFaceSurface(existing);
        copy.textureId = textureId;
        return copy;
      }
      return createDefaultFaceSurface(textureId);
    });
  }

  /**
   * Attaches a scene preview mesh and stamps brush identity metadata.
   *
   * @param mesh Preview mesh owned by the solid model hierarchy.
   */
  attachMesh(mesh: THREE.Mesh): void {
    this.mesh = mesh;
    mesh.name = this.name;
    SolidBrushVisual.stampBrushHelperMetadata(mesh);
    SolidBrushVisual.setBrushId(mesh, this.id);
    this.pushTransformToMesh();
    SolidBrushVisual.applyOperationStyle(mesh, this.operation);
  }

  /**
   * Copies transform and name from the scene mesh into this instance. Uses the
   * mesh Euler (not quaternion re-extraction) so yaw values such as π − θ from
   * Z-mirror stay as written instead of an equivalent XYZ dual form.
   */
  pullTransformFromMesh(): void {
    if (!this.mesh) return;
    this.position.copy(this.mesh.position);
    this.rotation.copy(this.mesh.rotation);
    this.scale.copy(this.mesh.scale);
    this.name = this.mesh.name;
    this.visible = this.mesh.visible;
  }

  /** Pushes this instance's transform and name onto the scene mesh. */
  pushTransformToMesh(): void {
    if (!this.mesh) return;
    this.mesh.position.copy(this.position);
    this.mesh.rotation.copy(this.rotation);
    this.mesh.scale.copy(this.scale);
    this.mesh.name = this.name;
    this.mesh.visible = this.visible;
  }

  /**
   * Builds the local-to-parent matrix for this instance (mesh local pose).
   *
   * @returns Transform matrix relative to the mesh parent.
   */
  getLocalMatrix(): THREE.Matrix4 {
    this.pullTransformFromMesh();
    return composeLocalMatrix(this.position, this.rotation, this.scale);
  }

  /**
   * Returns whether this brush mesh sits under intermediate solid CSG groups
   * rather than as a direct child of the solid model root.
   *
   * @returns True when the mesh parent is not the solid model root.
   */
  isNestedUnderSolidGroups(): boolean {
    if (!this.mesh?.parent) return false;
    const solidRoot = findSolidModelRoot(this.mesh);
    if (!solidRoot) return false;
    return this.mesh.parent !== solidRoot;
  }

  /**
   * Builds a fingerprint string of intermediate parent local poses from the
   * brush mesh parent up to the solid model root.
   *
   * @returns Pose key of each intermediate parent's uuid and TRS joined
   *   together, or empty when there is no mesh, no solid root, or no
   *   intermediate parents.
   */
  getParentChainPoseKey(): string {
    if (!this.mesh) return '';
    const solidRoot = findSolidModelRoot(this.mesh);
    if (!solidRoot) return '';
    const parts: string[] = [];
    let current: THREE.Object3D | null = this.mesh.parent;
    while (current && current !== solidRoot) {
      parts.push(
        `${current.uuid}:${current.position.x},${current.position.y},${current.position.z}:` +
          `${current.rotation.x},${current.rotation.y},${current.rotation.z}:` +
          `${current.scale.x},${current.scale.y},${current.scale.z}`,
      );
      current = current.parent;
    }
    return parts.join('|');
  }

  /**
   * Builds the matrix that transforms brush-local vertices into solid model
   * space, including intermediate solid CSG group parents. Direct children of
   * the solid root use the fast local-TRS path (no matrixWorld walks).
   *
   * @returns Model-space transform matrix.
   */
  getModelSpaceMatrix(): THREE.Matrix4 {
    this.pullTransformFromMesh();
    if (!this.mesh) {
      return composeLocalMatrix(this.position, this.rotation, this.scale);
    }
    const solidRoot = findSolidModelRoot(this.mesh);
    if (!solidRoot || this.mesh.parent === solidRoot) {
      return composeLocalMatrix(this.position, this.rotation, this.scale);
    }
    this.mesh.updateMatrixWorld(true);
    solidRoot.updateMatrixWorld(true);
    scratchRootInverse.copy(solidRoot.matrixWorld).invert();
    return scratchModelMatrix.multiplyMatrices(scratchRootInverse, this.mesh.matrixWorld).clone();
  }

  /**
   * Returns a brush with vertices and planes transformed into model space.
   *
   * @returns Transformed brush clone.
   */
  getModelSpaceBrush(): SolidBrush {
    const modelBrush = this.brush.clone();
    modelBrush.transformVertices(this.getModelSpaceMatrix());
    return modelBrush;
  }

  /**
   * Returns model-space planes for this brush.
   *
   * @returns Transformed outward planes.
   */
  getModelSpacePlanes(): SolidPlane[] {
    return this.getModelSpaceBrush().planes;
  }

  /**
   * Axis-aligned bounds of this brush in model space.
   *
   * @returns Bounding box.
   */
  getModelSpaceBounds(): THREE.Box3 {
    return this.getModelSpaceBrush().computeLocalBounds();
  }

  /**
   * Deep-clones this instance with a new id and name (no mesh attachment).
   *
   * @param newId New unique id.
   * @param newName New display name.
   * @returns Cloned instance.
   */
  cloneWithId(newId: string, newName: string): SolidBrushInstance {
    this.pullTransformFromMesh();
    const copy = new SolidBrushInstance(newId, newName, this.brush.clone(), this.operation);
    copy.position.copy(this.position);
    copy.rotation.copy(this.rotation);
    copy.scale.copy(this.scale);
    copy.visible = this.visible;
    copy.restoreFaceSurfaces(this.serializeDefaultSurface(), this.serializeFaceSurfaces());
    return copy;
  }

  /**
   * Returns the brush-local face normal for a surface index.
   *
   * @param surfaceIndex Face index.
   * @returns Unit normal.
   */
  faceNormalLocal(surfaceIndex: number): THREE.Vector3 {
    return this.brush.planes[surfaceIndex]?.normal.clone().normalize() ?? new THREE.Vector3(0, 1, 0);
  }

  /**
   * Returns the brush-local plane offset for a surface index.
   *
   * @param surfaceIndex Face index.
   * @returns Plane offset d.
   */
  facePlaneOffsetLocal(surfaceIndex: number): number {
    return this.brush.planes[surfaceIndex]?.offset ?? 0;
  }

  /**
   * Builds a default surface for a face: shared texture id with a UV matrix
   * oriented to that face's plane (identity TRS on the face normal).
   *
   * @param surfaceIndex Face index.
   * @returns Default face surface.
   */
  private buildDefaultFaceSurface(surfaceIndex: number): FaceSurfaceDescription {
    const normal = this.faceNormalLocal(surfaceIndex);
    const trs = this.defaultSurface.uv.decompose(new THREE.Vector3(0, 1, 0));
    return {
      textureId: this.defaultSurface.textureId || DEFAULT_CHECKER_TEXTURE_ID,
      uv: SurfaceUvMatrix.fromTrs(trs.translation, normal, trs.rotationDeg, trs.scaleU, trs.scaleV),
    };
  }

  /**
   * Coerces serialized or live surface data into a FaceSurfaceDescription.
   *
   * @param value Surface, serialized surface, or undefined.
   * @param _faceNormal Unused (kept for call-site symmetry).
   * @returns Normalized surface.
   */
  private coerceSurface(
    value: FaceSurfaceDescriptionSerialized | FaceSurfaceDescription | undefined,
    _faceNormal: THREE.Vector3,
  ): FaceSurfaceDescription {
    void _faceNormal;
    if (!value) return createDefaultFaceSurface();
    if (value instanceof Object && 'uv' in value) {
      const record = value as FaceSurfaceDescription | FaceSurfaceDescriptionSerialized;
      if (record.uv instanceof SurfaceUvMatrix) {
        return cloneFaceSurface(record as FaceSurfaceDescription);
      }
      if (record.uv && typeof record.uv === 'object' && 'u' in record.uv) {
        return deserializeFaceSurface(record as FaceSurfaceDescriptionSerialized);
      }
    }
    return createDefaultFaceSurface();
  }
}
