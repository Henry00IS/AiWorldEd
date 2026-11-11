import * as THREE from 'three';
import { contentMeshImportCreate, contentMeshImportNodeObject } from '@/io/geometry/content_mesh_import.js';
import { cloneMeshDocument } from '@/mesh/document/mesh_document_clone.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import { FbxImportMeshBuilder } from '@/io/fbx/import/mesh/builder_fbx_import_mesh.js';
import { FBX_IMPORT_ROOT_ID, type FbxImportDocument } from '@/io/fbx/import/parse/fbx_import_document.js';
import { fbxImportObjectName } from '@/io/fbx/import/parse/fbx_import_node.js';
import { FbxImportProperties } from '@/io/fbx/import/parse/fbx_import_properties.js';
import type { FbxImportTextureReader } from '@/io/fbx/import/textures/fbx_import_texture_reader.js';
import { fbxImportModelGeometricMatrix, fbxImportModelLocalMatrix } from './fbx_import_model_transform.js';

/** UserData key marking meshes made by the FBX importer. */
export const FBX_IMPORT_MESH_USERDATA_KEY = 'importedFromFbx';

/** Deepest model nesting the importer follows. */
const FBX_IMPORT_MODEL_DEPTH_MAXIMUM = 256;

/** One imported content mesh waiting for its display geometry. */
export interface FbxImportBuiltMesh {
  mesh: THREE.Mesh;
  hasAuthoredUvs: boolean;
  polygonCount: number;
}

/**
 * Turns the model tree of an FBX file into editor objects in editor space:
 * models with mesh geometry become content meshes, models with children become
 * groups, and models without meshes below them (cameras, lights, bones) are
 * left out. Names are kept; every local transform and vertex is carried through
 * the file's axis and unit conversion.
 */
export class FbxImportHierarchyBuilder {
  private readonly built: FbxImportBuiltMesh[] = [];
  private readonly geometryUses = new Set<string>();
  private readonly meshBuilder = new FbxImportMeshBuilder();
  private readonly conversionInverse: THREE.Matrix4;

  /**
   * Creates a builder.
   *
   * @param document Parsed file.
   * @param conversion File-to-editor axis and unit conversion.
   * @param textures Texture reader (material diffuse maps).
   * @param textureIdByTexture Texture id per texture index.
   */
  constructor(
    private readonly document: FbxImportDocument,
    private readonly conversion: THREE.Matrix4,
    private readonly textures: FbxImportTextureReader,
    private readonly textureIdByTexture: ReadonlyMap<number, string>,
  ) {
    this.conversionInverse = conversion.clone().invert();
  }

  /**
   * Builds the objects below the scene root.
   *
   * @returns Root objects in file order.
   */
  buildScene(): THREE.Object3D[] {
    return this.childModelIds(FBX_IMPORT_ROOT_ID)
      .map((id) => this.buildModel(id, 0, new Set()))
      .filter((object): object is THREE.Object3D => object !== null);
  }

  /**
   * Returns the content meshes built so far.
   *
   * @returns Built meshes.
   */
  builtMeshes(): readonly FbxImportBuiltMesh[] {
    return this.built;
  }

  /**
   * Builds one model and its subtree.
   *
   * @param modelId Model id.
   * @param depth Nesting depth.
   * @param ancestors Model ids above this one (cycle guard).
   * @returns Object, or null when the subtree holds no mesh.
   */
  private buildModel(modelId: string, depth: number, ancestors: ReadonlySet<string>): THREE.Object3D | null {
    const node = this.document.object(modelId);
    if (node === null || depth > FBX_IMPORT_MODEL_DEPTH_MAXIMUM || ancestors.has(modelId)) return null;
    const below = new Set(ancestors).add(modelId);
    const children = this.childModelIds(modelId)
      .map((childId) => this.buildModel(childId, depth + 1, below))
      .filter((child): child is THREE.Object3D => child !== null);
    const properties = new FbxImportProperties(node);
    const name = fbxImportObjectName(node.properties[1]).trim() || 'Mesh';
    const mesh = this.buildMesh(modelId, properties, name);
    const object = contentMeshImportNodeObject(name, mesh, children);
    if (object !== null) this.transformApply(object, properties);
    return object;
  }

  /**
   * Lists the models connected below an object, in connection order.
   *
   * @param parentId Parent id (the scene root or a model).
   * @returns Model ids.
   */
  private childModelIds(parentId: string): string[] {
    const links = this.document.childrenOf(parentId);
    return links.filter((link) => this.document.object(link.id)?.name === 'Model').map((link) => link.id);
  }

  /**
   * Builds the content mesh of a model's mesh geometry; repeated uses of one
   * geometry get their own copy of the document.
   *
   * @param modelId Model id.
   * @param properties Model properties.
   * @param name Base name.
   * @returns Mesh, or null when the model has no usable mesh geometry.
   */
  private buildMesh(modelId: string, properties: FbxImportProperties, name: string): THREE.Mesh | null {
    const geometryId = this.modelGeometryId(modelId);
    const geometry = geometryId === null ? null : this.document.object(geometryId);
    if (geometryId === null || geometry === null) return null;
    const vertexMatrix = this.conversion.clone().multiply(fbxImportModelGeometricMatrix(properties));
    const result = this.meshBuilder.build(geometry, vertexMatrix, this.modelSlotTextureIds(modelId));
    if (result === null) return null;
    const document = this.geometryUses.has(geometryId) ? cloneMeshDocument(result.document) : result.document;
    this.geometryUses.add(geometryId);
    const mesh = contentMeshImportCreate(document, name, FBX_IMPORT_MESH_USERDATA_KEY);
    this.built.push({ mesh, hasAuthoredUvs: result.hasTextureCoordinates, polygonCount: result.polygonCount });
    return mesh;
  }

  /**
   * Finds the mesh geometry connected to a model.
   *
   * @param modelId Model id.
   * @returns Geometry id, or null.
   */
  private modelGeometryId(modelId: string): string | null {
    const link = this.document.childrenOf(modelId).find((entry) => {
      const node = this.document.object(entry.id);
      return node?.name === 'Geometry' && node.properties[2] === 'Mesh';
    });
    return link?.id ?? null;
  }

  /**
   * Returns the texture id of each material slot of a model (materials in
   * connection order).
   *
   * @param modelId Model id.
   * @returns Texture ids; slots without a diffuse map use the checker.
   */
  private modelSlotTextureIds(modelId: string): string[] {
    return fbxImportModelMaterialIds(this.document, modelId).map((materialId) => {
      const index = this.textures.materialTextureIndex(materialId);
      return index === null
        ? DEFAULT_CHECKER_TEXTURE_ID
        : (this.textureIdByTexture.get(index) ?? DEFAULT_CHECKER_TEXTURE_ID);
    });
  }

  /**
   * Places an object with the model's local transform in editor space.
   *
   * @param object Object.
   * @param properties Model properties.
   */
  private transformApply(object: THREE.Object3D, properties: FbxImportProperties): void {
    const local = this.conversion
      .clone()
      .multiply(fbxImportModelLocalMatrix(properties))
      .multiply(this.conversionInverse);
    local.decompose(object.position, object.quaternion, object.scale);
  }
}

/**
 * Lists the materials of a model in connection order (its material slots).
 *
 * @param document Parsed file.
 * @param modelId Model id.
 * @returns Material ids.
 */
export function fbxImportModelMaterialIds(document: FbxImportDocument, modelId: string): string[] {
  const links = document.childrenOf(modelId);
  return links.filter((link) => document.object(link.id)?.name === 'Material').map((link) => link.id);
}
