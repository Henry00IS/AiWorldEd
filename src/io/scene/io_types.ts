/**
 * Data contracts for scene persistence operations. Defines the JSON structure
 * used for saving and loading scenes.
 */

import type { SurfaceUvMatrixSerialized } from '@/texture/uv_matrix/surface_uv_matrix.js';

/**
 * Supported geometry classifications in scene files. Every mesh stores raw
 * vertex data; primitive types also keep their constructor params.
 */
export type GeometryType = 'box' | 'sphere' | 'cylinder' | 'plane' | 'buffer';

/** Raw BufferGeometry payload for CSG and other non-primitive meshes. */
export interface BufferGeometryData {
  /** Interleaved position components (x, y, z, ...). */
  position: number[];
  /** Optional interleaved normal components (x, y, z, ...). */
  normal?: number[];
  /** Optional interleaved UV components (u, v, ...). */
  uv?: number[];
  /** Optional triangle indices. */
  index?: number[];
  /** Optional material groups over the index range. */
  groups?: Array<{ start: number; count: number; materialIndex: number }>;
}

/** Editable polygon document of a mesh, so peers edit the same faces. */
export interface MeshDocumentData {
  /** Interleaved vertex positions (x, y, z, ...). */
  position: number[];
  /** Vertex index loop of every face, in face order. */
  faces: number[][];
  /** Interleaved corner u, v for every face corner, faces in order. */
  uv?: number[];
  /** Planar surface of each face, null when the face uses corner UVs only. */
  surfaces?: Array<{ textureId: string; uv: SurfaceUvMatrixSerialized } | null>;
}

/** Serialized planar texture mapping for a coplanar face region. */
export interface SerializedFaceTextureMap {
  triangleIndices: number[];
  mapping: {
    align: string;
    scaleU: number;
    scaleV: number;
    offsetU: number;
    offsetV: number;
    rotationDeg: number;
    /** Stable texture identity for export / rebind (checker id or path). */
    textureId?: string;
  };
}

/** Container for a complete serializable scene. */
export interface SceneJSON {
  /** Schema version number for compatibility checking. */
  version: number;
  /** Flat list of all objects in the scene. */
  objects: ObjectEntry[];
}

/** A single object entry in the serialized scene. */
export interface ObjectEntry {
  /** Unique identifier matching THREE.Object3D.uuid. */
  uuid: string;
  /** Display name of the object. */
  name: string;
  /** Object type classification. */
  type: 'mesh' | 'group';
  /** World-local position. */
  position: { x: number; y: number; z: number };
  /** Euler rotation in XYZ order. */
  rotation: { x: number; y: number; z: number };
  /** Uniform or per-axis scale. */
  scale: { x: number; y: number; z: number };
  /** Whether the object is visible in the scene. */
  visible: boolean;
  /** UUID of the parent group, or null for top-level objects. */
  parentId: string | null;
  /** Geometry type for mesh objects. */
  geometryType?: GeometryType;
  /** Constructor parameters for primitive geometry types. */
  geometryParams?: Record<string, number>;
  /** Raw vertex data for buffer geometry meshes (CSG, etc.). */
  geometryData?: BufferGeometryData;
  /** Editable polygon document, when the mesh carries one. */
  meshDocument?: MeshDocumentData;
  /** Single texture identity of a free content mesh. */
  contentTextureId?: string;
  /** False when the mesh is shown without black outline edges. */
  decorativeEdges?: boolean;
  /** Material color as a hex number for mesh objects. */
  materialColor?: number;
  /** Per-face texture projection parameters for UV re-bake. */
  faceTextureMaps?: SerializedFaceTextureMap[];
  /** Present when the mesh is a bevel volume. Distance is world units. */
  modifierBevel?: {
    distance: number;
    segments?: number;
    angleDegrees?: number;
    uvFlow?: string;
    uvLayout?: string;
    textureId?: string;
    blacklist?: string[];
    uvScaleU?: number;
    uvScaleV?: number;
    uvOffsetU?: number;
    uvOffsetV?: number;
    uvRotation?: number;
    uvOwner?: string;
    uvPivot?: string;
    uvSpace?: string;
  };
  /** Optional solid-model brush tree for CSG solid meshes. */
  solidModel?: {
    brushes: Array<{
      id: string;
      name: string;
      operation: number;
      position: { x: number; y: number; z: number };
      rotation: { x: number; y: number; z: number };
      scale: { x: number; y: number; z: number };
      visible: boolean;
      surfaceTextureId?: string;
      faceTextureIds?: (string | undefined)[];
      defaultMapping?: SerializedFaceTextureMap['mapping'];
      faceMappings?: Array<SerializedFaceTextureMap['mapping'] | undefined>;
      vertices: number[];
      wingEdges: Array<{ vertexIndex: number; twinIndex: number }>;
      edgeFaceIndices: number[];
      faces: Array<{ firstEdge: number; edgeCount: number; surfaceIndex: number }>;
    }>;
    /** When true, CSG starts solid so subtractives carve rooms. */
    invertedWorld?: boolean;
    /**
     * Optional hierarchical CSG tree under the solid root (compound groups).
     * When omitted, brushes are a flat sibling list.
     */
    hierarchy?: Array<Record<string, unknown>>;
  };
}
