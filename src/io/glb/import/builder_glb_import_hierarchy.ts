import * as THREE from 'three';
import { contentMeshImportCreate, contentMeshImportNodeObject } from '@/io/geometry/content_mesh_import.js';
import { cloneMeshDocument } from '@/mesh/document/mesh_document_clone.js';
import type { GlbImportDocument } from './glb_import_document_loader.js';
import type { GlbImportJsonNode } from './glb_import_json.js';
import type { GlbImportMeshBuilder } from './builder_glb_import_mesh.js';

/** UserData key marking meshes made by the GLB importer. */
export const GLB_IMPORT_MESH_USERDATA_KEY = 'importedFromGlb';

/** Deepest node nesting the importer follows. */
const GLB_IMPORT_NODE_DEPTH_MAXIMUM = 256;

/** One imported content mesh waiting for its display geometry. */
export interface GlbImportBuiltMesh {
  mesh: THREE.Mesh;
  hasAuthoredUvs: boolean;
  triangleCount: number;
}

/**
 * Turns the node tree of a glTF scene into editor objects: nodes with a mesh
 * become content meshes, nodes with children become groups, and empty nodes,
 * cameras and lights are left out. Names and local transforms are kept.
 */
export class GlbImportHierarchyBuilder {
  private readonly built: GlbImportBuiltMesh[];
  private readonly meshUses: Set<number>;

  /**
   * Creates a builder.
   *
   * @param source Parsed document.
   * @param meshBuilder Builds mesh documents per glTF mesh.
   */
  constructor(
    private readonly source: GlbImportDocument,
    private readonly meshBuilder: GlbImportMeshBuilder,
  ) {
    this.built = [];
    this.meshUses = new Set();
  }

  /**
   * Builds the objects of the document's default scene.
   *
   * @returns Root objects in scene order.
   */
  async buildScene(): Promise<THREE.Object3D[]> {
    const json = this.source.json;
    const scene = json.scenes?.[json.scene ?? 0];
    const rootIndices = scene?.nodes ?? glbImportOrphanNodeIndices(json.nodes ?? []);
    const roots = await Promise.all(rootIndices.map((index) => this.buildNode(index, 0, new Set())));
    return roots.filter((root): root is THREE.Object3D => root !== null);
  }

  /**
   * Returns the content meshes built so far.
   *
   * @returns Built meshes.
   */
  builtMeshes(): readonly GlbImportBuiltMesh[] {
    return this.built;
  }

  /**
   * Builds one node and its subtree.
   *
   * @param nodeIndex Node index.
   * @param depth Nesting depth.
   * @param ancestors Node indices above this one (cycle guard).
   * @returns Object, or null when the subtree holds no mesh.
   */
  private async buildNode(
    nodeIndex: number,
    depth: number,
    ancestors: ReadonlySet<number>,
  ): Promise<THREE.Object3D | null> {
    const node = this.source.json.nodes?.[nodeIndex];
    if (node === undefined || depth > GLB_IMPORT_NODE_DEPTH_MAXIMUM || ancestors.has(nodeIndex)) return null;
    const below = new Set(ancestors).add(nodeIndex);
    const children = await Promise.all((node.children ?? []).map((child) => this.buildNode(child, depth + 1, below)));
    const childObjects = children.filter((child): child is THREE.Object3D => child !== null);
    const mesh = node.mesh === undefined ? null : await this.buildMesh(node.mesh, glbImportNodeName(this.source, node));
    const groupName = node.name?.trim() || glbImportNodeName(this.source, node);
    const object = contentMeshImportNodeObject(groupName, mesh, childObjects);
    if (object !== null) glbImportNodeTransformApply(object, node);
    return object;
  }

  /**
   * Builds a content mesh for a glTF mesh; repeated uses get their own copy.
   *
   * @param meshIndex GlTF mesh index.
   * @param name Base name.
   * @returns Mesh, or null when the glTF mesh has no triangles.
   */
  private async buildMesh(meshIndex: number, name: string): Promise<THREE.Mesh | null> {
    const result = await this.meshBuilder.build(meshIndex);
    if (result === null) return null;
    const reused = this.meshUses.has(meshIndex);
    this.meshUses.add(meshIndex);
    const document = reused ? cloneMeshDocument(result.document) : result.document;
    const mesh = contentMeshImportCreate(document, name, GLB_IMPORT_MESH_USERDATA_KEY);
    this.built.push({ mesh, hasAuthoredUvs: result.hasTextureCoordinates, triangleCount: result.triangleCount });
    return mesh;
  }
}

/**
 * Lists nodes no other node names as a child (used when a file has no scene).
 *
 * @param nodes All nodes.
 * @returns Root node indices.
 */
function glbImportOrphanNodeIndices(nodes: readonly GlbImportJsonNode[]): number[] {
  const children = new Set(nodes.flatMap((node) => node.children ?? []));
  return nodes.map((_node, index) => index).filter((index) => !children.has(index));
}

/**
 * Picks the base name of a node: its own name, else its mesh's, else "Mesh".
 *
 * @param source Parsed document.
 * @param node Node.
 * @returns Base name.
 */
function glbImportNodeName(source: GlbImportDocument, node: GlbImportJsonNode): string {
  const meshName = node.mesh === undefined ? '' : (source.json.meshes?.[node.mesh]?.name ?? '');
  const candidates = [node.name ?? '', meshName].map((name) => name.trim());
  return candidates.find((name) => name.length > 0) ?? (node.mesh === undefined ? 'Group' : 'Mesh');
}

/**
 * Applies a node's matrix, or translation, rotation and scale.
 *
 * @param object Object to place.
 * @param node Node.
 */
function glbImportNodeTransformApply(object: THREE.Object3D, node: GlbImportJsonNode): void {
  if (node.matrix?.length === 16) {
    new THREE.Matrix4().fromArray(node.matrix).decompose(object.position, object.quaternion, object.scale);
    return;
  }
  if (node.translation?.length === 3) object.position.fromArray(node.translation);
  if (node.rotation?.length === 4) object.quaternion.fromArray(node.rotation);
  if (node.scale?.length === 3) object.scale.fromArray(node.scale);
}
