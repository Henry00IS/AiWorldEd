import * as THREE from 'three';
import { PLAYER_CHARACTER_BONE, type PlayerCharacterBoneId } from './player_character_bone_ids.js';
import { PLAYER_CHARACTER_CONTROL } from './player_character_control_ids.js';
import type { PlayerCharacterControlRig } from './player_character_control_rig.js';
import {
  createPlayerCharacterIkScratch,
  playerCharacterSolveTwoBoneIk,
  type PlayerCharacterIkScratch,
} from './player_character_two_bone_ik.js';

/** Optional end-effector orientation after the limb is solved. */
export type PlayerCharacterEndOrientMode = 'none' | 'palm_wall' | 'palm_inward';

/** Options for one control IK solve pass. */
export interface PlayerCharacterControlIkOptions {
  /** When true, solve both legs from foot and knee-pole controls. */
  solveLegs: boolean;
  /** When true, solve both arms from hand and elbow-pole controls. */
  solveArms: boolean;
  /** Hand orientation mode after arm IK. */
  handOrient: PlayerCharacterEndOrientMode;
  /** Character-local outward wall normal (required for palm_wall). */
  wallNormalLocalOut?: THREE.Vector3;
  /** Inward hand yaw in radians for palm_inward (thumbs toward pelvis). */
  handInwardYawRadians?: number;
}

/**
 * Applies two-bone IK from a control rig. Callers animate control points; this
 * only rotates bones (from rest) toward those points.
 */
export class PlayerCharacterControlIk {
  private readonly ikScratch: PlayerCharacterIkScratch;
  private readonly rootWorldPosition: THREE.Vector3;
  private readonly rootWorldQuaternion: THREE.Quaternion;
  private readonly targetWorld: THREE.Vector3;
  private readonly poleWorld: THREE.Vector3;
  private readonly parentWorldInverse: THREE.Quaternion;
  private readonly boneWorldRot: THREE.Quaternion;
  private readonly boneCharRot: THREE.Quaternion;
  private readonly basisMatrix: THREE.Matrix4;
  private readonly axisX: THREE.Vector3;
  private readonly axisY: THREE.Vector3;
  private readonly axisZ: THREE.Vector3;

  /** Creates a control-point IK solver. */
  constructor() {
    this.ikScratch = createPlayerCharacterIkScratch();
    this.rootWorldPosition = new THREE.Vector3();
    this.rootWorldQuaternion = new THREE.Quaternion();
    this.targetWorld = new THREE.Vector3();
    this.poleWorld = new THREE.Vector3();
    this.parentWorldInverse = new THREE.Quaternion();
    this.boneWorldRot = new THREE.Quaternion();
    this.boneCharRot = new THREE.Quaternion();
    this.basisMatrix = new THREE.Matrix4();
    this.axisX = new THREE.Vector3();
    this.axisY = new THREE.Vector3();
    this.axisZ = new THREE.Vector3();
  }

  /**
   * Solves limbs from control points.
   *
   * @param bones Character bone map.
   * @param restLocalQuaternions Rest locals used to reset solved limbs first.
   * @param root Character root (control points are character-local).
   * @param controls Control rig with animated effectors.
   * @param options Which limbs and orientations to apply.
   */
  apply(
    bones: Map<PlayerCharacterBoneId, THREE.Bone>,
    restLocalQuaternions: Map<PlayerCharacterBoneId, THREE.Quaternion>,
    root: THREE.Object3D,
    controls: PlayerCharacterControlRig,
    options: PlayerCharacterControlIkOptions,
  ): void {
    this.captureRoot(root);
    if (options.solveLegs) {
      this.resetLegRests(bones, restLocalQuaternions);
      root.updateMatrixWorld(true);
      this.solveLeg(bones, controls, true);
      this.solveLeg(bones, controls, false);
    }
    if (options.solveArms) {
      this.resetArmRests(bones, restLocalQuaternions);
      root.updateMatrixWorld(true);
      this.solveArm(bones, controls, true, options);
      this.solveArm(bones, controls, false, options);
    }
  }

  /**
   * Captures the character root world pose for local/world conversion.
   *
   * @param root Character root.
   */
  private captureRoot(root: THREE.Object3D): void {
    root.getWorldPosition(this.rootWorldPosition);
    root.getWorldQuaternion(this.rootWorldQuaternion);
  }

  /**
   * Resets both legs to rest before IK.
   *
   * @param bones Bone map.
   * @param rest Rest locals.
   */
  private resetLegRests(
    bones: Map<PlayerCharacterBoneId, THREE.Bone>,
    rest: Map<PlayerCharacterBoneId, THREE.Quaternion>,
  ): void {
    this.resetBone(bones, rest, PLAYER_CHARACTER_BONE.upperLegLeft);
    this.resetBone(bones, rest, PLAYER_CHARACTER_BONE.lowerLegLeft);
    this.resetBone(bones, rest, PLAYER_CHARACTER_BONE.footLeft);
    this.resetBone(bones, rest, PLAYER_CHARACTER_BONE.upperLegRight);
    this.resetBone(bones, rest, PLAYER_CHARACTER_BONE.lowerLegRight);
    this.resetBone(bones, rest, PLAYER_CHARACTER_BONE.footRight);
  }

  /**
   * Resets both arms to rest before IK.
   *
   * @param bones Bone map.
   * @param rest Rest locals.
   */
  private resetArmRests(
    bones: Map<PlayerCharacterBoneId, THREE.Bone>,
    rest: Map<PlayerCharacterBoneId, THREE.Quaternion>,
  ): void {
    this.resetBone(bones, rest, PLAYER_CHARACTER_BONE.upperArmLeft);
    this.resetBone(bones, rest, PLAYER_CHARACTER_BONE.lowerArmLeft);
    this.resetBone(bones, rest, PLAYER_CHARACTER_BONE.handLeft);
    this.resetBone(bones, rest, PLAYER_CHARACTER_BONE.upperArmRight);
    this.resetBone(bones, rest, PLAYER_CHARACTER_BONE.lowerArmRight);
    this.resetBone(bones, rest, PLAYER_CHARACTER_BONE.handRight);
  }

  /**
   * Copies rest local rotation onto one bone when available.
   *
   * @param bones Bone map.
   * @param rest Rest locals.
   * @param boneId Bone id.
   */
  private resetBone(
    bones: Map<PlayerCharacterBoneId, THREE.Bone>,
    rest: Map<PlayerCharacterBoneId, THREE.Quaternion>,
    boneId: PlayerCharacterBoneId,
  ): void {
    const bone = bones.get(boneId);
    const restQuat = rest.get(boneId);
    if (!bone || !restQuat) {
      return;
    }
    bone.quaternion.copy(restQuat);
  }

  /**
   * Solves one leg toward foot and knee-pole controls. Foot keeps rest twist.
   *
   * @param bones Bone map.
   * @param controls Control rig.
   * @param isLeft True for left leg.
   */
  private solveLeg(
    bones: Map<PlayerCharacterBoneId, THREE.Bone>,
    controls: PlayerCharacterControlRig,
    isLeft: boolean,
  ): void {
    const upper = bones.get(isLeft ? PLAYER_CHARACTER_BONE.upperLegLeft : PLAYER_CHARACTER_BONE.upperLegRight);
    const lower = bones.get(isLeft ? PLAYER_CHARACTER_BONE.lowerLegLeft : PLAYER_CHARACTER_BONE.lowerLegRight);
    const foot = bones.get(isLeft ? PLAYER_CHARACTER_BONE.footLeft : PLAYER_CHARACTER_BONE.footRight);
    if (!upper || !lower || !foot) {
      return;
    }
    const footId = isLeft ? PLAYER_CHARACTER_CONTROL.footLeft : PLAYER_CHARACTER_CONTROL.footRight;
    const poleId = isLeft ? PLAYER_CHARACTER_CONTROL.kneePoleLeft : PLAYER_CHARACTER_CONTROL.kneePoleRight;
    this.localToWorld(controls.get(footId), this.targetWorld);
    this.localToWorld(controls.get(poleId), this.poleWorld);
    playerCharacterSolveTwoBoneIk(upper, lower, foot, this.targetWorld, this.poleWorld, this.ikScratch);
  }

  /**
   * Solves one arm toward hand and elbow-pole controls.
   *
   * @param bones Bone map.
   * @param controls Control rig.
   * @param isLeft True for left arm.
   * @param options Solve options (hand orient + wall normal).
   */
  private solveArm(
    bones: Map<PlayerCharacterBoneId, THREE.Bone>,
    controls: PlayerCharacterControlRig,
    isLeft: boolean,
    options: PlayerCharacterControlIkOptions,
  ): void {
    const upper = bones.get(isLeft ? PLAYER_CHARACTER_BONE.upperArmLeft : PLAYER_CHARACTER_BONE.upperArmRight);
    const lower = bones.get(isLeft ? PLAYER_CHARACTER_BONE.lowerArmLeft : PLAYER_CHARACTER_BONE.lowerArmRight);
    const hand = bones.get(isLeft ? PLAYER_CHARACTER_BONE.handLeft : PLAYER_CHARACTER_BONE.handRight);
    if (!upper || !lower || !hand) {
      return;
    }
    const handId = isLeft ? PLAYER_CHARACTER_CONTROL.handLeft : PLAYER_CHARACTER_CONTROL.handRight;
    const poleId = isLeft ? PLAYER_CHARACTER_CONTROL.elbowPoleLeft : PLAYER_CHARACTER_CONTROL.elbowPoleRight;
    this.localToWorld(controls.get(handId), this.targetWorld);
    this.localToWorld(controls.get(poleId), this.poleWorld);
    playerCharacterSolveTwoBoneIk(upper, lower, hand, this.targetWorld, this.poleWorld, this.ikScratch);
    if (options.handOrient === 'palm_wall' && options.wallNormalLocalOut) {
      lower.updateMatrixWorld(true);
      this.orientPalmOnWall(hand, isLeft, options.wallNormalLocalOut);
      return;
    }
    if (options.handOrient === 'palm_inward') {
      this.orientPalmInward(hand, isLeft, options.handInwardYawRadians ?? 0.3490658503988659);
    }
  }

  /**
   * Yaws a hanging hand so the thumb tips slightly toward the pelvis.
   *
   * @param hand Hand bone after arm IK.
   * @param isLeft True for left hand.
   * @param yawRadians Inward yaw magnitude.
   */
  private orientPalmInward(hand: THREE.Bone, isLeft: boolean, yawRadians: number): void {
    const signedYaw = isLeft ? yawRadians : -yawRadians;
    hand.rotateY(signedYaw);
  }

  /**
   * Orients a palm flat against the wall with fingers up.
   *
   * Simple extruded bones: +Y along the bone (fingers), +X out of the palm, +Z
   * along the thumb. The right hand mesh is mirrored relative to the shared
   * bone axes, so its basis is spun 180° about the finger axis.
   *
   * @param hand Hand bone.
   * @param isLeft True for left hand.
   * @param wallNormalLocalOut Character-local outward wall normal.
   */
  private orientPalmOnWall(hand: THREE.Bone, isLeft: boolean, wallNormalLocalOut: THREE.Vector3): void {
    this.writePalmWallBasis(isLeft, wallNormalLocalOut);
    this.basisMatrix.makeBasis(this.axisX, this.axisY, this.axisZ);
    this.boneCharRot.setFromRotationMatrix(this.basisMatrix);
    this.boneWorldRot.copy(this.rootWorldQuaternion).multiply(this.boneCharRot);
    this.writeWorldRotationAsLocal(hand, this.boneWorldRot);
  }

  /**
   * Builds a wall-palm basis with fingers up and palm into the wall.
   *
   * @param isLeft True for left hand.
   * @param wallNormalLocalOut Character-local outward wall normal.
   */
  private writePalmWallBasis(isLeft: boolean, wallNormalLocalOut: THREE.Vector3): void {
    this.axisY.set(0, 1, 0);
    this.axisX.copy(wallNormalLocalOut).multiplyScalar(-1);
    this.normalizeAxisOrFallback(this.axisX, 0, 0, 1);
    this.axisZ.crossVectors(this.axisX, this.axisY);
    this.normalizeAxisOrFallback(this.axisZ, 1, 0, 0);
    if (!isLeft) {
      this.axisX.multiplyScalar(-1);
      this.axisZ.multiplyScalar(-1);
    }
    this.axisY.crossVectors(this.axisZ, this.axisX).normalize();
  }

  /**
   * Normalizes an axis or replaces it with a fallback unit vector.
   *
   * @param axis Axis mutated in place.
   * @param fallbackX Fallback X.
   * @param fallbackY Fallback Y.
   * @param fallbackZ Fallback Z.
   */
  private normalizeAxisOrFallback(axis: THREE.Vector3, fallbackX: number, fallbackY: number, fallbackZ: number): void {
    if (axis.lengthSq() < 1e-10) {
      axis.set(fallbackX, fallbackY, fallbackZ);
      return;
    }
    axis.normalize();
  }

  /**
   * Converts a character-local point to world space.
   *
   * @param localPoint Character-local point.
   * @param worldPoint Destination world point.
   */
  private localToWorld(localPoint: THREE.Vector3, worldPoint: THREE.Vector3): void {
    worldPoint.copy(localPoint).applyQuaternion(this.rootWorldQuaternion);
    worldPoint.add(this.rootWorldPosition);
  }

  /**
   * Writes a world rotation into a bone local quaternion.
   *
   * @param bone Target bone.
   * @param worldRotation Desired world rotation.
   */
  private writeWorldRotationAsLocal(bone: THREE.Object3D, worldRotation: THREE.Quaternion): void {
    if (!bone.parent) {
      bone.quaternion.copy(worldRotation);
      return;
    }
    bone.parent.getWorldQuaternion(this.parentWorldInverse);
    this.parentWorldInverse.invert();
    bone.quaternion.copy(this.parentWorldInverse).multiply(worldRotation);
  }
}
