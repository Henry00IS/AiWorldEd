import * as THREE from 'three';

/** Nearest hit of a ray or shape cast against level geometry. */
export interface PhysicsLevelQueryHit {
  /** Travel distance along the unit direction until the hit. */
  distance: number;
  /** World-space contact point on the level surface. */
  point: THREE.Vector3;
  /** World-space unit surface normal facing back against the cast. */
  normal: THREE.Vector3;
  /** Key of the level collider that was hit. */
  colliderKey: string;
}
