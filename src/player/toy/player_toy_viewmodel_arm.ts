import * as THREE from 'three';
import type { PhysicsToyKind } from '@/physics/ball/physics_ball_constants.js';

/** Shoulder position in view space (+X right, +Y up, -Z ahead of the eye). */
export const PLAYER_TOY_ARM_SHOULDER = new THREE.Vector3(0.24, -0.2, 0.06);
/** Upper arm length from shoulder to elbow. */
export const PLAYER_TOY_ARM_UPPER = 0.27;
/** Forearm length from elbow to wrist. */
export const PLAYER_TOY_ARM_FOREARM = 0.25;
/** Wrist cylinder length; the hand starts at its end. */
export const PLAYER_TOY_ARM_WRIST = 0.028;
/** Radius where the sleeve meets the wrist cylinder (both share it). */
const PLAYER_TOY_ARM_WRIST_RADIUS = 0.027;
/** Skin color. */
const PLAYER_TOY_ARM_SKIN = 0xe0ac86;
/** Palm thickness above the hand origin, where a toy rests. */
const PLAYER_TOY_ARM_PALM_TOP = 0.021;
/**
 * Radius where the wrist cylinder starts, inside a slightly larger skin ball at
 * the wrist joint: hidden in the sleeve while straight, the ball fills the
 * sleeve end when the wrist bends, so no gap or cylinder end ever shows.
 */
const PLAYER_TOY_ARM_WRIST_JOINT = 0.0255;
/**
 * Where each toy sits on the hand at its true size: balls rest on the palm, the
 * plane is pinched by its keel with its nose ahead.
 */
const PLAYER_TOY_ARM_ITEM: Readonly<Record<PhysicsToyKind, THREE.Vector3>> = {
  tennis: new THREE.Vector3(0, PLAYER_TOY_ARM_PALM_TOP + 0.052, -0.058),
  soccer: new THREE.Vector3(0.004, PLAYER_TOY_ARM_PALM_TOP + 0.092, -0.062),
  plane: new THREE.Vector3(0.03, PLAYER_TOY_ARM_PALM_TOP + 0.012, -0.085),
};
/** Where the plane's center is from the pinch (its keel is held). */
export const PLAYER_TOY_ARM_PLANE_CENTER = new THREE.Vector3(0, 0.03, -0.03);

/** Joint angles of the arm in radians. */
export interface PlayerToyArmPose {
  /** Shoulder pitch (up positive; 0 points the upper arm ahead). */
  pitch: number;
  /** Shoulder yaw (towards the view center positive). */
  yaw: number;
  /** Elbow bend (lifts the forearm, 0 straight). */
  elbow: number;
  /** Wrist pitch (cocks the hand up positive). */
  wrist: number;
  /** Forearm roll (turns the palm towards the view center positive). */
  roll: number;
}

/** The joints of the arm, each the parent of the next. */
export interface PlayerToyArmRig {
  readonly shoulder: THREE.Group;
  readonly elbow: THREE.Group;
  readonly wrist: THREE.Group;
  readonly hand: THREE.Group;
  /** Holds the toy (a child of the hand). */
  readonly grip: THREE.Group;
}

/**
 * Builds a right arm as one joint chain (shoulder > upper arm > elbow >
 * forearm.
 *
 * > Wrist > hand > toy). Every segment runs along its joint's -Z, and the next
 * > joint sits exactly at its end, so joints can only rotate and never separate.
 * > The sleeve ends in the wrist radius, where the wrist cylinder starts; the
 * > right hand has its palm up (+Y), fingers ahead and the thumb on the right
 * > (+X).
 *
 * @param skin Skin material.
 * @param sleeve Sleeve material.
 * @returns Joints.
 */
export function playerToyArmBuild(skin: THREE.Material, sleeve: THREE.Material): PlayerToyArmRig {
  const rig = playerToyArmJoints();
  rig.shoulder.add(playerToyArmSphere(0.055, sleeve, 0));
  rig.shoulder.add(playerToyArmSegment(0.052, 0.046, PLAYER_TOY_ARM_UPPER, sleeve));
  rig.elbow.add(playerToyArmSphere(0.046, sleeve, 0));
  rig.elbow.add(playerToyArmSegment(0.045, PLAYER_TOY_ARM_WRIST_RADIUS, PLAYER_TOY_ARM_FOREARM, sleeve));
  rig.wrist.add(playerToyArmSphere(PLAYER_TOY_ARM_WRIST_JOINT + 0.0007, skin, 0));
  rig.wrist.add(playerToyArmSegment(PLAYER_TOY_ARM_WRIST_JOINT, 0.024, PLAYER_TOY_ARM_WRIST, skin));
  playerToyArmHand(skin).forEach((part) => rig.hand.add(part));
  return rig;
}

/**
 * Creates the joint chain at its rest offsets.
 *
 * @returns Joints.
 */
function playerToyArmJoints(): PlayerToyArmRig {
  const rig = {
    shoulder: new THREE.Group(),
    elbow: new THREE.Group(),
    wrist: new THREE.Group(),
    hand: new THREE.Group(),
    grip: new THREE.Group(),
  };
  rig.shoulder.position.copy(PLAYER_TOY_ARM_SHOULDER);
  rig.shoulder.rotation.order = 'YXZ';
  rig.elbow.position.set(0, 0, -PLAYER_TOY_ARM_UPPER);
  rig.wrist.position.set(0, 0, -PLAYER_TOY_ARM_FOREARM);
  rig.wrist.rotation.order = 'ZXY';
  rig.hand.position.set(0, 0, -PLAYER_TOY_ARM_WRIST);
  rig.shoulder.add(rig.elbow);
  rig.elbow.add(rig.wrist);
  rig.wrist.add(rig.hand);
  rig.hand.add(rig.grip);
  rig.shoulder.name = 'Shoulder';
  return rig;
}

/**
 * Builds the palm, the four fingers curled up around the toy, the thumb on the
 * right and the knuckle pad.
 *
 * @param skin Skin material.
 * @returns Hand parts in hand space.
 */
function playerToyArmHand(skin: THREE.Material): THREE.Mesh[] {
  const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), skin);
  palm.scale.set(0.04, PLAYER_TOY_ARM_PALM_TOP, 0.05);
  palm.position.set(0, 0, -0.045);
  const fingers = [-0.027, -0.009, 0.009, 0.027].map((x, index) => {
    const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.0085, index === 0 ? 0.034 : 0.044, 4, 8), skin);
    finger.rotation.set(-Math.PI / 2 + 0.75, 0, 0);
    finger.position.set(x, 0.016, -0.108 + Math.abs(x) * 0.5);
    return finger;
  });
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.0105, 0.036, 4, 8), skin);
  thumb.rotation.set(-Math.PI / 2 + 0.45, -0.7, 0, 'YXZ');
  thumb.position.set(0.043, 0.012, -0.04);
  return [palm, ...fingers, thumb];
}

/**
 * Builds a tapered segment running from its joint along -Z.
 *
 * @param near Radius at the joint.
 * @param far Radius at the far end.
 * @param length Length.
 * @param material Material.
 * @returns Mesh.
 */
function playerToyArmSegment(near: number, far: number, length: number, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(far, near, length, 18), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.z = -length / 2;
  return mesh;
}

/**
 * Builds a joint sphere.
 *
 * @param radius Radius.
 * @param material Material.
 * @param z Offset along -Z.
 * @returns Mesh.
 */
function playerToyArmSphere(radius: number, material: THREE.Material, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12), material);
  mesh.position.z = -z;
  return mesh;
}

/**
 * Puts the joints into a pose.
 *
 * @param rig Joints.
 * @param pose Joint angles.
 */
export function playerToyArmApply(rig: PlayerToyArmRig, pose: PlayerToyArmPose): void {
  rig.shoulder.rotation.set(pose.pitch, pose.yaw, 0);
  rig.elbow.rotation.set(pose.elbow, 0, 0);
  rig.wrist.rotation.set(pose.wrist, 0, pose.roll);
}

/**
 * Puts a toy at its true size on the hand.
 *
 * @param rig Joints.
 * @param kind Toy kind.
 */
export function playerToyArmGrip(rig: PlayerToyArmRig, kind: PhysicsToyKind): void {
  rig.grip.position.copy(PLAYER_TOY_ARM_ITEM[kind]);
  rig.grip.quaternion.identity();
}

const scratchQuaternion = new THREE.Quaternion();

/**
 * Turns the grip so the toy keeps an attitude in view space whatever the arm
 * does (the plane stays level, nose ahead, through the throw).
 *
 * @param rig Joints (in a root at the view origin).
 * @param attitude Wanted toy orientation in view space.
 */
export function playerToyArmLevel(rig: PlayerToyArmRig, attitude: THREE.Quaternion): void {
  rig.shoulder.updateMatrixWorld(true);
  rig.hand.getWorldQuaternion(scratchQuaternion);
  rig.grip.quaternion.copy(scratchQuaternion.invert().multiply(attitude));
}

/** Skin color of the arm. */
export const PLAYER_TOY_ARM_SKIN_COLOR = PLAYER_TOY_ARM_SKIN;
