import * as THREE from 'three';
import { SolidBrush } from '../brush/solid_brush.js';
import { SolidOperation } from '../types/solid_operation.js';
import { SolidPlane } from '../brush/solid_plane.js';
import { SolidBrushVisual } from './solid_brush_visual.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '../../texture/texture_id.js';
import {
  FaceTextureMapping,
  cloneFaceTextureMapping,
  createDefaultFaceTextureMapping
} from '../../texture/face_texture_mapping.js';

/**
 * A brush placed inside a solid model with local transform and CSG operation.
 * Scene transform is owned by the optional preview mesh when present.
 * Surface texture and UV projection are authored per brush face and baked into
 * the compiled result mesh on rebuild.
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
  /** Default surface mapping for faces without a per-face override. */
  private defaultMapping: FaceTextureMapping;
  /** Optional per-face full mapping overrides (index matches brush.faces). */
  private faceMappings: (FaceTextureMapping | undefined)[];

  /**
   * Creates a solid brush instance.
   * @param id Stable unique identifier.
   * @param name Display name.
   * @param brush Local convex brush geometry.
   * @param operation CSG operation for this brush.
   */
  constructor(
    id: string,
    name: string,
    brush: SolidBrush,
    operation: SolidOperation = SolidOperation.Additive
  ) {
    this.id = id;
    this.name = name;
    this.brush = brush;
    this.operation = operation;
    this.position = new THREE.Vector3();
    this.rotation = new THREE.Euler(0, 0, 0, 'XYZ');
    this.scale = new THREE.Vector3(1, 1, 1);
    this.visible = true;
    this.mesh = null;
    this.defaultMapping = createDefaultFaceTextureMapping(
      DEFAULT_CHECKER_TEXTURE_ID
    );
    this.faceMappings = [];
  }

  /**
   * Default surface texture identity for faces without overrides.
   * @returns Texture id string.
   */
  get surfaceTextureId(): string {
    return this.defaultMapping.textureId;
  }

  /**
   * Sets the default surface texture identity (does not clear face overrides).
   * @param textureId Texture identity.
   */
  set surfaceTextureId(textureId: string) {
    this.defaultMapping.textureId = textureId || DEFAULT_CHECKER_TEXTURE_ID;
  }

  /**
   * Returns the full UV/texture mapping for a brush face.
   * @param surfaceIndex Brush face index.
   * @returns Cloned face texture mapping.
   */
  getSurfaceMapping(surfaceIndex: number): FaceTextureMapping {
    const override = this.faceMappings[surfaceIndex];
    if (override) return cloneFaceTextureMapping(override);
    return cloneFaceTextureMapping(this.defaultMapping);
  }

  /**
   * Returns the texture id for a brush face (per-face override or default).
   * @param surfaceIndex Brush face index.
   * @returns Texture identity string.
   */
  getSurfaceTextureId(surfaceIndex: number): string {
    return this.getSurfaceMapping(surfaceIndex).textureId;
  }

  /**
   * Sets one brush face texture, preserving existing UV projection params.
   * @param surfaceIndex Brush face index.
   * @param textureId Texture identity.
   */
  setFaceTextureId(surfaceIndex: number, textureId: string): void {
    if (surfaceIndex < 0) return;
    const mapping = this.getSurfaceMapping(surfaceIndex);
    mapping.textureId = textureId || DEFAULT_CHECKER_TEXTURE_ID;
    this.faceMappings[surfaceIndex] = mapping;
  }

  /**
   * Sets the full UV/texture mapping for one brush face.
   * @param surfaceIndex Brush face index.
   * @param mapping Mapping to store (cloned).
   */
  setFaceMapping(surfaceIndex: number, mapping: FaceTextureMapping): void {
    if (surfaceIndex < 0) return;
    this.faceMappings[surfaceIndex] = cloneFaceTextureMapping(mapping);
  }

  /**
   * Sets the default texture for all faces and clears per-face overrides.
   * UV params reset to defaults with the new texture id.
   * @param textureId Texture identity.
   */
  setAllFacesTextureId(textureId: string): void {
    this.defaultMapping = createDefaultFaceTextureMapping(
      textureId || DEFAULT_CHECKER_TEXTURE_ID
    );
    this.faceMappings = [];
  }

  /**
   * Sets the default surface texture without clearing per-face overrides.
   * @param textureId Texture identity.
   */
  setSurfaceTextureIdOnly(textureId: string): void {
    this.defaultMapping.textureId = textureId || DEFAULT_CHECKER_TEXTURE_ID;
  }

  /**
   * Serializes per-face texture overrides for legacy persistence.
   * @returns Sparse face texture id list.
   */
  serializeFaceTextureIds(): (string | undefined)[] {
    return this.faceMappings.map((mapping) => mapping?.textureId);
  }

  /**
   * Restores per-face texture overrides from persistence (texture id only).
   * @param ids Sparse face texture id list.
   */
  restoreFaceTextureIds(ids: (string | undefined)[] | undefined): void {
    if (!ids) {
      this.faceMappings = [];
      return;
    }
    this.faceMappings = ids.map((textureId) => {
      if (typeof textureId !== 'string' || textureId.length === 0) {
        return undefined;
      }
      return createDefaultFaceTextureMapping(textureId);
    });
  }

  /**
   * Serializes full per-face UV mappings for scene persistence.
   * @returns Sparse list of face mappings (undefined slots omitted as holes).
   */
  serializeFaceMappings(): (FaceTextureMapping | undefined)[] {
    return this.faceMappings.map((mapping) =>
      mapping ? cloneFaceTextureMapping(mapping) : undefined
    );
  }

  /**
   * Serializes the default surface mapping for scene persistence.
   * @returns Cloned default mapping.
   */
  serializeDefaultMapping(): FaceTextureMapping {
    return cloneFaceTextureMapping(this.defaultMapping);
  }

  /**
   * Restores default and per-face UV mappings from persistence.
   * @param defaultMapping Optional default mapping.
   * @param faceMappings Optional sparse per-face mappings.
   */
  restoreFaceMappings(
    defaultMapping: FaceTextureMapping | undefined,
    faceMappings: (FaceTextureMapping | undefined)[] | undefined
  ): void {
    this.defaultMapping = defaultMapping
      ? cloneFaceTextureMapping(defaultMapping)
      : createDefaultFaceTextureMapping(DEFAULT_CHECKER_TEXTURE_ID);
    if (!this.defaultMapping.textureId) {
      this.defaultMapping.textureId = DEFAULT_CHECKER_TEXTURE_ID;
    }
    this.faceMappings = faceMappings
      ? faceMappings.map((mapping) =>
          mapping ? cloneFaceTextureMapping(mapping) : undefined
        )
      : [];
  }

  /**
   * Restores prior face texture id list and default texture without full maps.
   * Used by undo paths that only snapshot texture ids.
   * @param defaultTextureId Default surface texture id.
   * @param faceTextureIds Sparse per-face texture ids.
   */
  restoreTextureIdsOnly(
    defaultTextureId: string,
    faceTextureIds: (string | undefined)[]
  ): void {
    this.defaultMapping.textureId =
      defaultTextureId || DEFAULT_CHECKER_TEXTURE_ID;
    this.faceMappings = faceTextureIds.map((textureId, index) => {
      if (typeof textureId !== 'string' || textureId.length === 0) {
        return undefined;
      }
      const existing = this.faceMappings[index];
      if (existing) {
        const copy = cloneFaceTextureMapping(existing);
        copy.textureId = textureId;
        return copy;
      }
      return createDefaultFaceTextureMapping(textureId);
    });
  }

  /**
   * Attaches a scene preview mesh and stamps brush identity metadata.
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
   * Copies transform and name from the scene mesh into this instance.
   */
  pullTransformFromMesh(): void {
    if (!this.mesh) return;
    this.position.copy(this.mesh.position);
    this.rotation.copy(this.mesh.rotation);
    this.scale.copy(this.mesh.scale);
    this.name = this.mesh.name;
    this.visible = this.mesh.visible;
  }

  /**
   * Pushes this instance's transform and name onto the scene mesh.
   */
  pushTransformToMesh(): void {
    if (!this.mesh) return;
    this.mesh.position.copy(this.position);
    this.mesh.rotation.copy(this.rotation);
    this.mesh.scale.copy(this.scale);
    this.mesh.name = this.name;
    this.mesh.visible = this.visible;
  }

  /**
   * Builds the local-to-model matrix for this instance.
   * @returns Transform matrix.
   */
  getLocalMatrix(): THREE.Matrix4 {
    this.pullTransformFromMesh();
    return new THREE.Matrix4().compose(
      this.position,
      new THREE.Quaternion().setFromEuler(this.rotation),
      this.scale
    );
  }

  /**
   * Returns a brush with vertices and planes transformed into model space.
   * @returns Transformed brush clone.
   */
  getModelSpaceBrush(): SolidBrush {
    const modelBrush = this.brush.clone();
    modelBrush.transformVertices(this.getLocalMatrix());
    return modelBrush;
  }

  /**
   * Returns model-space planes for this brush.
   * @returns Transformed outward planes.
   */
  getModelSpacePlanes(): SolidPlane[] {
    return this.getModelSpaceBrush().planes;
  }

  /**
   * Axis-aligned bounds of this brush in model space.
   * @returns Bounding box.
   */
  getModelSpaceBounds(): THREE.Box3 {
    return this.getModelSpaceBrush().computeLocalBounds();
  }

  /**
   * Deep-clones this instance with a new id and name (no mesh attachment).
   * @param newId New unique id.
   * @param newName New display name.
   * @returns Cloned instance.
   */
  cloneWithId(newId: string, newName: string): SolidBrushInstance {
    this.pullTransformFromMesh();
    const copy = new SolidBrushInstance(
      newId,
      newName,
      this.brush.clone(),
      this.operation
    );
    copy.position.copy(this.position);
    copy.rotation.copy(this.rotation);
    copy.scale.copy(this.scale);
    copy.visible = this.visible;
    copy.restoreFaceMappings(
      this.serializeDefaultMapping(),
      this.serializeFaceMappings()
    );
    return copy;
  }
}
