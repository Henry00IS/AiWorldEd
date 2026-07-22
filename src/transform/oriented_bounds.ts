import * as THREE from 'three';
import { BoundsFace } from '../types/bounds_face.js';

/**
 * Oriented bounding box used by the Bounds tool.
 * Center and orientation are in world space; half extents are along local axes.
 */
export interface OrientedBoundsData {
  center: THREE.Vector3;
  quaternion: THREE.Quaternion;
  halfExtents: THREE.Vector3;
}

/**
 * Builds oriented bounds for selected meshes.
 * A single mesh uses its local geometry AABB transformed by the mesh pose.
 * Multiple meshes use a shared world-axis-aligned AABB of the selection.
 */
export class OrientedBoundsBuilder {
  private readonly temporaryBox: THREE.Box3;
  private readonly temporaryCenter: THREE.Vector3;
  private readonly temporarySize: THREE.Vector3;
  private readonly temporaryScale: THREE.Vector3;

  /**
   * Creates a new oriented bounds builder with reusable scratch vectors.
   */
  constructor() {
    this.temporaryBox = new THREE.Box3();
    this.temporaryCenter = new THREE.Vector3();
    this.temporarySize = new THREE.Vector3();
    this.temporaryScale = new THREE.Vector3();
  }

  /**
   * Computes oriented bounds for the given selection.
   * @param meshes The selected meshes.
   * @returns Oriented bounds data, or null when the selection is empty.
   */
  buildFromMeshes(meshes: THREE.Mesh[]): OrientedBoundsData | null {
    const validMeshes = this.filterMeshesWithGeometry(meshes);
    if (validMeshes.length === 0) return null;
    if (validMeshes.length === 1) {
      return this.buildFromSingleMesh(validMeshes[0]);
    }
    return this.buildWorldAxisAlignedUnion(validMeshes);
  }

  /**
   * Keeps only meshes that still have usable geometry.
   * Guards against disposed meshes or non-content objects in selection.
   * @param meshes Candidate meshes.
   * @returns Meshes safe to measure.
   */
  private filterMeshesWithGeometry(meshes: THREE.Mesh[]): THREE.Mesh[] {
    return meshes.filter((mesh) => {
      return mesh instanceof THREE.Mesh && mesh.geometry != null;
    });
  }

  /**
   * Returns the outward unit normal of a face in world space.
   * @param bounds The oriented bounds.
   * @param face The face whose normal is requested.
   * @returns A new world-space normal vector.
   */
  getFaceNormal(bounds: OrientedBoundsData, face: BoundsFace): THREE.Vector3 {
    const local = getBoundsFaceLocalNormal(face);
    return local.applyQuaternion(bounds.quaternion).normalize();
  }

  /**
   * Returns the world-space center point of a bounds face.
   * @param bounds The oriented bounds.
   * @param face The face whose center is requested.
   * @returns A new world-space face center.
   */
  getFaceCenter(bounds: OrientedBoundsData, face: BoundsFace): THREE.Vector3 {
    const normal = this.getFaceNormal(bounds, face);
    const half = getBoundsFaceHalfExtent(bounds.halfExtents, face);
    return bounds.center.clone().addScaledVector(normal, half);
  }

  /**
   * Builds OBB data from one mesh using geometry AABB and world pose.
   * @param mesh The mesh to measure.
   * @returns Oriented bounds for the mesh.
   */
  private buildFromSingleMesh(mesh: THREE.Mesh): OrientedBoundsData {
    mesh.updateMatrixWorld(true);
    const localBox = this.computeGeometryLocalBox(mesh);
    localBox.getCenter(this.temporaryCenter);
    localBox.getSize(this.temporarySize);
    const worldCenter = this.temporaryCenter.clone().applyMatrix4(mesh.matrixWorld);
    const quaternion = new THREE.Quaternion();
    mesh.getWorldQuaternion(quaternion);
    mesh.getWorldScale(this.temporaryScale);
    const halfExtents = new THREE.Vector3(
      Math.abs(this.temporarySize.x * this.temporaryScale.x) * 0.5,
      Math.abs(this.temporarySize.y * this.temporaryScale.y) * 0.5,
      Math.abs(this.temporarySize.z * this.temporaryScale.z) * 0.5
    );
    return { center: worldCenter, quaternion, halfExtents };
  }

  /**
   * Builds a world-axis-aligned box enclosing every mesh.
   * @param meshes The meshes to union.
   * @returns Axis-aligned oriented bounds (identity rotation).
   */
  private buildWorldAxisAlignedUnion(meshes: THREE.Mesh[]): OrientedBoundsData {
    this.temporaryBox.makeEmpty();
    meshes.forEach((mesh) => {
      mesh.updateMatrixWorld(true);
      this.temporaryBox.expandByObject(mesh);
    });
    this.temporaryBox.getCenter(this.temporaryCenter);
    this.temporaryBox.getSize(this.temporarySize);
    return {
      center: this.temporaryCenter.clone(),
      quaternion: new THREE.Quaternion(),
      halfExtents: this.temporarySize.clone().multiplyScalar(0.5)
    };
  }

  /**
   * Computes the local-space AABB of a mesh geometry only (ignores children).
   * @param mesh The mesh whose geometry is measured.
   * @returns A local bounding box.
   */
  private computeGeometryLocalBox(mesh: THREE.Mesh): THREE.Box3 {
    const geometry = mesh.geometry;
    if (!geometry) {
      return this.createUnitLocalBox();
    }
    if (!geometry.boundingBox) {
      geometry.computeBoundingBox();
    }
    if (geometry.boundingBox) {
      return geometry.boundingBox.clone();
    }
    return this.createUnitLocalBox();
  }

  /**
   * Creates a default 1x1x1 local box centered at the origin.
   * @returns Fallback local AABB.
   */
  private createUnitLocalBox(): THREE.Box3 {
    return new THREE.Box3(
      new THREE.Vector3(-0.5, -0.5, -0.5),
      new THREE.Vector3(0.5, 0.5, 0.5)
    );
  }
}

/**
 * Returns the local-space outward normal for a bounds face.
 * @param face The bounds face.
 * @returns A new unit vector in local bounds space.
 */
export function getBoundsFaceLocalNormal(face: BoundsFace): THREE.Vector3 {
  if (face === BoundsFace.POS_X) return new THREE.Vector3(1, 0, 0);
  if (face === BoundsFace.NEG_X) return new THREE.Vector3(-1, 0, 0);
  if (face === BoundsFace.POS_Y) return new THREE.Vector3(0, 1, 0);
  if (face === BoundsFace.NEG_Y) return new THREE.Vector3(0, -1, 0);
  if (face === BoundsFace.POS_Z) return new THREE.Vector3(0, 0, 1);
  return new THREE.Vector3(0, 0, -1);
}

/**
 * Returns the half-extent along the axis of a bounds face.
 * @param halfExtents The full half-extent vector.
 * @param face The face to query.
 * @returns Half size along that face's axis.
 */
export function getBoundsFaceHalfExtent(
  halfExtents: THREE.Vector3,
  face: BoundsFace
): number {
  if (face === BoundsFace.POS_X || face === BoundsFace.NEG_X) {
    return halfExtents.x;
  }
  if (face === BoundsFace.POS_Y || face === BoundsFace.NEG_Y) {
    return halfExtents.y;
  }
  return halfExtents.z;
}

/**
 * Returns every bounds face enum value.
 * @returns An array of all six faces.
 */
export function getAllBoundsFaces(): BoundsFace[] {
  return [
    BoundsFace.POS_X,
    BoundsFace.NEG_X,
    BoundsFace.POS_Y,
    BoundsFace.NEG_Y,
    BoundsFace.POS_Z,
    BoundsFace.NEG_Z
  ];
}
