import * as THREE from 'three';
import { FbxNodeIdPool } from './fbx_node_id_pool.js';
import { buildFbxMeshPayload, type FbxMeshPayload } from './fbx_mesh_payload.js';
import { FbxSurfaceRegistry, type FbxSurfaceRecord } from './fbx_surface_records.js';

/**
 * Intermediate plan describing the static FBX scene graph for one export. Built
 * by walking the filtered export root; turned into FBX records by
 * fbxExportDocumentBuild.
 */

/** Local TRS used for Model Lcl properties. */
export interface FbxLocalTransform {
  /** Translation xyz. */
  translation: [number, number, number];
  /** Rotation in degrees for FBX rotation order XYZ (X applied first). */
  rotationDegrees: [number, number, number];
  /** Scale xyz. */
  scale: [number, number, number];
}

/** One FBX Model node (Null group or Mesh). */
export interface FbxModelPlan {
  /** Object id. */
  modelId: number;
  /** Display name. */
  name: string;
  /** Mesh or Null. */
  modelKind: 'Mesh' | 'Null';
  /** Local transform. */
  transform: FbxLocalTransform;
  /** Geometry payload when Mesh; null for Null. */
  meshPayload: FbxMeshPayload | null;
  /** Geometry object id when Mesh; null for Null. */
  geometryId: number | null;
  /** Surfaces attached to this model (mesh only). */
  surfaces: FbxSurfaceRecord[];
}

/** One axis of the file's axis system: index (0 = X, 1 = Y, 2 = Z) and sign. */
export type FbxExportAxis = readonly [axis: number, sign: 1 | -1];

/** Axis system written into GlobalSettings. */
export interface FbxExportAxes {
  up: FbxExportAxis;
  front: FbxExportAxis;
  coord: FbxExportAxis;
}

/** Y up, +Z front, +X coord: the editor's axes and those of Y-up targets. */
const FBX_EXPORT_AXES_Y_UP: FbxExportAxes = Object.freeze<FbxExportAxes>({
  up: [1, 1],
  front: [2, 1],
  coord: [0, 1],
});

/** Full export plan passed to the document builder. */
export interface FbxExportPlan {
  /** Id pool (already holds connections). */
  idPool: FbxNodeIdPool;
  /** Model plans in depth-first registration order. */
  models: FbxModelPlan[];
  /** Surface registry with materials and maps. */
  surfaces: FbxSurfaceRegistry;
  /**
   * FBX UnitScaleFactor (centimeters per file unit). Must match whether the
   * export root already baked the export space's unit conversion.
   */
  unitScaleFactor: number;
  /** Axis system the file's data is written in. */
  axes: FbxExportAxes;
}

/**
 * Walks the children of an export root and builds a plan of models, meshes,
 * materials, and connections. Parent links use local hierarchy; the root's
 * children are the top-level models (parent 0). The root itself is not written:
 * it is an identity container (the export space's axes and units are baked into
 * the nodes and geometry).
 *
 * @param exportRoot Filtered export root.
 * @param unitScaleFactor FBX UnitScaleFactor for GlobalSettings (cm per unit).
 * @param axes Axis system for GlobalSettings.
 * @returns Export plan ready for serialization.
 */
export function buildFbxExportPlan(
  exportRoot: THREE.Object3D,
  unitScaleFactor = 100,
  axes: FbxExportAxes = FBX_EXPORT_AXES_Y_UP,
): FbxExportPlan {
  const idPool = new FbxNodeIdPool();
  const surfaces = new FbxSurfaceRegistry(idPool);
  const models: FbxModelPlan[] = [];
  exportRoot.children.forEach((child) => walkExportNode(child, 0, idPool, surfaces, models));
  return { idPool, models, surfaces, unitScaleFactor, axes };
}

/**
 * Returns the axis system of a file whose data `transform` converted from
 * editor space. Y-up data keeps the Y-up header; other data (Z-up targets)
 * declares its real up axis, the front axis opposite its forward axis and the
 * coord axis forward x up, so readers that honour the header do not convert it
 * a second time.
 *
 * @param transform Model file transform (an axis-aligned rotation times scale).
 * @returns Axis system.
 */
export function fbxExportAxesFor(transform: THREE.Matrix4): FbxExportAxes {
  const basis = new THREE.Matrix3().setFromMatrix4(transform);
  const up = new THREE.Vector3(0, 1, 0).applyMatrix3(basis).normalize();
  if (up.y > 0.5) return FBX_EXPORT_AXES_Y_UP;
  const forward = new THREE.Vector3(0, 0, -1).applyMatrix3(basis).normalize();
  const coord = new THREE.Vector3().crossVectors(forward, up);
  return { up: fbxExportAxisOf(up), front: fbxExportAxisOf(forward.negate()), coord: fbxExportAxisOf(coord) };
}

/**
 * Returns the signed axis an axis-aligned unit vector points along.
 *
 * @param vector Axis-aligned unit vector.
 * @returns Axis index and sign.
 */
function fbxExportAxisOf(vector: THREE.Vector3): FbxExportAxis {
  const values = vector.toArray();
  const axis = values.findIndex((value) => Math.abs(value) > 0.5);
  return [axis, values[axis]! > 0 ? 1 : -1];
}

/**
 * Recursively registers one node and its children.
 *
 * @param object Current object.
 * @param parentModelId Parent model id, or 0 for scene root.
 * @param idPool Id and link pool.
 * @param surfaces Surface registry.
 * @param models Accumulated model plans.
 */
function walkExportNode(
  object: THREE.Object3D,
  parentModelId: number,
  idPool: FbxNodeIdPool,
  surfaces: FbxSurfaceRegistry,
  models: FbxModelPlan[],
): void {
  if (!object.visible) return;
  const plan = createModelPlan(object, idPool, surfaces);
  if (!plan) {
    object.children.forEach((child) => walkExportNode(child, parentModelId, idPool, surfaces, models));
    return;
  }
  models.push(plan);
  idPool.linkChildToParent(plan.modelId, parentModelId);
  if (plan.geometryId !== null) {
    idPool.linkChildToParent(plan.geometryId, plan.modelId);
  }
  linkUniqueSurfacesToModel(plan, idPool);
  object.children.forEach((child) => walkExportNode(child, plan.modelId, idPool, surfaces, models));
}

/**
 * Connects each unique material on a model once (avoids duplicate OO links when
 * a multi-material mesh reuses the same surface slot).
 *
 * @param plan Model plan with surfaces.
 * @param idPool Connection pool.
 */
function linkUniqueSurfacesToModel(plan: FbxModelPlan, idPool: FbxNodeIdPool): void {
  const linked = new Set<number>();
  for (const surface of plan.surfaces) {
    if (linked.has(surface.materialId)) continue;
    linked.add(surface.materialId);
    idPool.linkChildToParent(surface.materialId, plan.modelId);
  }
}

/**
 * Builds a model plan for a mesh or group, or null for unsupported types.
 *
 * @param object Scene object.
 * @param idPool Id pool.
 * @param surfaces Surface registry.
 * @returns Model plan or null.
 */
function createModelPlan(
  object: THREE.Object3D,
  idPool: FbxNodeIdPool,
  surfaces: FbxSurfaceRegistry,
): FbxModelPlan | null {
  if (object instanceof THREE.Mesh) {
    return createMeshModelPlan(object, idPool, surfaces);
  }
  if (object instanceof THREE.Group || object.type === 'Object3D') {
    return createNullModelPlan(object, idPool);
  }
  return null;
}

/**
 * Builds a Mesh model plan with geometry and surfaces.
 *
 * @param mesh Export mesh.
 * @param idPool Id pool.
 * @param surfaces Surface registry.
 * @returns Mesh model plan, or null when geometry lacks positions.
 */
function createMeshModelPlan(
  mesh: THREE.Mesh,
  idPool: FbxNodeIdPool,
  surfaces: FbxSurfaceRegistry,
): FbxModelPlan | null {
  const surfaceList = surfaces.registerMeshSurfaces(mesh);
  const payload = buildFbxMeshPayload(mesh.geometry, surfaceList.length);
  if (!payload) return null;
  const geometryId = idPool.takeId();
  return {
    modelId: idPool.takeId(),
    name: sanitizeModelName(mesh.name, 'Mesh'),
    modelKind: 'Mesh',
    transform: readLocalTransform(mesh),
    meshPayload: payload,
    geometryId,
    surfaces: surfaceList,
  };
}

/**
 * Builds a Null model plan for groups and empty nodes.
 *
 * @param object Group or Object3D.
 * @param idPool Id pool.
 * @returns Null model plan.
 */
function createNullModelPlan(object: THREE.Object3D, idPool: FbxNodeIdPool): FbxModelPlan {
  return {
    modelId: idPool.takeId(),
    name: sanitizeModelName(object.name, 'Node'),
    modelKind: 'Null',
    transform: readLocalTransform(object),
    meshPayload: null,
    geometryId: null,
    surfaces: [],
  };
}

/**
 * Reads local translation, rotation degrees (FBX order XYZ: X applied first,
 * then Y, then Z) and scale from an object matrix.
 *
 * @param object Scene object (supports matrixAutoUpdate false roots).
 * @returns Local transform for Lcl properties.
 */
function readLocalTransform(object: THREE.Object3D): FbxLocalTransform {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  object.matrix.decompose(position, quaternion, scale);
  const euler = new THREE.Euler().setFromQuaternion(quaternion, 'ZYX');
  return {
    translation: [position.x, position.y, position.z],
    rotationDegrees: [
      THREE.MathUtils.radToDeg(euler.x),
      THREE.MathUtils.radToDeg(euler.y),
      THREE.MathUtils.radToDeg(euler.z),
    ],
    scale: [scale.x, scale.y, scale.z],
  };
}

/**
 * Sanitizes a model display name for FBX Model:: labels.
 *
 * @param name Object name.
 * @param fallback Fallback when empty.
 * @returns Non-empty display name.
 */
function sanitizeModelName(name: string, fallback: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}
