import * as THREE from 'three';
import { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { getSolidGroupOperation, isSolidCsgGroup, markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { createWingEdge, createSolidFace } from '@/solid/types/wing_edge.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import {
  FaceTextureMapping,
  createDefaultFaceTextureMapping,
  deserializeFaceTextureMapping,
  serializeFaceTextureMapping,
} from '@/texture/uv/face_texture_mapping.js';
import { isResultMesh } from '@/solid/model/solid_model_keys.js';
import { hierarchyNameAllocator } from '@/utils/utils_hierarchy_name_allocator.js';

/** Serializable snapshot of a solid brush instance. */
export interface SerializedSolidBrush {
  id: string;
  name: string;
  operation: SolidOperation;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  visible: boolean;
  /** Optional per-brush default surface texture identity (legacy). */
  surfaceTextureId?: string;
  /** Optional per-face texture overrides (legacy texture-id only). */
  faceTextureIds?: (string | undefined)[];
  /** Default UV/texture mapping for faces without overrides (legacy planar). */
  defaultMapping?: FaceTextureMapping;
  /** Sparse per-face full UV/texture mappings (legacy planar). */
  faceMappings?: (FaceTextureMapping | undefined)[];
  /** Default surface (texture + UV matrix). Preferred over defaultMapping. */
  defaultSurface?: {
    textureId: string;
    uv: { u: [number, number, number, number]; v: [number, number, number, number] };
  };
  /**
   * Sparse per-face surfaces (texture + UV matrix). Preferred over
   * faceMappings.
   */
  faceSurfaces?: Array<
    { textureId: string; uv: { u: [number, number, number, number]; v: [number, number, number, number] } } | undefined
  >;
  vertices: number[];
  wingEdges: Array<{ vertexIndex: number; twinIndex: number }>;
  edgeFaceIndices: number[];
  faces: Array<{ firstEdge: number; edgeCount: number; surfaceIndex: number }>;
}

/** Serializable solid CSG tree brush leaf. */
export interface SerializedSolidTreeBrushNode {
  kind: 'brush';
  /** Brush instance id matching a SerializedSolidBrush.id. */
  brushId: string;
}

/** Serializable solid CSG tree group branch. */
export interface SerializedSolidTreeGroupNode {
  kind: 'group';
  /** Stable group id for nesting references. */
  id: string;
  /** Display name. */
  name: string;
  /** Compound branch CSG operation. */
  operation: SolidOperation;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  /** Nested brushes and groups in evaluation order. */
  children: SerializedSolidTreeNode[];
}

/** Serializable solid CSG tree node. */
export type SerializedSolidTreeNode = SerializedSolidTreeBrushNode | SerializedSolidTreeGroupNode;

/**
 * Serializable snapshot of a solid model (brushes + optional hierarchy; mesh
 * geometry is rebuilt).
 */
export interface SerializedSolidModel {
  brushes: SerializedSolidBrush[];
  /** When true, CSG starts solid so subtractives carve rooms. */
  invertedWorld?: boolean;
  /**
   * Optional hierarchical CSG tree under the solid root. When omitted, brushes
   * are restored as a flat sibling list (legacy).
   */
  hierarchy?: SerializedSolidTreeNode[];
}

/** Encodes and decodes solid models for scene persistence. */
export class SolidModelCodec {
  /**
   * Serializes a solid model into a JSON-safe snapshot.
   *
   * @param model Solid model to encode.
   * @returns Serialized solid model payload.
   */
  static encode(model: SolidModel): SerializedSolidModel {
    model.syncBrushesFromScene();
    model.syncAuthoredMappingsFromResultMesh();
    const payload: SerializedSolidModel = {
      brushes: model.getBrushes().map((brush) => this.brushEncode(brush)),
    };
    if (model.isInvertedWorld()) {
      payload.invertedWorld = true;
    }
    const hierarchy = this.encodeHierarchy(model.root);
    if (hierarchy.length > 0 && hierarchy.some((node) => node.kind === 'group')) {
      payload.hierarchy = hierarchy;
    }
    return payload;
  }

  /**
   * Rebuilds a solid model from a serialized snapshot.
   *
   * @param data Serialized solid model.
   * @param name Root display name.
   * @returns Restored solid model with rebuilt geometry.
   */
  static decode(data: SerializedSolidModel, name: string): SolidModel {
    const model = new SolidModel(name);
    const instances = [];
    for (const brushData of data.brushes ?? []) {
      const instance = this.brushDecode(brushData);
      hierarchyNameAllocator.noteExistingName(instance.name);
      instances.push(instance);
    }
    model.addBrushInstancesBatch(instances, 2, false);
    if (data.hierarchy && data.hierarchy.length > 0) {
      this.applyHierarchy(model, data.hierarchy);
    }
    model.markDirty();
    if (data.invertedWorld === true) {
      model.setInvertedWorld(true);
    } else {
      model.rebuild(true);
    }
    return model;
  }

  /**
   * Encodes the solid root's hierarchical CSG tree (brushes + solid groups).
   *
   * @param solidRoot Solid model root group.
   * @returns Ordered top-level tree nodes.
   */
  private static encodeHierarchy(solidRoot: THREE.Object3D): SerializedSolidTreeNode[] {
    const nodes: SerializedSolidTreeNode[] = [];
    for (const child of solidRoot.children) {
      const node = this.encodeHierarchyChild(child);
      if (node) nodes.push(node);
    }
    return nodes;
  }

  /**
   * Encodes one scene child under the solid hierarchy.
   *
   * @param child Scene child.
   * @returns Tree node or null when not a CSG operand.
   */
  private static encodeHierarchyChild(child: THREE.Object3D): SerializedSolidTreeNode | null {
    if (isResultMesh(child)) return null;
    if (SolidBrushVisual.isBrushObject(child)) {
      const brushId = SolidBrushVisual.getBrushId(child);
      if (!brushId) return null;
      return { kind: 'brush', brushId };
    }
    if (child instanceof THREE.Group && (isSolidCsgGroup(child) || this.groupHasBrushDescendant(child))) {
      return this.encodeHierarchyGroup(child);
    }
    return null;
  }

  /**
   * Encodes a solid CSG group branch.
   *
   * @param group Solid CSG group.
   * @returns Group tree node or null when empty.
   */
  private static encodeHierarchyGroup(group: THREE.Group): SerializedSolidTreeGroupNode | null {
    const children: SerializedSolidTreeNode[] = [];
    for (const child of group.children) {
      const node = this.encodeHierarchyChild(child);
      if (node) children.push(node);
    }
    if (children.length === 0) return null;
    return {
      kind: 'group',
      id: group.uuid,
      name: group.name,
      operation: getSolidGroupOperation(group),
      position: this.encodeVector3(group.position),
      rotation: this.encodeEuler(group.rotation),
      scale: this.encodeVector3(group.scale),
      children,
    };
  }

  /**
   * Returns whether a group has any solid brush descendant.
   *
   * @param group Scene group.
   * @returns True when a brush mesh is nested under the group.
   */
  private static groupHasBrushDescendant(group: THREE.Group): boolean {
    let found = false;
    group.traverse((object) => {
      if (found) return;
      if (SolidBrushVisual.isBrushObject(object)) found = true;
    });
    return found;
  }

  /**
   * Restores solid CSG group nesting under a model that already owns flat brush
   * instances with preview meshes.
   *
   * @param model Solid model with brushes attached.
   * @param hierarchy Serialized hierarchy roots.
   */
  private static applyHierarchy(model: SolidModel, hierarchy: SerializedSolidTreeNode[]): void {
    const brushMeshById = this.buildBrushMeshMap(model);
    for (const node of hierarchy) {
      this.attachHierarchyNode(model.root, node, brushMeshById);
    }
    model.syncBrushOrderFromScene();
    model.markDirty();
  }

  /**
   * Maps brush ids to their preview meshes for hierarchy restore.
   *
   * @param model Solid model.
   * @returns Brush id → mesh map.
   */
  private static buildBrushMeshMap(model: SolidModel): Map<string, THREE.Mesh> {
    const map = new Map<string, THREE.Mesh>();
    for (const brush of model.getBrushes()) {
      if (brush.mesh) map.set(brush.id, brush.mesh);
    }
    return map;
  }

  /**
   * Attaches one hierarchy node under a parent (reparents brushes / creates
   * groups).
   *
   * @param parent Solid root or solid CSG group.
   * @param node Serialized node.
   * @param brushMeshById Brush meshes by id.
   */
  private static attachHierarchyNode(
    parent: THREE.Object3D,
    node: SerializedSolidTreeNode,
    brushMeshById: Map<string, THREE.Mesh>,
  ): void {
    if (node.kind === 'brush') {
      this.attachBrushNode(parent, node.brushId, brushMeshById);
      return;
    }
    this.attachGroupNode(parent, node, brushMeshById);
  }

  /**
   * Reparents a brush mesh under a hierarchy parent.
   *
   * @param parent Parent object.
   * @param brushId Brush id.
   * @param brushMeshById Brush meshes by id.
   */
  private static attachBrushNode(
    parent: THREE.Object3D,
    brushId: string,
    brushMeshById: Map<string, THREE.Mesh>,
  ): void {
    const mesh = brushMeshById.get(brushId);
    if (!mesh) return;
    parent.add(mesh);
  }

  /**
   * Creates a solid CSG group, restores transform, and attaches children.
   *
   * @param parent Parent object.
   * @param node Serialized group node.
   * @param brushMeshById Brush meshes by id.
   */
  private static attachGroupNode(
    parent: THREE.Object3D,
    node: SerializedSolidTreeGroupNode,
    brushMeshById: Map<string, THREE.Mesh>,
  ): void {
    const group = new THREE.Group();
    group.uuid = node.id;
    group.name = node.name || 'Group';
    hierarchyNameAllocator.noteExistingName(group.name);
    markAsSolidCsgGroup(group, node.operation);
    group.position.set(node.position.x, node.position.y, node.position.z);
    group.rotation.set(node.rotation.x, node.rotation.y, node.rotation.z, 'XYZ');
    group.scale.set(node.scale.x, node.scale.y, node.scale.z);
    parent.add(group);
    for (const child of node.children) {
      this.attachHierarchyNode(group, child, brushMeshById);
    }
  }

  /**
   * Encodes one brush instance.
   *
   * @param instance Brush instance.
   * @returns Serialized brush.
   */
  static brushEncode(instance: SolidBrushInstance): SerializedSolidBrush {
    instance.pullTransformFromMesh();
    const defaultSurface = instance.serializeDefaultSurface();
    const defaultMapping = instance.serializeDefaultMapping();
    return {
      id: instance.id,
      name: instance.name,
      operation: instance.operation,
      position: this.encodeVector3(instance.position),
      rotation: this.encodeEuler(instance.rotation),
      scale: this.encodeVector3(instance.scale),
      visible: instance.visible,
      surfaceTextureId: defaultSurface.textureId,
      faceTextureIds: instance.serializeFaceTextureIds(),
      defaultSurface,
      faceSurfaces: instance.serializeFaceSurfaces(),
      defaultMapping,
      faceMappings: instance.serializeFaceMappings(),
      ...this.encodeBrushGeometry(instance.brush),
    };
  }

  /**
   * Encodes a Vector3 into a plain object.
   *
   * @param vector Source vector.
   * @returns Serializable xyz components.
   */
  private static encodeVector3(vector: THREE.Vector3): { x: number; y: number; z: number } {
    return { x: vector.x, y: vector.y, z: vector.z };
  }

  /**
   * Encodes an Euler into a plain object (order restored on decode).
   *
   * @param euler Source rotation.
   * @returns Serializable xyz components.
   */
  private static encodeEuler(euler: THREE.Euler): { x: number; y: number; z: number } {
    return { x: euler.x, y: euler.y, z: euler.z };
  }

  /**
   * Encodes brush wing-edge topology and vertices.
   *
   * @param brush Source brush geometry.
   * @returns Geometry fields for a serialized brush.
   */
  private static encodeBrushGeometry(
    brush: SolidBrush,
  ): Pick<SerializedSolidBrush, 'vertices' | 'wingEdges' | 'edgeFaceIndices' | 'faces'> {
    return {
      vertices: this.flattenVertices(brush.vertices),
      wingEdges: brush.wingEdges.map((edge) => ({
        vertexIndex: edge.vertexIndex,
        twinIndex: edge.twinIndex,
      })),
      edgeFaceIndices: brush.edgeFaceIndices.slice(),
      faces: brush.faces.map((face) => ({
        firstEdge: face.firstEdge,
        edgeCount: face.edgeCount,
        surfaceIndex: face.surfaceIndex,
      })),
    };
  }

  /**
   * Decodes one brush instance.
   *
   * @param data Serialized brush.
   * @returns Brush instance.
   */
  static brushDecode(data: SerializedSolidBrush): SolidBrushInstance {
    const brush = this.decodeBrushGeometry(data);
    const instance = new SolidBrushInstance(data.id, data.name, brush, data.operation ?? SolidOperation.Additive);
    instance.position.set(data.position.x, data.position.y, data.position.z);
    instance.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z, 'XYZ');
    instance.scale.set(data.scale.x, data.scale.y, data.scale.z);
    instance.visible = data.visible !== false;
    this.restoreBrushSurfaceData(instance, data);
    return instance;
  }

  /**
   * Restores default and per-face UV mappings, with legacy texture-id fallback.
   *
   * @param instance Target brush instance.
   * @param data Serialized brush data.
   */
  private static restoreBrushSurfaceData(instance: SolidBrushInstance, data: SerializedSolidBrush): void {
    if (data.defaultSurface || data.faceSurfaces) {
      instance.restoreFaceSurfaces(data.defaultSurface, data.faceSurfaces);
      return;
    }
    if (data.defaultMapping || data.faceMappings) {
      instance.restoreFaceMappings(
        this.normalizeMapping(data.defaultMapping, data.surfaceTextureId),
        this.normalizeFaceMappingList(data.faceMappings),
      );
      return;
    }
    instance.surfaceTextureId = data.surfaceTextureId || DEFAULT_CHECKER_TEXTURE_ID;
    instance.restoreFaceTextureIds(data.faceTextureIds);
  }

  /**
   * Normalizes a stored mapping or builds a default from a legacy texture id.
   *
   * @param mapping Optional stored mapping.
   * @param fallbackTextureId Legacy texture id fallback.
   * @returns Normalized mapping.
   */
  private static normalizeMapping(
    mapping: FaceTextureMapping | ReturnType<typeof serializeFaceTextureMapping> | undefined,
    fallbackTextureId?: string,
  ): FaceTextureMapping {
    if (mapping) {
      const copy = deserializeFaceTextureMapping(mapping as never);
      if (!copy.textureId) {
        copy.textureId = fallbackTextureId || DEFAULT_CHECKER_TEXTURE_ID;
      }
      return copy;
    }
    return createDefaultFaceTextureMapping(fallbackTextureId || DEFAULT_CHECKER_TEXTURE_ID);
  }

  /**
   * Normalizes a sparse face mapping list from JSON.
   *
   * @param faceMappings Optional sparse list.
   * @returns Cloned sparse list.
   */
  private static normalizeFaceMappingList(
    faceMappings: (FaceTextureMapping | undefined)[] | undefined,
  ): (FaceTextureMapping | undefined)[] {
    if (!faceMappings) return [];
    return faceMappings.map((mapping) => (mapping ? this.normalizeMapping(mapping) : undefined));
  }

  /**
   * Rebuilds wing-edge brush geometry from serialized arrays. Falls back to a
   * unit box when topology data is missing.
   *
   * @param data Serialized brush.
   * @returns Solid brush geometry.
   */
  private static decodeBrushGeometry(data: SerializedSolidBrush): SolidBrush {
    if (!data.vertices || data.vertices.length < 12 || !data.wingEdges?.length) {
      return SolidBrushFactory.createCenteredBox(2, 2, 2);
    }
    const brush = new SolidBrush();
    brush.vertices = this.inflateVertices(data.vertices);
    brush.wingEdges = data.wingEdges.map((edge) => createWingEdge(edge.vertexIndex, edge.twinIndex));
    brush.edgeFaceIndices = data.edgeFaceIndices?.slice() ?? [];
    brush.faces = (data.faces ?? []).map((face) => createSolidFace(face.firstEdge, face.edgeCount, face.surfaceIndex));
    if (brush.edgeFaceIndices.length !== brush.wingEdges.length) {
      brush.rebuildEdgeFaceIndices();
    }
    brush.recalculatePlanes();
    return brush;
  }

  /**
   * Flattens vertex vectors into a number array.
   *
   * @param vertices Vertex list.
   * @returns Flat xyz components.
   */
  private static flattenVertices(vertices: THREE.Vector3[]): number[] {
    const result: number[] = [];
    for (const vertex of vertices) {
      result.push(vertex.x, vertex.y, vertex.z);
    }
    return result;
  }

  /**
   * Inflates a flat xyz array into Vector3 vertices.
   *
   * @param values Flat components.
   * @returns Vertex list.
   */
  private static inflateVertices(values: number[]): THREE.Vector3[] {
    const vertices: THREE.Vector3[] = [];
    for (let index = 0; index + 2 < values.length; index += 3) {
      vertices.push(new THREE.Vector3(values[index], values[index + 1], values[index + 2]));
    }
    return vertices;
  }
}
