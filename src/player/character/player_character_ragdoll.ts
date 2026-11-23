import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-deterministic-compat';
import { PhysicsRapierRuntime } from '@/physics/rapier/physics_rapier_runtime.js';
import { PLAYER_GRAVITY_METERS_PER_SECOND_SQUARED } from '@/player/player_constants.js';
import { PLAYER_CHARACTER_BONE, type PlayerCharacterBoneId } from './player_character_bone_ids.js';
import type { PlayerCharacterRig } from './player_character_rig.js';

/** Fixed simulation step of the ragdoll. */
const RAGDOLL_STEP_SECONDS = 1 / 60;
/** Solver iterations per step (stiff joints without stretching). */
const RAGDOLL_SOLVER_ITERATIONS = 12;
/** Most steps simulated in one frame (a stall does not snowball). */
const RAGDOLL_MAX_STEPS = 4;
/** Rate (per second) the ragdoll blends in when flight starts. */
const RAGDOLL_BLEND_IN_PER_SECOND = 10;
/** Rate (per second) the ragdoll blends back into the animated pose on landing. */
const RAGDOLL_BLEND_OUT_PER_SECOND = 6;
/** Rate (per second) the reaching arm's spin follows what its pull asks for. */
const RAGDOLL_RESPONSE_PER_SECOND = 20;
/** Pull of the right arm toward the beam anchor (per second): the hand leads. */
const RAGDOLL_REACH_STIFFNESS = 16;
/** Share of the turn toward the anchor the chest leans while the hand is pulled. */
const RAGDOLL_LEAN = 0.4;
/**
 * Most acceleration of the pelvis passed to the limbs through the joints; a
 * harder jolt (the yank, a network snap) carries the whole body along at once,
 * so it never flings the limbs.
 */
const RAGDOLL_MAX_DRAG_METERS_PER_SECOND_SQUARED = 40;
/** Fastest spin of a limb. */
const RAGDOLL_MAX_SPIN_RADIANS_PER_SECOND = 12;
/**
 * Air drag on the parts (per second): just enough that limbs trail a fast
 * flight without being blown back onto their limits.
 */
const RAGDOLL_AIR_DRAG_PER_SECOND = 0.1;
/**
 * Damping (per second) of the parts' motion relative to the pelvis: a swing
 * dies out within about a second instead of pendulating on.
 */
const RAGDOLL_SWING_DAMPING_PER_SECOND = 3;
/** Pelvis travel in one frame that counts as a teleport (the ragdoll restarts). */
const RAGDOLL_TELEPORT_METERS = 4;
/** Density of the limbs (water, so masses are about a person's). */
const RAGDOLL_DENSITY = 1000;
/** Length of the head capsule (it has no child bone to measure to). */
const RAGDOLL_HEAD_LENGTH_METERS = 0.22;

/** One rigid part of the ragdoll, following one bone. */
interface RagdollSegmentSpec {
  /** Bone the part moves. */
  bone: PlayerCharacterBoneId;
  /** Index of the part it hangs from (-1: the pelvis, driven by the animation). */
  parent: number;
  /** Bone the capsule reaches to, or null for a fixed length. */
  tip: PlayerCharacterBoneId | null;
  /** Extra capsule length past the tip (a hand on a forearm, a foot on a shin). */
  extend: number;
  /** Capsule radius. */
  radius: number;
  /**
   * Posture spring (per second squared per radian of turn): a faint pull back
   * toward the animated pose, so loose parts dangle and trail. For a carried
   * part, the rate (per second) it eases toward its pose.
   */
  stiffness: number;
  /**
   * Joint limit: farthest a part may turn from where it sits on its parent at
   * rest, in radians (a cone, so a hard jolt can never fold a limb over).
   */
  limit: number;
  /**
   * Shown as animated, not as simulated (the head keeps looking where the
   * player looks).
   */
  looks?: boolean;
  /**
   * Carried on its parent rather than hanging from it: moved by the ragdoll
   * (the torso, which the loose parts hang from, so their weight never drags it
   * over).
   */
  carried?: boolean;
}

/**
 * The parts: pelvis (moved by the animation), chest, head, arms and legs, two
 * capsules each, hung on ball joints. The torso rides on the pelvis, leaning
 * toward the beam; faint posture springs leave the limbs to dangle and trail.
 * The head is simulated (the limbs bump into it) but shown at its animated
 * world rotation, so it still looks where the player looks.
 */
const RAGDOLL_SEGMENTS: readonly RagdollSegmentSpec[] = [
  {
    bone: PLAYER_CHARACTER_BONE.hips,
    parent: -1,
    tip: PLAYER_CHARACTER_BONE.spine,
    extend: 0,
    radius: 0.1,
    stiffness: 0,
    limit: 0,
  },
  {
    bone: PLAYER_CHARACTER_BONE.spine,
    parent: 0,
    tip: PLAYER_CHARACTER_BONE.head,
    extend: 0,
    radius: 0.1,
    stiffness: 14,
    limit: 0.5,
    carried: true,
  },
  {
    bone: PLAYER_CHARACTER_BONE.head,
    parent: 1,
    tip: null,
    extend: 0,
    radius: 0.1,
    stiffness: 30,
    limit: 0.6,
    looks: true,
    carried: true,
  },
  {
    bone: PLAYER_CHARACTER_BONE.upperArmLeft,
    parent: 1,
    tip: PLAYER_CHARACTER_BONE.lowerArmLeft,
    extend: 0,
    radius: 0.04,
    stiffness: 3,
    limit: 1.6,
  },
  {
    bone: PLAYER_CHARACTER_BONE.lowerArmLeft,
    parent: 3,
    tip: PLAYER_CHARACTER_BONE.handLeft,
    extend: 0.1,
    radius: 0.035,
    stiffness: 3,
    limit: 1.4,
  },
  {
    bone: PLAYER_CHARACTER_BONE.upperArmRight,
    parent: 1,
    tip: PLAYER_CHARACTER_BONE.lowerArmRight,
    extend: 0,
    radius: 0.04,
    stiffness: 3,
    limit: 1.6,
  },
  {
    bone: PLAYER_CHARACTER_BONE.lowerArmRight,
    parent: 5,
    tip: PLAYER_CHARACTER_BONE.handRight,
    extend: 0.1,
    radius: 0.035,
    stiffness: 3,
    limit: 1.4,
  },
  {
    bone: PLAYER_CHARACTER_BONE.upperLegLeft,
    parent: 0,
    tip: PLAYER_CHARACTER_BONE.lowerLegLeft,
    extend: 0,
    radius: 0.06,
    stiffness: 4,
    limit: 1.1,
  },
  {
    bone: PLAYER_CHARACTER_BONE.lowerLegLeft,
    parent: 7,
    tip: PLAYER_CHARACTER_BONE.footLeft,
    extend: 0.08,
    radius: 0.05,
    stiffness: 4,
    limit: 1.3,
  },
  {
    bone: PLAYER_CHARACTER_BONE.upperLegRight,
    parent: 0,
    tip: PLAYER_CHARACTER_BONE.lowerLegRight,
    extend: 0,
    radius: 0.06,
    stiffness: 4,
    limit: 1.1,
  },
  {
    bone: PLAYER_CHARACTER_BONE.lowerLegRight,
    parent: 9,
    tip: PLAYER_CHARACTER_BONE.footRight,
    extend: 0.08,
    radius: 0.05,
    stiffness: 4,
    limit: 1.3,
  },
];

/** Parts of the right arm, which reaches for the beam anchor. */
const RAGDOLL_REACH_SEGMENTS: ReadonlySet<number> = new Set([5, 6]);

const UP = new THREE.Vector3(0, 1, 0);
const scratchPosition = new THREE.Vector3();
const scratchIdentity = new THREE.Quaternion();
const scratchQuaternion = new THREE.Quaternion();
const scratchTarget = new THREE.Quaternion();
const scratchParent = new THREE.Quaternion();
const scratchAxis = new THREE.Vector3();
const scratchSpin = new THREE.Vector3();
const scratchVelocity = new THREE.Vector3();
const scratchDirection = new THREE.Vector3();

/** One built part. */
interface RagdollSegment {
  spec: RagdollSegmentSpec;
  bone: THREE.Bone;
  body: RAPIER.RigidBody;
  /** Animated world position this frame. */
  position: THREE.Vector3;
  /** Animated world rotation this frame. */
  rotation: THREE.Quaternion;
  /** Rotation the drive turned it toward last (the animated pose or the reach). */
  target: THREE.Quaternion;
  /** Whether it is pulled toward the reach (no joint limit then). */
  reaching: boolean;
  /** Its rotation on its parent at rest (the joint limit's center). */
  rest: THREE.Quaternion;
  /** Its joint in its parent's frame. */
  anchor: THREE.Vector3;
  /** Where the step being simulated puts it (a carried part's parent leads it). */
  stepPosition: THREE.Vector3;
  /** Its rotation at the step being simulated. */
  stepRotation: THREE.Quaternion;
}

/**
 * A physical ragdoll the character goes limp into while flying (flung by the
 * grapple beam): capsules for the pelvis, chest, head, upper and lower arms and
 * legs, joined by ball joints, in a small Rapier world of its own (so it never
 * touches the level or the player's collision). The pelvis follows the animated
 * pose, so the body flies with the player, carrying the torso and head; the
 * right arm pulls toward the beam's anchor, so the hand leads, and the other
 * limbs dangle and trail under gravity and the pull, damped and held by joint
 * limits, colliding with each other (joined parts excepted) so they never pass
 * through the body. On landing it blends smoothly back into the animated (IK)
 * pose. It costs nothing while not flying.
 */
export class PlayerCharacterRagdoll {
  private world: RAPIER.World | null = null;
  private segments: RagdollSegment[] = [];
  private weight = 0;
  private live = false;
  private time = 0;
  private readonly pelvisFrom = new THREE.Vector3();
  private readonly pelvisFromRotation = new THREE.Quaternion();
  /** Pelvis velocity over the last frame's steps. */
  private readonly pelvisVelocity = new THREE.Vector3();

  /**
   * Returns how far the pose is taken over by the ragdoll.
   *
   * @returns 0 (animated) to 1 (limp).
   */
  getWeight(): number {
    return this.weight;
  }

  /**
   * Simulates one frame and blends the ragdoll over the animated pose the rig
   * holds now (call after the animation and the IK posed it).
   *
   * @param rig Character rig.
   * @param flying Whether the character flies (goes or stays limp).
   * @param reach Point the right arm reaches for, or null.
   * @param velocity Body velocity (the limbs start with it).
   * @param deltaSeconds Frame time.
   */
  apply(
    rig: PlayerCharacterRig,
    flying: boolean,
    reach: THREE.Vector3 | null,
    velocity: THREE.Vector3,
    deltaSeconds: number,
  ): void {
    if (!flying && this.weight === 0) {
      this.live = false;
      return;
    }
    const rapier = PhysicsRapierRuntime.getLoaded();
    if (!rapier) return;
    rig.root.updateMatrixWorld(true);
    if (!this.world) this.build(rapier, rig);
    this.readPose();
    const pelvis = this.segments[0];
    if (!pelvis) return;
    if (!this.live || pelvis.position.distanceTo(this.pelvisFrom) > RAGDOLL_TELEPORT_METERS)
      this.restart(velocity, deltaSeconds);
    this.simulate(reach, deltaSeconds);
    const rate = flying ? RAGDOLL_BLEND_IN_PER_SECOND : RAGDOLL_BLEND_OUT_PER_SECOND;
    this.weight += ((flying ? 1 : 0) - this.weight) * (1 - Math.exp(-rate * deltaSeconds));
    if (!flying && this.weight < 0.01) this.weight = 0;
    this.write();
    if (this.weight === 0) this.live = false;
  }

  /** Frees the physics world. */
  dispose(): void {
    this.world?.free();
    this.world = null;
    this.segments = [];
    this.live = false;
    this.weight = 0;
  }

  /**
   * Builds the parts from the pose the rig holds now.
   *
   * @param rapier Rapier module.
   * @param rig Character rig.
   */
  private build(rapier: typeof RAPIER, rig: PlayerCharacterRig): void {
    const world = new rapier.World({ x: 0, y: -PLAYER_GRAVITY_METERS_PER_SECOND_SQUARED, z: 0 });
    world.timestep = RAGDOLL_STEP_SECONDS;
    world.numSolverIterations = RAGDOLL_SOLVER_ITERATIONS;
    const segments: RagdollSegment[] = [];
    for (const spec of RAGDOLL_SEGMENTS) {
      const bone = rig.bones.get(spec.bone);
      if (!bone) {
        world.free();
        return;
      }
      const position = bone.getWorldPosition(new THREE.Vector3());
      const rotation = bone.getWorldQuaternion(new THREE.Quaternion());
      const desc =
        spec.parent < 0 || spec.carried
          ? rapier.RigidBodyDesc.kinematicPositionBased()
          : rapier.RigidBodyDesc.dynamic();
      desc.setTranslation(position.x, position.y, position.z).setRotation(rotation);
      desc.setLinearDamping(RAGDOLL_AIR_DRAG_PER_SECOND).setAngularDamping(4);
      const body = world.createRigidBody(desc);
      world.createCollider(this.capsule(rapier, rig, spec, position, rotation), body);
      const parent = segments[spec.parent];
      const anchor = parent
        ? position.clone().sub(parent.position).applyQuaternion(parent.rotation.clone().invert())
        : new THREE.Vector3();
      if (parent && !spec.carried) {
        const joint = world.createImpulseJoint(
          rapier.JointData.spherical(anchor, { x: 0, y: 0, z: 0 }),
          parent.body,
          body,
          true,
        );
        joint.setContactsEnabled(false);
      }
      const rest = parent ? parent.rotation.clone().invert().multiply(rotation) : new THREE.Quaternion();
      segments.push({
        spec,
        bone,
        body,
        position,
        rotation,
        target: rotation.clone(),
        reaching: false,
        rest,
        anchor,
        stepPosition: position.clone(),
        stepRotation: rotation.clone(),
      });
    }
    this.world = world;
    this.segments = segments;
  }

  /**
   * Builds a part's capsule, from its bone to the tip bone (in the part's
   * frame, where the bone points along +Y).
   *
   * @param rapier Rapier module.
   * @param rig Character rig.
   * @param spec Part.
   * @param position Bone world position.
   * @param rotation Bone world rotation.
   * @returns Collider description.
   */
  private capsule(
    rapier: typeof RAPIER,
    rig: PlayerCharacterRig,
    spec: RagdollSegmentSpec,
    position: THREE.Vector3,
    rotation: THREE.Quaternion,
  ): RAPIER.ColliderDesc {
    const tip = spec.tip ? rig.bones.get(spec.tip) : undefined;
    const reach = tip
      ? tip.getWorldPosition(new THREE.Vector3()).sub(position).applyQuaternion(rotation.clone().invert())
      : new THREE.Vector3(0, RAGDOLL_HEAD_LENGTH_METERS, 0);
    const length = reach.length() + spec.extend;
    const direction = reach.normalize();
    const half = Math.max(0.01, length / 2 - spec.radius);
    const center = direction.clone().multiplyScalar(length / 2);
    const turn = new THREE.Quaternion().setFromUnitVectors(UP, direction);
    return rapier.ColliderDesc.capsule(half, spec.radius)
      .setTranslation(center.x, center.y, center.z)
      .setRotation(turn)
      .setDensity(RAGDOLL_DENSITY)
      .setFriction(0.3);
  }

  /** Reads where the animation put each part this frame. */
  private readPose(): void {
    for (const segment of this.segments) {
      segment.bone.getWorldPosition(segment.position);
      segment.bone.getWorldQuaternion(segment.rotation);
    }
  }

  /**
   * Puts every part on the animated pose a frame back along the velocity,
   * moving with the body (the step then brings them onto this frame's pose),
   * and takes that pose as the joints' rest.
   *
   * @param velocity Body velocity.
   * @param deltaSeconds Frame time.
   */
  private restart(velocity: THREE.Vector3, deltaSeconds: number): void {
    for (const segment of this.segments) {
      segment.body.setTranslation(
        scratchPosition.copy(segment.position).addScaledVector(velocity, -deltaSeconds),
        true,
      );
      segment.body.setRotation(segment.rotation, true);
      segment.body.setLinvel(velocity, true);
      segment.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      const parent = this.segments[segment.spec.parent];
      if (parent) segment.rest.copy(parent.rotation).invert().multiply(segment.rotation);
    }
    const pelvis = this.segments[0];
    if (pelvis) {
      this.pelvisFrom.copy(pelvis.position).addScaledVector(velocity, -deltaSeconds);
      this.pelvisFromRotation.copy(pelvis.rotation);
    }
    this.pelvisVelocity.copy(velocity);
    this.time = 0;
    this.live = true;
  }

  /**
   * Steps the world at its fixed rate: the pelvis glides to its animated pose
   * and drags the rest along, the right arm pulls toward the reach, the chest
   * leans after it and the other parts only feel a faint posture spring, all
   * kept within their joint limits and spin.
   *
   * @param reach Point the right arm reaches for, or null.
   * @param deltaSeconds Frame time.
   */
  private simulate(reach: THREE.Vector3 | null, deltaSeconds: number): void {
    const world = this.world;
    const pelvis = this.segments[0];
    if (!world || !pelvis) return;
    this.time = Math.min(this.time + deltaSeconds, RAGDOLL_MAX_STEPS * RAGDOLL_STEP_SECONDS);
    const steps = Math.floor(this.time / RAGDOLL_STEP_SECONDS);
    this.time -= steps * RAGDOLL_STEP_SECONDS;
    if (steps === 0) return;
    this.absorbJolt(pelvis, steps * RAGDOLL_STEP_SECONDS);
    for (let step = 1; step <= steps; step++) {
      const along = step / steps;
      pelvis.stepPosition.lerpVectors(this.pelvisFrom, pelvis.position, along);
      pelvis.stepRotation.slerpQuaternions(this.pelvisFromRotation, pelvis.rotation, along);
      pelvis.body.setNextKinematicTranslation(pelvis.stepPosition);
      pelvis.body.setNextKinematicRotation(pelvis.stepRotation);
      this.segments.forEach((segment, index) => {
        if (index === 0) return;
        if (segment.spec.carried) this.ride(segment, reach);
        else this.drive(segment, reach, RAGDOLL_REACH_SEGMENTS.has(index));
      });
      world.step();
      this.segments.forEach((segment, index) => {
        if (index > 0 && !segment.spec.carried) this.limit(segment);
      });
    }
    this.pelvisFrom.copy(pelvis.position);
    this.pelvisFromRotation.copy(pelvis.rotation);
  }

  /**
   * Hands the part of the pelvis's change in velocity beyond what the joints
   * should drag through straight to every part, so a jolt carries the body
   * along whole while ordinary pulls still make the limbs trail.
   *
   * @param pelvis Pelvis part.
   * @param seconds Time this frame's steps cover.
   */
  private absorbJolt(pelvis: RagdollSegment, seconds: number): void {
    scratchVelocity.subVectors(pelvis.position, this.pelvisFrom).divideScalar(seconds);
    const change = scratchDirection.subVectors(scratchVelocity, this.pelvisVelocity);
    this.pelvisVelocity.copy(scratchVelocity);
    const drag = RAGDOLL_MAX_DRAG_METERS_PER_SECOND_SQUARED * seconds;
    const size = change.length();
    if (size <= drag) return;
    change.multiplyScalar(1 - drag / size);
    for (let index = 1; index < this.segments.length; index++) {
      const body = this.segments[index]!.body;
      const velocity = body.linvel();
      body.setLinvel({ x: velocity.x + change.x, y: velocity.y + change.y, z: velocity.z + change.z }, true);
    }
  }

  /**
   * Moves a carried part (torso, head) with its parent through this step,
   * easing its turn on the parent toward the animated one, the torso leaned
   * toward the reach (at most its limit). Easing on the parent means a sudden
   * turn of the body carries it at once instead of spinning it after.
   *
   * @param segment Part.
   * @param reach Point the arm reaches for, or null.
   */
  private ride(segment: RagdollSegment, reach: THREE.Vector3 | null): void {
    const parent = this.segments[segment.spec.parent];
    if (!parent) return;
    const body = segment.body;
    const joint = segment.stepPosition
      .copy(segment.anchor)
      .applyQuaternion(parent.stepRotation)
      .add(parent.stepPosition);
    scratchTarget.copy(segment.rotation);
    if (reach && !segment.spec.looks) {
      scratchDirection.set(reach.x - joint.x, reach.y - joint.y, reach.z - joint.z).normalize();
      scratchAxis.copy(UP).applyQuaternion(segment.rotation);
      scratchParent.setFromUnitVectors(scratchAxis, scratchDirection);
      const angle = 2 * Math.acos(Math.min(1, Math.abs(scratchParent.w)));
      const lean = angle > 1e-6 ? Math.min(RAGDOLL_LEAN, segment.spec.limit / angle) : 0;
      scratchTarget.premultiply(scratchParent.slerp(scratchIdentity, 1 - lean));
    }
    segment.target.copy(scratchTarget);
    scratchTarget.premultiply(scratchParent.copy(parent.rotation).invert());
    const current = body.rotation();
    const from = scratchQuaternion.set(current.x, current.y, current.z, current.w);
    from.premultiply(scratchParent.copy(parent.body.rotation()).invert());
    from.slerp(scratchTarget, 1 - Math.exp(-segment.spec.stiffness * RAGDOLL_STEP_SECONDS));
    segment.stepRotation.copy(parent.stepRotation).multiply(from);
    body.setNextKinematicTranslation(joint);
    body.setNextKinematicRotation(segment.stepRotation);
  }

  /**
   * Turns a part: the reaching arm firmly along the line to the reach point
   * (its spin set outright, so the hand leads), anything else by a nudge of its
   * posture spring, its spin damped against its parent's and its motion against
   * the pelvis's, leaving it to swing and trail without pendulating.
   *
   * @param segment Part.
   * @param reach Point the arm reaches for, or null.
   * @param reacher Whether the part is the reaching arm.
   */
  private drive(segment: RagdollSegment, reach: THREE.Vector3 | null, reacher: boolean): void {
    const body = segment.body;
    const rotation = body.rotation();
    scratchQuaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
    scratchTarget.copy(segment.rotation);
    if (reach && reacher) {
      const from = body.translation();
      scratchDirection.set(reach.x - from.x, reach.y - from.y, reach.z - from.z).normalize();
      scratchAxis.copy(UP).applyQuaternion(segment.rotation);
      scratchTarget.premultiply(scratchParent.setFromUnitVectors(scratchAxis, scratchDirection));
    }
    segment.target.copy(scratchTarget);
    segment.reaching = reach !== null && reacher;
    scratchTarget.multiply(scratchParent.copy(scratchQuaternion).invert());
    if (scratchTarget.w < 0) scratchTarget.set(-scratchTarget.x, -scratchTarget.y, -scratchTarget.z, -scratchTarget.w);
    const angle = 2 * Math.acos(Math.min(1, scratchTarget.w));
    const sine = Math.sqrt(Math.max(0, 1 - scratchTarget.w * scratchTarget.w));
    scratchAxis.set(scratchTarget.x, scratchTarget.y, scratchTarget.z);
    if (sine > 1e-6) scratchAxis.divideScalar(sine);
    else scratchAxis.set(0, 0, 0);
    const spin = body.angvel();
    scratchSpin.set(spin.x, spin.y, spin.z);
    if (segment.reaching) {
      const follow = 1 - Math.exp(-RAGDOLL_RESPONSE_PER_SECOND * RAGDOLL_STEP_SECONDS);
      scratchSpin.lerp(scratchAxis.multiplyScalar(angle * RAGDOLL_REACH_STIFFNESS), follow);
    } else {
      const stiffness = segment.spec.stiffness;
      scratchSpin.addScaledVector(scratchAxis, angle * stiffness * RAGDOLL_STEP_SECONDS);
      const parentSpin = this.segments[segment.spec.parent]?.body.angvel();
      if (parentSpin) {
        scratchVelocity.set(spin.x - parentSpin.x, spin.y - parentSpin.y, spin.z - parentSpin.z);
        const damping = Math.min(1, 2 * Math.sqrt(stiffness) * RAGDOLL_STEP_SECONDS);
        scratchSpin.addScaledVector(scratchVelocity, -damping);
      }
    }
    if (scratchSpin.length() > RAGDOLL_MAX_SPIN_RADIANS_PER_SECOND)
      scratchSpin.setLength(RAGDOLL_MAX_SPIN_RADIANS_PER_SECOND);
    body.setAngvel(scratchSpin, true);
    const parent = this.segments[segment.spec.parent]?.body;
    if (segment.reaching && parent) {
      body.setLinvel(this.pivotVelocity(parent, body, scratchSpin), true);
      return;
    }
    const velocity = body.linvel();
    scratchVelocity.set(velocity.x, velocity.y, velocity.z);
    scratchVelocity.lerp(this.pelvisVelocity, Math.min(1, RAGDOLL_SWING_DAMPING_PER_SECOND * RAGDOLL_STEP_SECONDS));
    body.setLinvel(scratchVelocity, true);
  }

  /**
   * Keeps a part within its joint limit on its parent (not the reaching arm,
   * which swings far on purpose), stopping dead there (no bounce to flail on),
   * and its spin under the cap.
   *
   * @param segment Part.
   */
  private limit(segment: RagdollSegment): void {
    const body = segment.body;
    const spin = body.angvel();
    scratchSpin.set(spin.x, spin.y, spin.z);
    if (scratchSpin.length() > RAGDOLL_MAX_SPIN_RADIANS_PER_SECOND) {
      body.setAngvel(scratchSpin.setLength(RAGDOLL_MAX_SPIN_RADIANS_PER_SECOND), true);
    }
    const parent = this.segments[segment.spec.parent]?.body;
    if (segment.reaching || !parent) return;
    const rotation = body.rotation();
    const parentRotation = parent.rotation();
    scratchParent.set(parentRotation.x, parentRotation.y, parentRotation.z, parentRotation.w);
    scratchQuaternion
      .set(rotation.x, rotation.y, rotation.z, rotation.w)
      .premultiply(scratchTarget.copy(scratchParent).invert());
    const angle = scratchQuaternion.angleTo(segment.rest);
    if (angle <= segment.spec.limit) return;
    scratchQuaternion.slerp(segment.rest, 1 - segment.spec.limit / angle).premultiply(scratchParent);
    body.setRotation(scratchQuaternion, true);
    const parentSpin = parent.angvel();
    scratchSpin.set(parentSpin.x, parentSpin.y, parentSpin.z);
    if (scratchSpin.length() > RAGDOLL_MAX_SPIN_RADIANS_PER_SECOND)
      scratchSpin.setLength(RAGDOLL_MAX_SPIN_RADIANS_PER_SECOND);
    body.setAngvel(scratchSpin, true);
  }

  /**
   * Returns the velocity a part's center needs to turn with a spin about its
   * joint, which moves with the part it hangs from (so the joint holds without
   * fighting the drive).
   *
   * @param parent Body it hangs from.
   * @param body Part (its origin is the joint).
   * @param spin Part's spin.
   * @returns Velocity of its center (scratch).
   */
  private pivotVelocity(parent: RAPIER.RigidBody, body: RAPIER.RigidBody, spin: THREE.Vector3): THREE.Vector3 {
    const pivot = body.translation();
    const center = body.worldCom();
    const parentCenter = parent.worldCom();
    const parentSpin = parent.angvel();
    const parentVelocity = parent.linvel();
    scratchDirection.set(pivot.x - parentCenter.x, pivot.y - parentCenter.y, pivot.z - parentCenter.z);
    scratchVelocity
      .set(parentSpin.x, parentSpin.y, parentSpin.z)
      .cross(scratchDirection)
      .add(scratchPosition.set(parentVelocity.x, parentVelocity.y, parentVelocity.z));
    scratchDirection.set(center.x - pivot.x, center.y - pivot.y, center.z - pivot.z);
    return scratchVelocity.add(scratchDirection.crossVectors(spin, scratchDirection));
  }

  /** Blends the parts' rotations over the animated pose, root to tips. */
  private write(): void {
    this.segments.forEach((segment, index) => {
      if (index === 0) return;
      const parent = segment.bone.parent;
      if (!parent) return;
      const rotation = segment.spec.looks ? segment.rotation : segment.body.rotation();
      parent.getWorldQuaternion(scratchParent).invert();
      scratchQuaternion.set(rotation.x, rotation.y, rotation.z, rotation.w).premultiply(scratchParent);
      if (segment.spec.looks) segment.bone.quaternion.copy(scratchQuaternion);
      else segment.bone.quaternion.slerp(scratchQuaternion, this.weight);
      segment.bone.updateMatrixWorld(true);
    });
  }
}
