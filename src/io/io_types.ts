/**
 * Data contracts for scene persistence operations.
 * Defines the JSON structure used for saving and loading scenes.
 */

/**
 * Supported geometry classifications in scene files.
 * Primitive types store constructor params; buffer stores raw vertex data.
 */
export type GeometryType =
  | 'box'
  | 'sphere'
  | 'cylinder'
  | 'plane'
  | 'buffer';

/**
 * Raw BufferGeometry payload for CSG and other non-primitive meshes.
 */
export interface BufferGeometryData {
  /** Interleaved position components (x, y, z, ...). */
  position: number[];
  /** Optional interleaved normal components (x, y, z, ...). */
  normal?: number[];
  /** Optional interleaved UV components (u, v, ...). */
  uv?: number[];
  /** Optional triangle indices. */
  index?: number[];
}

/**
 * Serialized planar texture mapping for a coplanar face region.
 */
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

/**
 * Container for a complete serializable scene.
 */
export interface SceneJSON {
  /** Schema version number for compatibility checking. */
  version: number;
  /** Flat list of all objects in the scene. */
  objects: ObjectEntry[];
}

/**
 * A single object entry in the serialized scene.
 */
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
  /** Material color as a hex number for mesh objects. */
  materialColor?: number;
  /** Per-face texture projection parameters for UV re-bake. */
  faceTextureMaps?: SerializedFaceTextureMap[];
}
