import * as THREE from 'three';
import { PLAYER_COLLIDER_RADIUS_METERS, PLAYER_WALL_SKIN_METERS } from '@/player/player_constants.js';
import { PLAYER_LOCOMOTION_GAIT } from './player_locomotion_gait_config.js';

/**
 * Wall-aligned foot frame: contact center at perfect capsule distance, left
 * axis along the wall, feet dropped from pelvis height to ground.
 */
export class PlayerLocomotionWallFootFrame {
  private readonly wallNormalWorld: THREE.Vector3;
  private readonly intoWallWorld: THREE.Vector3;
  private readonly wallLeftWorld: THREE.Vector3;
  private readonly contactCenterWorld: THREE.Vector3;
  private readonly scratch: THREE.Vector3;
  private readonly rootWorldPosition: THREE.Vector3;
  private isValid: boolean;

  /** Creates an empty wall foot frame. */
  constructor() {
    this.wallNormalWorld = new THREE.Vector3();
    this.intoWallWorld = new THREE.Vector3();
    this.wallLeftWorld = new THREE.Vector3();
    this.contactCenterWorld = new THREE.Vector3();
    this.scratch = new THREE.Vector3();
    this.rootWorldPosition = new THREE.Vector3();
    this.isValid = false;
  }

  /**
   * Returns whether the last rebuild produced a usable wall frame.
   *
   * @returns True when contact axes are valid.
   */
  getIsValid(): boolean {
    return this.isValid;
  }

  /**
   * Returns the unit wall-left axis in world space.
   *
   * @returns World left along the wall.
   */
  getWallLeftWorld(): THREE.Vector3 {
    return this.wallLeftWorld;
  }

  /**
   * Returns the contact center under the pelvis at capsule distance from the
   * wall.
   *
   * @returns World contact center.
   */
  getContactCenterWorld(): THREE.Vector3 {
    return this.contactCenterWorld;
  }

  /**
   * Rebuilds wall axes and contact center from root pose and wall normal.
   *
   * Closest wall point is approximated by projecting the root along the outward
   * normal by capsule contact depth, then stepping back to the free-space
   * contact center. Feet sit on the wall-left axis about that center.
   *
   * @param characterRoot Character root.
   * @param wallNormalWorld World outward wall normal.
   * @returns True when the frame is valid.
   */
  rebuild(characterRoot: THREE.Object3D | null, wallNormalWorld: THREE.Vector3 | null): boolean {
    this.isValid = false;
    if (!characterRoot || !wallNormalWorld || wallNormalWorld.lengthSq() < 1e-8) {
      return false;
    }
    this.captureRoot(characterRoot);
    if (!this.writePlanarWallNormal(wallNormalWorld)) {
      return false;
    }
    this.writeGeometricWallLeftAxis();
    this.writeContactCenter();
    this.isValid = true;
    return true;
  }

  /**
   * Writes one foot plant under the contact center along wall-left.
   *
   * @param isLeft Left foot when true.
   * @param target Destination world plant.
   */
  writeStancePlantWorld(isLeft: boolean, target: THREE.Vector3): void {
    const side = isLeft ? 1 : -1;
    const width = PLAYER_LOCOMOTION_GAIT.stanceWidthMeters;
    target.copy(this.contactCenterWorld).addScaledVector(this.wallLeftWorld, side * width);
    this.dropPlantToGround(target);
  }

  /**
   * Captures root world position.
   *
   * @param characterRoot Character root.
   */
  private captureRoot(characterRoot: THREE.Object3D): void {
    characterRoot.updateMatrixWorld(true);
    characterRoot.getWorldPosition(this.rootWorldPosition);
  }

  /**
   * Writes a planar unit outward wall normal.
   *
   * @param wallNormalWorld Source normal.
   * @returns True when usable.
   */
  private writePlanarWallNormal(wallNormalWorld: THREE.Vector3): boolean {
    this.wallNormalWorld.copy(wallNormalWorld);
    this.wallNormalWorld.y = 0;
    if (this.wallNormalWorld.lengthSq() < 1e-8) {
      return false;
    }
    this.wallNormalWorld.normalize();
    this.intoWallWorld.copy(this.wallNormalWorld).multiplyScalar(-1);
    return true;
  }

  /**
   * Builds a stable geometric wall-left axis (up cross into-wall).
   *
   * Independent of character facing so side-step travel and plants stay on the
   * wall when the body faces along the tangent.
   */
  private writeGeometricWallLeftAxis(): void {
    this.wallLeftWorld.set(0, 1, 0).cross(this.intoWallWorld);
    if (this.wallLeftWorld.lengthSq() < 1e-8) {
      this.wallLeftWorld.set(-this.wallNormalWorld.z, 0, this.wallNormalWorld.x);
    }
    this.wallLeftWorld.y = 0;
    if (this.wallLeftWorld.lengthSq() < 1e-8) {
      this.wallLeftWorld.set(1, 0, 0);
      return;
    }
    this.wallLeftWorld.normalize();
  }

  /**
   * Places the contact center under the root at capsule distance from the wall.
   *
   * Closest wall surface point is root advanced into the wall by contact depth.
   * Contact center is that surface point moved back along the outward normal so
   * the stance sits under the body at a guaranteed free-space depth.
   */
  private writeContactCenter(): void {
    const contactDepth = PLAYER_COLLIDER_RADIUS_METERS + PLAYER_WALL_SKIN_METERS;
    this.scratch.copy(this.rootWorldPosition).addScaledVector(this.intoWallWorld, contactDepth);
    this.contactCenterWorld.copy(this.scratch).addScaledVector(this.wallNormalWorld, contactDepth);
    this.contactCenterWorld.y = this.rootWorldPosition.y;
    this.centerContactOnRootAlongWall();
  }

  /** Removes residual along-wall drift so stance is centered on the root. */
  private centerContactOnRootAlongWall(): void {
    this.scratch.subVectors(this.contactCenterWorld, this.rootWorldPosition);
    const along = this.scratch.dot(this.wallLeftWorld);
    this.contactCenterWorld.addScaledVector(this.wallLeftWorld, -along);
  }

  /**
   * Drops a plant from pelvis height to ground under the root.
   *
   * @param plant World plant mutated in place.
   */
  private dropPlantToGround(plant: THREE.Vector3): void {
    plant.y = this.rootWorldPosition.y + PLAYER_LOCOMOTION_GAIT.footGroundYMeters;
  }
}
