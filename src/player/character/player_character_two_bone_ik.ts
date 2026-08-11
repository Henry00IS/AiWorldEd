import * as THREE from 'three';

/**
 * Places a three-joint chain (proximal → mid → tip) so the tip reaches a world
 * point. Folds only in a single hinge plane (law of cosines + bend-plane
 * normal), so calves/forearms do not swing sideways like a ball joint.
 *
 * Callers should reset bones to rest (or animation) before solving so lengths
 * and starting twist come from the authored pose.
 *
 * @param proximalBone First joint (thigh / upper arm).
 * @param midBone Second joint (shin / forearm).
 * @param tipBone Third joint (foot / hand).
 * @param tipTargetWorld Desired world position of the tip.
 * @param foldHintWorld World point the mid joint should fold toward (pole).
 * @param scratch Reusable scratch storage.
 */
export function playerCharacterSolveTwoBoneIk(
  proximalBone: THREE.Object3D,
  midBone: THREE.Object3D,
  tipBone: THREE.Object3D,
  tipTargetWorld: THREE.Vector3,
  foldHintWorld: THREE.Vector3,
  scratch: PlayerCharacterIkScratch,
): void {
  writeChainWorldPositions(proximalBone, midBone, tipBone, scratch);
  const proximalLengthSq = scratch.midWorld.distanceToSquared(scratch.proximalWorld);
  const distalLengthSq = scratch.tipWorld.distanceToSquared(scratch.midWorld);
  if (proximalLengthSq < 1e-10 || distalLengthSq < 1e-10) {
    return;
  }
  scratch.reachVector.copy(tipTargetWorld).sub(scratch.proximalWorld);
  let reachLength = scratch.reachVector.length();
  if (reachLength < 1e-6) {
    return;
  }
  const fullReach = Math.sqrt(proximalLengthSq) + Math.sqrt(distalLengthSq);
  const maxReach = fullReach - 0.002;
  const minReach = Math.abs(Math.sqrt(proximalLengthSq) - Math.sqrt(distalLengthSq)) + 0.002;
  reachLength = THREE.MathUtils.clamp(reachLength, minReach, maxReach);
  scratch.reachVector.normalize().multiplyScalar(reachLength);
  scratch.toDirection.copy(scratch.proximalWorld).add(scratch.reachVector);
  writeBendPlaneNormal(foldHintWorld, scratch.toDirection, scratch);
  writeBendDirection(reachLength, proximalLengthSq, distalLengthSq, scratch);
  if (scratch.foldOffset.lengthSq() < 1e-10) {
    return;
  }
  captureRestTwistLocals(proximalBone, midBone, scratch);
  applyHingeBoneRotation(proximalBone, scratch.foldOffset, scratch.planeSide, scratch.proximalTwistLocal, scratch);
  midBone.updateWorldMatrix(true, false);
  midBone.getWorldPosition(scratch.midWorld);
  scratch.fromDirection.copy(scratch.toDirection).sub(scratch.midWorld);
  applyHingeBoneRotation(midBone, scratch.fromDirection, scratch.planeSide, scratch.midTwistLocal, scratch);
}

/** Scratch bag for the pair-chain reach solver. */
export interface PlayerCharacterIkScratch {
  proximalWorld: THREE.Vector3;
  midWorld: THREE.Vector3;
  tipWorld: THREE.Vector3;
  reachVector: THREE.Vector3;
  foldOffset: THREE.Vector3;
  foldHint: THREE.Vector3;
  planeSide: THREE.Vector3;
  basisRight: THREE.Vector3;
  basisUp: THREE.Vector3;
  basisForward: THREE.Vector3;
  fromDirection: THREE.Vector3;
  toDirection: THREE.Vector3;
  worldDelta: THREE.Quaternion;
  worldRotation: THREE.Quaternion;
  parentInverse: THREE.Quaternion;
  proximalTwistLocal: THREE.Quaternion;
  midTwistLocal: THREE.Quaternion;
  lookRotation: THREE.Quaternion;
  basisMatrix: THREE.Matrix4;
}

/**
 * Allocates a fresh scratch bag for the pair-chain solver.
 *
 * @returns Scratch vectors and quaternions.
 */
export function createPlayerCharacterIkScratch(): PlayerCharacterIkScratch {
  return {
    proximalWorld: new THREE.Vector3(),
    midWorld: new THREE.Vector3(),
    tipWorld: new THREE.Vector3(),
    reachVector: new THREE.Vector3(),
    foldOffset: new THREE.Vector3(),
    foldHint: new THREE.Vector3(),
    planeSide: new THREE.Vector3(),
    basisRight: new THREE.Vector3(),
    basisUp: new THREE.Vector3(),
    basisForward: new THREE.Vector3(),
    fromDirection: new THREE.Vector3(),
    toDirection: new THREE.Vector3(),
    worldDelta: new THREE.Quaternion(),
    worldRotation: new THREE.Quaternion(),
    parentInverse: new THREE.Quaternion(),
    proximalTwistLocal: new THREE.Quaternion(),
    midTwistLocal: new THREE.Quaternion(),
    lookRotation: new THREE.Quaternion(),
    basisMatrix: new THREE.Matrix4(),
  };
}

/**
 * Captures world positions of the three chain joints.
 *
 * @param proximalBone First joint.
 * @param midBone Second joint.
 * @param tipBone Third joint.
 * @param scratch Scratch bag.
 */
function writeChainWorldPositions(
  proximalBone: THREE.Object3D,
  midBone: THREE.Object3D,
  tipBone: THREE.Object3D,
  scratch: PlayerCharacterIkScratch,
): void {
  proximalBone.updateWorldMatrix(true, false);
  midBone.updateWorldMatrix(true, false);
  tipBone.updateWorldMatrix(true, false);
  proximalBone.getWorldPosition(scratch.proximalWorld);
  midBone.getWorldPosition(scratch.midWorld);
  tipBone.getWorldPosition(scratch.tipWorld);
}

/**
 * Builds the hinge-plane normal from the fold pole and the tip target. Mid
 * joint motion is constrained to this plane (human knee/elbow style).
 *
 * @param foldHintWorld Pole the mid joint should lean toward.
 * @param tipTargetWorld Clamped tip target in world space.
 * @param scratch Scratch bag; planeSide receives the unit normal.
 */
function writeBendPlaneNormal(
  foldHintWorld: THREE.Vector3,
  tipTargetWorld: THREE.Vector3,
  scratch: PlayerCharacterIkScratch,
): void {
  scratch.foldHint.copy(foldHintWorld).sub(scratch.proximalWorld);
  scratch.basisForward.copy(tipTargetWorld).sub(scratch.proximalWorld);
  scratch.planeSide.crossVectors(scratch.foldHint, scratch.basisForward);
  if (scratch.planeSide.lengthSq() < 1e-10) {
    scratch.fromDirection.copy(scratch.midWorld).sub(scratch.proximalWorld);
    scratch.planeSide.crossVectors(scratch.fromDirection, scratch.basisForward);
  }
  if (scratch.planeSide.lengthSq() < 1e-10) {
    scratch.planeSide.set(1, 0, 0);
    scratch.basisForward.normalize();
    if (Math.abs(scratch.basisForward.dot(scratch.planeSide)) > 0.95) {
      scratch.planeSide.set(0, 0, 1);
    }
  }
  scratch.planeSide.normalize();
}

/**
 * Stores each bone's rest twist relative to a LookRotation(child, bendNormal)
 * basis.
 *
 * @param proximalBone First joint at rest.
 * @param midBone Second joint at rest.
 * @param scratch Scratch bag.
 */
function captureRestTwistLocals(
  proximalBone: THREE.Object3D,
  midBone: THREE.Object3D,
  scratch: PlayerCharacterIkScratch,
): void {
  scratch.fromDirection.copy(scratch.midWorld).sub(scratch.proximalWorld);
  writeLookRotation(scratch.fromDirection, scratch.planeSide, scratch.lookRotation, scratch);
  proximalBone.getWorldQuaternion(scratch.worldRotation);
  scratch.proximalTwistLocal.copy(scratch.lookRotation).invert().multiply(scratch.worldRotation);

  scratch.fromDirection.copy(scratch.tipWorld).sub(scratch.midWorld);
  writeLookRotation(scratch.fromDirection, scratch.planeSide, scratch.lookRotation, scratch);
  midBone.getWorldQuaternion(scratch.worldRotation);
  scratch.midTwistLocal.copy(scratch.lookRotation).invert().multiply(scratch.worldRotation);
}

/**
 * Writes the law-of-cosines mid direction into scratch.foldOffset (from
 * proximal).
 *
 * @param reachLength Clamped reach magnitude.
 * @param proximalLengthSq Squared proximal bone length.
 * @param distalLengthSq Squared distal bone length.
 * @param scratch Scratch bag.
 */
function writeBendDirection(
  reachLength: number,
  proximalLengthSq: number,
  distalLengthSq: number,
  scratch: PlayerCharacterIkScratch,
): void {
  const along = (reachLength * reachLength + proximalLengthSq - distalLengthSq) / (2 * reachLength);
  const height = Math.sqrt(Math.max(0, proximalLengthSq - along * along));
  scratch.basisForward.copy(scratch.reachVector).normalize();
  scratch.basisUp.crossVectors(scratch.basisForward, scratch.planeSide);
  if (scratch.basisUp.lengthSq() < 1e-10) {
    scratch.foldOffset.set(0, 0, 0);
    return;
  }
  scratch.basisUp.normalize();
  if (scratch.basisUp.dot(scratch.foldHint) < 0) {
    scratch.basisUp.multiplyScalar(-1);
    scratch.planeSide.multiplyScalar(-1);
  }
  writeLookRotation(scratch.basisForward, scratch.basisUp, scratch.lookRotation, scratch);
  scratch.foldOffset.set(0, height, along);
  scratch.foldOffset.applyQuaternion(scratch.lookRotation);
}

/**
 * Rotates a bone so its child axis follows a direction while locked to a hinge
 * plane.
 *
 * @param bone Bone to rotate.
 * @param childDirection Desired world direction toward the child joint.
 * @param bendNormal World hinge-plane normal.
 * @param restTwistLocal Rest twist relative to LookRotation(child, bendNormal).
 * @param scratch Scratch bag.
 */
function applyHingeBoneRotation(
  bone: THREE.Object3D,
  childDirection: THREE.Vector3,
  bendNormal: THREE.Vector3,
  restTwistLocal: THREE.Quaternion,
  scratch: PlayerCharacterIkScratch,
): void {
  if (childDirection.lengthSq() < 1e-10) {
    return;
  }
  writeLookRotation(childDirection, bendNormal, scratch.lookRotation, scratch);
  scratch.worldRotation.copy(scratch.lookRotation).multiply(restTwistLocal);
  writeWorldRotationAsLocal(bone, scratch.worldRotation, scratch);
  bone.updateMatrixWorld(true);
}

/**
 * Builds a Unity-style LookRotation(forward, up) quaternion into the target.
 *
 * @param forward World forward axis for the bone look.
 * @param up World up hint (hinge normal or fold side).
 * @param target Destination quaternion.
 * @param scratch Scratch bag for basis vectors.
 */
function writeLookRotation(
  forward: THREE.Vector3,
  up: THREE.Vector3,
  target: THREE.Quaternion,
  scratch: PlayerCharacterIkScratch,
): void {
  scratch.basisForward.copy(forward);
  if (scratch.basisForward.lengthSq() < 1e-10) {
    target.identity();
    return;
  }
  scratch.basisForward.normalize();
  scratch.basisRight.crossVectors(up, scratch.basisForward);
  if (scratch.basisRight.lengthSq() < 1e-10) {
    scratch.basisRight.set(1, 0, 0);
    if (Math.abs(scratch.basisForward.dot(scratch.basisRight)) > 0.95) {
      scratch.basisRight.set(0, 0, 1);
    }
    scratch.basisRight.crossVectors(scratch.basisRight, scratch.basisForward);
  }
  scratch.basisRight.normalize();
  scratch.basisUp.crossVectors(scratch.basisForward, scratch.basisRight).normalize();
  scratch.basisMatrix.makeBasis(scratch.basisRight, scratch.basisUp, scratch.basisForward);
  target.setFromRotationMatrix(scratch.basisMatrix);
}

/**
 * Converts a desired world rotation into the bone's local quaternion.
 *
 * @param bone Target bone.
 * @param worldRotation Desired world orientation.
 * @param scratch Scratch bag.
 */
function writeWorldRotationAsLocal(
  bone: THREE.Object3D,
  worldRotation: THREE.Quaternion,
  scratch: PlayerCharacterIkScratch,
): void {
  if (!bone.parent) {
    bone.quaternion.copy(worldRotation);
    return;
  }
  bone.parent.getWorldQuaternion(scratch.parentInverse);
  scratch.parentInverse.invert();
  bone.quaternion.copy(scratch.parentInverse).multiply(worldRotation);
}
