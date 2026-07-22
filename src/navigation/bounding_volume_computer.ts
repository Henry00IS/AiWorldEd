import * as THREE from 'three';

/**
 * Computes bounding volumes from arrays of scene meshes.
 * Used for camera framing and spatial queries.
 */
export class BoundingVolumeComputer {
  /**
   * Computes a tight axis-aligned bounding box from a set of meshes.
   * Accounts for each mesh's world-space transformation.
   * @param meshes The array of meshes to measure.
   * @returns A Box3 enclosing all meshes in world space.
   */
  computeWorldBoundingBox(meshes: THREE.Mesh[]): THREE.Box3 {
    const boundingBox = new THREE.Box3();
    if (meshes.length === 0) {
      return boundingBox;
    }
    meshes.forEach((mesh) => {
      const individualBox = new THREE.Box3();
      individualBox.setFromObject(mesh);
      boundingBox.union(individualBox);
    });
    return boundingBox;
  }

  /**
   * Computes the smallest sphere that fully encloses the given bounding box.
   * @param boundingBox The axis-aligned bounding box.
   * @returns A Sphere centered on the box center with sufficient radius.
   */
  computeBoundingSphere(boundingBox: THREE.Box3): THREE.Sphere {
    const center = new THREE.Vector3();
    boundingBox.getCenter(center);
    const radius = this.getSphereRadiusFromBox(boundingBox);
    return new THREE.Sphere(center, radius);
  }

  /**
   * Extracts the center point from a bounding box.
   * @param boundingBox The axis-aligned bounding box.
   * @returns The center vector of the bounding box.
   */
  getBoundingBoxCenter(boundingBox: THREE.Box3): THREE.Vector3 {
    const center = new THREE.Vector3();
    boundingBox.getCenter(center);
    return center;
  }

  /**
   * Computes the radius required for a sphere to fully enclose a bounding box.
   * @param boundingBox The axis-aligned bounding box.
   * @returns The minimum enclosing sphere radius.
   */
  private getSphereRadiusFromBox(boundingBox: THREE.Box3): number {
    const center = new THREE.Vector3();
    boundingBox.getCenter(center);
    const corner = boundingBox.max.clone();
    return center.distanceTo(corner);
  }
}
