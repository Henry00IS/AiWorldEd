import * as THREE from 'three';
import { SolidBrush } from '../brush/solid_brush.js';
import { SolidBrushFactory } from '../brush/solid_brush_factory.js';
import { SolidBrushInstance } from '../model/solid_brush_instance.js';
import { SolidModel } from '../model/solid_model.js';
import { SolidOperation } from '../types/solid_operation.js';
import { createWingEdge, createSolidFace } from '../types/wing_edge.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '../../texture/texture_id.js';
import {
  FaceTextureMapping,
  cloneFaceTextureMapping,
  createDefaultFaceTextureMapping
} from '../../texture/face_texture_mapping.js';

/**
 * Serializable snapshot of a solid brush instance.
 */
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
  /** Default UV/texture mapping for faces without overrides. */
  defaultMapping?: FaceTextureMapping;
  /** Sparse per-face full UV/texture mappings. */
  faceMappings?: (FaceTextureMapping | undefined)[];
  vertices: number[];
  wingEdges: Array<{ vertexIndex: number; twinIndex: number }>;
  edgeFaceIndices: number[];
  faces: Array<{ firstEdge: number; edgeCount: number; surfaceIndex: number }>;
}

/**
 * Serializable snapshot of a solid model (brushes only; mesh geometry is rebuilt).
 */
export interface SerializedSolidModel {
  brushes: SerializedSolidBrush[];
}

/**
 * Encodes and decodes solid models for scene persistence.
 */
export class SolidModelCodec {
  /**
   * Serializes a solid model into a JSON-safe snapshot.
   * @param model Solid model to encode.
   * @returns Serialized solid model payload.
   */
  static encode(model: SolidModel): SerializedSolidModel {
    model.syncBrushesFromScene();
    model.syncAuthoredMappingsFromResultMesh();
    return {
      brushes: model.getBrushes().map((brush) => this.encodeBrush(brush))
    };
  }

  /**
   * Rebuilds a solid model from a serialized snapshot.
   * @param data Serialized solid model.
   * @param name Root display name.
   * @returns Restored solid model with rebuilt geometry.
   */
  static decode(data: SerializedSolidModel, name: string): SolidModel {
    const model = new SolidModel(name);
    for (const brushData of data.brushes ?? []) {
      const instance = this.decodeBrush(brushData);
      model.addBrushInstance(instance);
    }
    model.rebuild(true);
    return model;
  }

  /**
   * Encodes one brush instance.
   * @param instance Brush instance.
   * @returns Serialized brush.
   */
  private static encodeBrush(instance: SolidBrushInstance): SerializedSolidBrush {
    instance.pullTransformFromMesh();
    const brush = instance.brush;
    const defaultMapping = instance.serializeDefaultMapping();
    const faceMappings = instance.serializeFaceMappings();
    return {
      id: instance.id,
      name: instance.name,
      operation: instance.operation,
      position: {
        x: instance.position.x,
        y: instance.position.y,
        z: instance.position.z
      },
      rotation: {
        x: instance.rotation.x,
        y: instance.rotation.y,
        z: instance.rotation.z
      },
      scale: {
        x: instance.scale.x,
        y: instance.scale.y,
        z: instance.scale.z
      },
      visible: instance.visible,
      surfaceTextureId: defaultMapping.textureId,
      faceTextureIds: instance.serializeFaceTextureIds(),
      defaultMapping,
      faceMappings,
      vertices: this.flattenVertices(brush.vertices),
      wingEdges: brush.wingEdges.map((edge) => ({
        vertexIndex: edge.vertexIndex,
        twinIndex: edge.twinIndex
      })),
      edgeFaceIndices: brush.edgeFaceIndices.slice(),
      faces: brush.faces.map((face) => ({
        firstEdge: face.firstEdge,
        edgeCount: face.edgeCount,
        surfaceIndex: face.surfaceIndex
      }))
    };
  }

  /**
   * Decodes one brush instance.
   * @param data Serialized brush.
   * @returns Brush instance.
   */
  private static decodeBrush(data: SerializedSolidBrush): SolidBrushInstance {
    const brush = this.decodeBrushGeometry(data);
    const instance = new SolidBrushInstance(
      data.id,
      data.name,
      brush,
      data.operation ?? SolidOperation.Additive
    );
    instance.position.set(data.position.x, data.position.y, data.position.z);
    instance.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z, 'XYZ');
    instance.scale.set(data.scale.x, data.scale.y, data.scale.z);
    instance.visible = data.visible !== false;
    this.restoreBrushSurfaceData(instance, data);
    return instance;
  }

  /**
   * Restores default and per-face UV mappings, with legacy texture-id fallback.
   * @param instance Target brush instance.
   * @param data Serialized brush data.
   */
  private static restoreBrushSurfaceData(
    instance: SolidBrushInstance,
    data: SerializedSolidBrush
  ): void {
    if (data.defaultMapping || data.faceMappings) {
      instance.restoreFaceMappings(
        this.normalizeMapping(data.defaultMapping, data.surfaceTextureId),
        this.normalizeFaceMappingList(data.faceMappings)
      );
      return;
    }
    instance.surfaceTextureId =
      data.surfaceTextureId || DEFAULT_CHECKER_TEXTURE_ID;
    instance.restoreFaceTextureIds(data.faceTextureIds);
  }

  /**
   * Normalizes a stored mapping or builds a default from a legacy texture id.
   * @param mapping Optional stored mapping.
   * @param fallbackTextureId Legacy texture id fallback.
   * @returns Normalized mapping.
   */
  private static normalizeMapping(
    mapping: FaceTextureMapping | undefined,
    fallbackTextureId?: string
  ): FaceTextureMapping {
    if (mapping) {
      const copy = cloneFaceTextureMapping(mapping);
      if (!copy.textureId) {
        copy.textureId = fallbackTextureId || DEFAULT_CHECKER_TEXTURE_ID;
      }
      return copy;
    }
    return createDefaultFaceTextureMapping(
      fallbackTextureId || DEFAULT_CHECKER_TEXTURE_ID
    );
  }

  /**
   * Normalizes a sparse face mapping list from JSON.
   * @param faceMappings Optional sparse list.
   * @returns Cloned sparse list.
   */
  private static normalizeFaceMappingList(
    faceMappings: (FaceTextureMapping | undefined)[] | undefined
  ): (FaceTextureMapping | undefined)[] {
    if (!faceMappings) return [];
    return faceMappings.map((mapping) =>
      mapping ? this.normalizeMapping(mapping) : undefined
    );
  }

  /**
   * Rebuilds wing-edge brush geometry from serialized arrays.
   * Falls back to a unit box when topology data is missing.
   * @param data Serialized brush.
   * @returns Solid brush geometry.
   */
  private static decodeBrushGeometry(data: SerializedSolidBrush): SolidBrush {
    if (!data.vertices || data.vertices.length < 12 || !data.wingEdges?.length) {
      return SolidBrushFactory.createCenteredBox(2, 2, 2);
    }
    const brush = new SolidBrush();
    brush.vertices = this.inflateVertices(data.vertices);
    brush.wingEdges = data.wingEdges.map((edge) =>
      createWingEdge(edge.vertexIndex, edge.twinIndex)
    );
    brush.edgeFaceIndices = data.edgeFaceIndices?.slice() ?? [];
    brush.faces = (data.faces ?? []).map((face) =>
      createSolidFace(face.firstEdge, face.edgeCount, face.surfaceIndex)
    );
    if (brush.edgeFaceIndices.length !== brush.wingEdges.length) {
      brush.rebuildEdgeFaceIndices();
    }
    brush.recalculatePlanes();
    return brush;
  }

  /**
   * Flattens vertex vectors into a number array.
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
   * @param values Flat components.
   * @returns Vertex list.
   */
  private static inflateVertices(values: number[]): THREE.Vector3[] {
    const vertices: THREE.Vector3[] = [];
    for (let index = 0; index + 2 < values.length; index += 3) {
      vertices.push(
        new THREE.Vector3(values[index], values[index + 1], values[index + 2])
      );
    }
    return vertices;
  }
}
