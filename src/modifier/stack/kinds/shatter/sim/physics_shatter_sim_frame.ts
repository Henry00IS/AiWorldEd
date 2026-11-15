import * as THREE from 'three';
import type { PhysicsShatterPieceTransform } from '@/modifier/stack/kinds/shatter/physics_shatter_transform.js';

/**
 * Converts between the modifier frame, where pieces and baked transforms live,
 * and the world, where the simulation runs with gravity along world -Y. The
 * frame is rigid: a rotation and a translation, never scaled.
 */
export class PhysicsShatterSimFrame {
  private readonly frameToWorld: THREE.Matrix4;
  private readonly worldToFrame: THREE.Matrix4;
  private readonly frameRotation: THREE.Quaternion;
  private readonly frameRotationInverse: THREE.Quaternion;

  /**
   * Creates the converter.
   *
   * @param frameToWorld Modifier frame to world matrix.
   */
  constructor(frameToWorld: THREE.Matrix4) {
    this.frameToWorld = frameToWorld.clone();
    this.worldToFrame = frameToWorld.clone().invert();
    this.frameRotation = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().extractRotation(frameToWorld),
    );
    this.frameRotationInverse = this.frameRotation.clone().invert();
  }

  /**
   * Maps a frame point to the world.
   *
   * @param point Frame point.
   * @returns World point.
   */
  pointToWorld(point: THREE.Vector3): THREE.Vector3 {
    return point.clone().applyMatrix4(this.frameToWorld);
  }

  /**
   * Maps a frame direction to the world.
   *
   * @param direction Frame direction.
   * @returns World direction.
   */
  directionToWorld(direction: THREE.Vector3): THREE.Vector3 {
    return direction.clone().applyQuaternion(this.frameRotation);
  }

  /**
   * Maps flat frame points to the world.
   *
   * @param points Flat x, y, z frame points.
   * @returns Flat world points.
   */
  pointsToWorld(points: Float32Array): Float32Array {
    const output = new Float32Array(points.length);
    const scratch = new THREE.Vector3();
    for (let offset = 0; offset + 2 < points.length; offset += 3) {
      scratch.fromArray(points, offset).applyMatrix4(this.frameToWorld);
      scratch.toArray(output, offset);
    }
    return output;
  }

  /**
   * Turns a body's world pose into a baked transform. The body started at the
   * piece's world centroid with no rotation.
   *
   * @param bodyPosition Body position in the world.
   * @param bodyRotation Body rotation in the world.
   * @param centroid Piece centroid c in the frame.
   * @returns Transform x' = R·(x − c) + c + t in the frame.
   */
  transformFromWorldPose(
    bodyPosition: THREE.Vector3,
    bodyRotation: THREE.Quaternion,
    centroid: THREE.Vector3,
  ): PhysicsShatterPieceTransform {
    const rotation = this.frameRotationInverse.clone().multiply(bodyRotation).multiply(this.frameRotation).normalize();
    const translation = bodyPosition.clone().applyMatrix4(this.worldToFrame).sub(centroid);
    return { rotation, translation };
  }
}
