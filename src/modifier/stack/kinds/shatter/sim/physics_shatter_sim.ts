import type RAPIER from '@dimforge/rapier3d-deterministic-compat';
import * as THREE from 'three';
import type { PhysicsRapierModule } from '@/physics/rapier/physics_rapier_runtime.js';
import {
  physicsShatterTransformIdentity,
  type PhysicsShatterPieceTransform,
} from '@/modifier/stack/kinds/shatter/physics_shatter_transform.js';
import { PhysicsShatterSimFrame } from './physics_shatter_sim_frame.js';
import {
  physicsShatterBlastFalloff,
  physicsShatterBlastSpin,
  physicsShatterBlastVelocity,
  type PhysicsShatterSimBlastWorld,
} from './physics_shatter_sim_blast.js';
import {
  physicsShatterBodyAddFloor,
  physicsShatterBodyAddStaticHull,
  physicsShatterBodyColliderDesc,
  physicsShatterBodyLaunchFriction,
  physicsShatterBodyLocalHull,
  PHYSICS_SHATTER_BODY_LAUNCH_STEPS,
} from './physics_shatter_sim_bodies.js';
import type {
  PhysicsShatterSimPiece,
  PhysicsShatterSimResult,
  PhysicsShatterSimSetup,
} from './physics_shatter_sim_types.js';

/** Fixed simulation step in seconds. */
export const PHYSICS_SHATTER_SIM_STEP_SECONDS = 1 / 60;

/** Most pieces that may move in one simulation. */
export const PHYSICS_SHATTER_SIM_MAX_MOVING_PIECES = 2048;

/** Steps always taken before the simulation may end because everything sleeps. */
const PHYSICS_SHATTER_SIM_MIN_STEPS = 30;

/** Largest move, in metres, of a piece that still counts as stuck. */
const PHYSICS_SHATTER_SIM_STUCK_DISTANCE = 0.01;

/** Largest turn, in radians, of a piece that still counts as stuck. */
const PHYSICS_SHATTER_SIM_STUCK_ANGLE = THREE.MathUtils.degToRad(1);

/** Earth gravity along world -Y, in metres per second squared. */
const PHYSICS_SHATTER_SIM_GRAVITY = 9.81;

/** One piece's body, or null for a piece that stays where it was cut. */
interface PhysicsShatterSimBody {
  piece: PhysicsShatterSimPiece;
  body: RAPIER.RigidBody | null;
}

/**
 * Blasts pieces apart in a world of their own, with gravity, a fixed step and
 * sleeping bodies, landing on fixed hulls and an optional floor. It is stepped
 * by its owner, so the same setup always gives the same result.
 */
export class PhysicsShatterSimulation {
  private readonly world: RAPIER.World;
  private readonly frame: PhysicsShatterSimFrame;
  private readonly bodies: PhysicsShatterSimBody[];
  private readonly maximumSteps: number;
  private stepsTaken = 0;

  /**
   * Builds the world: fixed geometry, then one body per piece with its blast
   * velocity and spin.
   *
   * @param rapier Loaded Rapier module.
   * @param setup Pieces, blast, fixed geometry and floor.
   */
  constructor(
    private readonly rapier: PhysicsRapierModule,
    setup: PhysicsShatterSimSetup,
  ) {
    this.world = new rapier.World({ x: 0, y: -PHYSICS_SHATTER_SIM_GRAVITY, z: 0 });
    this.world.timestep = PHYSICS_SHATTER_SIM_STEP_SECONDS;
    this.world.numSolverIterations = setup.solverIterations;
    this.frame = new PhysicsShatterSimFrame(setup.frameToWorld);
    this.maximumSteps = Math.max(1, Math.ceil(setup.blast.duration / PHYSICS_SHATTER_SIM_STEP_SECONDS));
    this.staticsAdd(setup);
    const blast = PhysicsShatterSimulation.blastWorldOf(setup, this.frame);
    this.bodies = setup.pieces.map((piece) => ({ piece, body: this.bodyCreate(piece, blast, setup.seed) }));
  }

  /**
   * Counts the pieces that move: those inside the blast in bricks mode, all in
   * glass mode.
   *
   * @param setup Simulation setup.
   * @returns Moving piece count.
   */
  static movingPieceCount(setup: PhysicsShatterSimSetup): number {
    const frame = new PhysicsShatterSimFrame(setup.frameToWorld);
    const blast = PhysicsShatterSimulation.blastWorldOf(setup, frame);
    return setup.pieces.filter((piece) => !PhysicsShatterSimulation.startsStuck(piece, frame, blast)).length;
  }

  /**
   * Returns the steps taken so far.
   *
   * @returns Step count.
   */
  getStepsTaken(): number {
    return this.stepsTaken;
  }

  /**
   * Returns the step count after which the simulation ends at the latest.
   *
   * @returns Step count.
   */
  getMaximumSteps(): number {
    return this.maximumSteps;
  }

  /**
   * Returns whether the duration has passed or every piece has come to rest.
   *
   * @returns True once finished.
   */
  isFinished(): boolean {
    if (this.stepsTaken >= this.maximumSteps) return true;
    return (
      this.stepsTaken >= PHYSICS_SHATTER_SIM_MIN_STEPS && this.bodies.every(({ body }) => !body || body.isSleeping())
    );
  }

  /**
   * Advances one fixed step unless finished; pieces slide without friction for
   * the first launch steps.
   *
   * @returns True when a step was taken.
   */
  step(): boolean {
    if (this.isFinished()) return false;
    this.world.step();
    this.stepsTaken++;
    if (this.stepsTaken === PHYSICS_SHATTER_BODY_LAUNCH_STEPS) this.launchEnd();
    return true;
  }

  /** Gives every piece its normal friction once the launch is over. */
  private launchEnd(): void {
    for (const { body } of this.bodies) {
      const collider = body && body.numColliders() > 0 ? body.collider(0) : null;
      if (collider) physicsShatterBodyLaunchFriction(this.rapier, collider, false);
    }
  }

  /**
   * Returns every piece's current transform in the modifier frame.
   *
   * @returns Transform per piece.
   */
  transformsCurrent(): PhysicsShatterPieceTransform[] {
    return this.bodies.map(({ piece, body }) => this.transformOf(piece, body));
  }

  /**
   * Returns the outcome: pieces that barely moved become stuck at identity.
   *
   * @returns Transforms and stuck flags.
   */
  result(): PhysicsShatterSimResult {
    const transforms = this.transformsCurrent();
    const stuck = transforms.map((transform) => PhysicsShatterSimulation.transformIsStuck(transform));
    const settled = transforms.map((transform, index) =>
      stuck[index] ? physicsShatterTransformIdentity() : transform,
    );
    return { transforms: settled, stuck, steps: this.stepsTaken };
  }

  /** Frees the Rapier world. */
  dispose(): void {
    this.world.free();
  }

  /**
   * Returns whether a transform moved its piece so little that it stays put.
   *
   * @param transform Piece transform.
   * @returns True when stuck.
   */
  static transformIsStuck(transform: PhysicsShatterPieceTransform): boolean {
    const angle = 2 * Math.acos(Math.min(1, Math.abs(transform.rotation.clone().normalize().w)));
    return (
      transform.translation.length() < PHYSICS_SHATTER_SIM_STUCK_DISTANCE && angle < PHYSICS_SHATTER_SIM_STUCK_ANGLE
    );
  }

  /**
   * Adds the fixed hulls and the floor.
   *
   * @param setup Simulation setup.
   */
  private staticsAdd(setup: PhysicsShatterSimSetup): void {
    for (const hull of setup.staticHulls) physicsShatterBodyAddStaticHull(this.rapier, this.world, hull);
    if (setup.floorHeight !== null) physicsShatterBodyAddFloor(this.rapier, this.world, setup.floorHeight);
  }

  /**
   * Converts the blast of a setup to world space.
   *
   * @param setup Simulation setup.
   * @param frame Frame converter.
   * @returns World blast.
   */
  private static blastWorldOf(
    setup: PhysicsShatterSimSetup,
    frame: PhysicsShatterSimFrame,
  ): PhysicsShatterSimBlastWorld {
    return {
      impactPoint: frame.pointToWorld(setup.blast.impactPoint),
      direction: frame.directionToWorld(setup.blast.direction).normalize(),
      strength: setup.blast.strength,
      radius: setup.blast.radius,
    };
  }

  /**
   * Returns whether a piece starts stuck: a brick outside the blast radius.
   *
   * @param piece Piece.
   * @param frame Frame converter.
   * @param blast World blast.
   * @returns True when the piece never moves.
   */
  private static startsStuck(
    piece: PhysicsShatterSimPiece,
    frame: PhysicsShatterSimFrame,
    blast: PhysicsShatterSimBlastWorld,
  ): boolean {
    return piece.isBrick && physicsShatterBlastFalloff(frame.pointToWorld(piece.centroid), blast) <= 0;
  }

  /**
   * Creates a piece's body: fixed for a stuck brick, dynamic with its blast
   * velocity and spin otherwise. A hull Rapier cannot use stays put.
   *
   * @param piece Piece.
   * @param blast World blast.
   * @param seed Spin seed.
   * @returns Dynamic body, or null when the piece stays put.
   */
  private bodyCreate(
    piece: PhysicsShatterSimPiece,
    blast: PhysicsShatterSimBlastWorld,
    seed: number,
  ): RAPIER.RigidBody | null {
    const worldPoints = this.frame.pointsToWorld(piece.hull);
    if (PhysicsShatterSimulation.startsStuck(piece, this.frame, blast)) {
      physicsShatterBodyAddStaticHull(this.rapier, this.world, worldPoints);
      return null;
    }
    const centre = this.frame.pointToWorld(piece.centroid);
    const collider = physicsShatterBodyColliderDesc(this.rapier, physicsShatterBodyLocalHull(worldPoints, centre));
    if (!collider) return null;
    const velocity = physicsShatterBlastVelocity(centre, blast);
    const spin = physicsShatterBlastSpin(seed, piece.index, velocity.length());
    const desc = this.rapier.RigidBodyDesc.dynamic().setTranslation(centre.x, centre.y, centre.z).setCcdEnabled(true);
    const body = this.world.createRigidBody(desc.setLinvel(velocity.x, velocity.y, velocity.z).setAngvel(spin));
    physicsShatterBodyLaunchFriction(this.rapier, this.world.createCollider(collider, body), true);
    return body;
  }

  /**
   * Returns a piece's current transform in the frame.
   *
   * @param piece Piece.
   * @param body Its body, or null when it stays put.
   * @returns Transform.
   */
  private transformOf(piece: PhysicsShatterSimPiece, body: RAPIER.RigidBody | null): PhysicsShatterPieceTransform {
    if (!body) return physicsShatterTransformIdentity();
    const position = body.translation();
    const rotation = body.rotation();
    return this.frame.transformFromWorldPose(
      new THREE.Vector3(position.x, position.y, position.z),
      new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w),
      piece.centroid,
    );
  }
}
