import * as THREE from 'three';
import { FbxNodeIdPool } from './fbx_node_id_pool.js';
import { buildFbxMeshPayload, type FbxMeshPayload } from './fbx_mesh_payload.js';
import { FbxSurfaceRegistry, type FbxSurfaceRecord } from './fbx_surface_records.js';
import { buildFbxCoordinateSettings, type FbxCoordinateSettings } from './fbx_coordinate_settings.js';
import { EDITOR_COORDINATE_SPACE, isReflectionMatrix } from '@/io/coordinates/coordinate_space_transform.js';

/**
 * Intermediate plan describing the static FBX scene graph for one export. Built
 * by walking the filtered export root; serialized by the ASCII writer.
 */

/** Local TRS used for Model Lcl properties. */
export interface FbxLocalTransform {
  /** Translation xyz. */
  translation: [number, number, number];
  /** Euler XYZ rotation in degrees. */
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

/** Full export plan passed to the ASCII serializer. */
export interface FbxExportPlan {
  /** Id pool (already holds connections). */
  idPool: FbxNodeIdPool;
  /** Model plans in depth-first registration order. */
  models: FbxModelPlan[];
  /** Surface registry with materials and maps. */
  surfaces: FbxSurfaceRegistry;
  /**
   * FBX UnitScaleFactor (centimeters per file unit). Must match whether the
   * export root already baked profile unit conversion.
   */
  unitScaleFactor: number;
  /** Coordinate basis metadata for FBX GlobalSettings. */
  coordinateSettings: FbxCoordinateSettings;
}

/**
 * Walks an export root and builds a plan of models, meshes, materials, and
 * connections. Parent links use local hierarchy; top-level models attach to 0.
 * Profile conversion is baked into the detached export scene before this plan
 * is built, so the serialized hierarchy contains target-space transforms.
 *
 * @param exportRoot Filtered scene root with any profile conversion already
 *   baked.
 * @param unitScaleFactor FBX UnitScaleFactor for GlobalSettings (cm per unit).
 * @param coordinateSpace Target coordinate space for GlobalSettings metadata.
 * @param reverseTriangleWinding Whether the profile transform reflects the
 *   export basis.
 * @returns Export plan ready for serialization.
 */
export function buildFbxExportPlan(
  exportRoot: THREE.Object3D,
  unitScaleFactor = 100,
  coordinateSpace = EDITOR_COORDINATE_SPACE,
  reverseTriangleWinding = false,
): FbxExportPlan {
  const idPool = new FbxNodeIdPool();
  const surfaces = new FbxSurfaceRegistry(idPool);
  const models: FbxModelPlan[] = [];
  walkExportNode(exportRoot, 0, idPool, surfaces, models, reverseTriangleWinding);
  return {
    idPool,
    models,
    surfaces,
    unitScaleFactor,
    coordinateSettings: buildFbxCoordinateSettings(coordinateSpace),
  };
}

/**
 * Recursively registers one node and its children.
 *
 * @param object Current object.
 * @param parentModelId Parent model id, or 0 for scene root.
 * @param idPool Id and link pool.
 * @param surfaces Surface registry.
 * @param models Accumulated model plans.
 * @param reverseTriangleWinding Whether the profile transform reflects the
 *   export basis.
 */
function walkExportNode(
  object: THREE.Object3D,
  parentModelId: number,
  idPool: FbxNodeIdPool,
  surfaces: FbxSurfaceRegistry,
  models: FbxModelPlan[],
  reverseTriangleWinding: boolean,
): void {
  if (!object.visible) return;
  const plan = createModelPlan(object, idPool, surfaces, reverseTriangleWinding);
  if (!plan) {
    object.children.forEach((child) =>
      walkExportNode(child, parentModelId, idPool, surfaces, models, reverseTriangleWinding),
    );
    return;
  }
  models.push(plan);
  idPool.linkChildToParent(plan.modelId, parentModelId);
  if (plan.geometryId !== null) {
    idPool.linkChildToParent(plan.geometryId, plan.modelId);
  }
  linkUniqueSurfacesToModel(plan, idPool);
  object.children.forEach((child) =>
    walkExportNode(child, plan.modelId, idPool, surfaces, models, reverseTriangleWinding),
  );
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
 * @param reverseTriangleWinding Whether the profile transform reflects the
 *   export basis.
 * @returns Model plan or null.
 */
function createModelPlan(
  object: THREE.Object3D,
  idPool: FbxNodeIdPool,
  surfaces: FbxSurfaceRegistry,
  reverseTriangleWinding: boolean,
): FbxModelPlan | null {
  if (object instanceof THREE.Mesh) {
    return createMeshModelPlan(object, idPool, surfaces, reverseTriangleWinding);
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
 * @param profileReverseTriangleWinding Whether the profile transform reflects
 *   the export basis.
 * @returns Mesh model plan, or null when geometry lacks positions.
 */
function createMeshModelPlan(
  mesh: THREE.Mesh,
  idPool: FbxNodeIdPool,
  surfaces: FbxSurfaceRegistry,
  profileReverseTriangleWinding: boolean,
): FbxModelPlan | null {
  const surfaceList = surfaces.registerMeshSurfaces(mesh);
  const meshReverseTriangleWinding = isReflectionMatrix(mesh.matrixWorld);
  const reverseTriangleWinding = profileReverseTriangleWinding !== meshReverseTriangleWinding;
  const payload = buildFbxMeshPayload(mesh.geometry, surfaceList.length, reverseTriangleWinding);
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
 * Reads local translation, Euler XYZ degrees, and scale from an object matrix.
 *
 * @param object Scene object (supports matrixAutoUpdate false roots).
 * @returns Local transform for Lcl properties.
 */
function readLocalTransform(object: THREE.Object3D): FbxLocalTransform {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  object.matrix.decompose(position, quaternion, scale);
  const euler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ');
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
