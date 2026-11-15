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
  physicsShatterBodyAddStaticHull,
  physicsShatterBodyColliderDesc,
  physicsShatterBodyGroups,
  physicsShatterBodyLaunchFriction,
  physicsShatterBodyLocalHull,
  PHYSICS_SHATTER_BODY_LAUNCH_STEPS,
} from './physics_shatter_sim_bodies.js';
import type {
  PhysicsShatterSimPiece,
  PhysicsShatterSimResult,
  PhysicsShatterSimSetup,
} from './physics_shatter_sim_types.js';
import type { PhysicsShatterSimMaterial } from './physics_shatter_sim_material.js';

/** Fixed simulation step in seconds. */
export const PHYSICS_SHATTER_SIM_STEP_SECONDS = 1 / 60;

/**
 * Most pieces that may move in one simulation. The parts of a compound body
 * count one each, since the bake stores a transform per piece.
 */
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
  /** Index of the piece's body group; the parts of a compound body share it. */
  group: number;
  /**
   * World offset from the body's start position to the piece's centroid, or
   * null when the piece is a body of its own and sits at the body's position.
   */
  offset: THREE.Vector3 | null;
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
  private readonly material: PhysicsShatterSimMaterial;
  private stepsTaken = 0;

  /**
   * Builds the world: fixed geometry, then one body per piece, or per group of
   * pieces sharing a body id, with its blast velocity and spin.
   *
   * @param rapier Loaded Rapier module.
   * @param setup Pieces, blast and fixed hulls.
   * @param world World to simulate in, such as one already holding the level
   *   colliders play mode builds; the simulation owns and frees it.
   */
  constructor(
    private readonly rapier: PhysicsRapierModule,
    setup: PhysicsShatterSimSetup,
    world: RAPIER.World = new rapier.World({ x: 0, y: 0, z: 0 }),
  ) {
    this.world = world;
    this.world.gravity = { x: 0, y: -PHYSICS_SHATTER_SIM_GRAVITY, z: 0 };
    this.world.timestep = PHYSICS_SHATTER_SIM_STEP_SECONDS;
    this.world.numSolverIterations = setup.solverIterations;
    this.frame = new PhysicsShatterSimFrame(setup.frameToWorld);
    this.material = setup.material;
    this.maximumSteps = Math.max(1, Math.ceil(setup.blast.duration / PHYSICS_SHATTER_SIM_STEP_SECONDS));
    this.staticsAdd(setup);
    const blast = PhysicsShatterSimulation.blastWorldOf(setup, this.frame);
    this.bodies = this.bodiesCreate(setup, blast);
  }

  /**
   * Counts the pieces that move: those inside the blast in bricks mode, all in
   * glass mode. A compound body's parts move together or not at all.
   *
   * @param setup Simulation setup.
   * @returns Moving piece count.
   */
  static movingPieceCount(setup: PhysicsShatterSimSetup): number {
    const frame = new PhysicsShatterSimFrame(setup.frameToWorld);
    const blast = PhysicsShatterSimulation.blastWorldOf(setup, frame);
    const groups = physicsShatterBodyGroups(setup.pieces);
    const moving = groups.filter((group) => !PhysicsShatterSimulation.groupStartsStuck(group, frame, blast));
    return moving.reduce((count, group) => count + group.length, 0);
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
      for (let index = 0; body && index < body.numColliders(); index++) {
        physicsShatterBodyLaunchFriction(this.rapier, body.collider(index), this.material.friction, false);
      }
    }
  }

  /**
   * Returns every piece's current transform in the modifier frame.
   *
   * @returns Transform per piece.
   */
  transformsCurrent(): PhysicsShatterPieceTransform[] {
    return this.bodies.map((entry) => this.transformOf(entry));
  }

  /**
   * Returns the outcome: pieces that barely moved become stuck at identity. A
   * compound body's parts are stuck only when all of them barely moved.
   *
   * @returns Transforms and stuck flags.
   */
  result(): PhysicsShatterSimResult {
    const transforms = this.transformsCurrent();
    const still = transforms.map((transform) => PhysicsShatterSimulation.transformIsStuck(transform));
    const moved = new Set(this.bodies.filter((_, index) => !still[index]).map(({ group }) => group));
    const stuck = this.bodies.map(({ group }) => !moved.has(group));
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
   * Adds the fixed hulls. There is no floor or bound: pieces that miss every
   * hull fall until the duration ends.
   *
   * @param setup Simulation setup.
   */
  private staticsAdd(setup: PhysicsShatterSimSetup): void {
    for (const hull of setup.staticHulls) physicsShatterBodyAddStaticHull(this.rapier, this.world, hull, this.material);
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
   * Returns whether a group of pieces starts stuck: any of its parts does.
   *
   * @param group Pieces of one body.
   * @param frame Frame converter.
   * @param blast World blast.
   * @returns True when the group never moves.
   */
  private static groupStartsStuck(
    group: readonly PhysicsShatterSimPiece[],
    frame: PhysicsShatterSimFrame,
    blast: PhysicsShatterSimBlastWorld,
  ): boolean {
    return group.some((piece) => PhysicsShatterSimulation.startsStuck(piece, frame, blast));
  }

  /**
   * Creates the bodies of all pieces, one per body group, and lists them in
   * piece order.
   *
   * @param setup Simulation setup.
   * @param blast World blast.
   * @returns Body per piece.
   */
  private bodiesCreate(setup: PhysicsShatterSimSetup, blast: PhysicsShatterSimBlastWorld): PhysicsShatterSimBody[] {
    const byPiece = new Map<PhysicsShatterSimPiece, PhysicsShatterSimBody>();
    physicsShatterBodyGroups(setup.pieces).forEach((group, index) => {
      for (const entry of this.groupCreate(group, index, blast, setup.seed)) byPiece.set(entry.piece, entry);
    });
    return setup.pieces.map(
      (piece) => byPiece.get(piece) ?? { piece, body: null, group: -1 - piece.index, offset: null },
    );
  }

  /**
   * Creates one group's body: fixed hulls when any part starts stuck, else one
   * dynamic body at the parts' mean centroid holding a collider per part.
   *
   * @param group Pieces of one body.
   * @param index Group index.
   * @param blast World blast.
   * @param seed Spin seed.
   * @returns Body per piece of the group.
   */
  private groupCreate(
    group: readonly PhysicsShatterSimPiece[],
    index: number,
    blast: PhysicsShatterSimBlastWorld,
    seed: number,
  ): PhysicsShatterSimBody[] {
    if (PhysicsShatterSimulation.groupStartsStuck(group, this.frame, blast)) {
      for (const piece of group) {
        physicsShatterBodyAddStaticHull(this.rapier, this.world, this.frame.pointsToWorld(piece.hull), this.material);
      }
      return group.map((piece) => ({ piece, body: null, group: index, offset: null }));
    }
    const centres = group.map((piece) => this.frame.pointToWorld(piece.centroid));
    const centre = centres.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(centres.length);
    const body = this.bodyCreate(group, centre, blast, seed);
    return group.map((piece, at) => {
      const offset = group.length > 1 ? (centres[at] ?? centre).clone().sub(centre) : null;
      return { piece, body, group: index, offset };
    });
  }

  /**
   * Creates a dynamic body with its blast velocity and spin and one collider
   * per part. A part whose hull Rapier cannot use is left out; with none left
   * the pieces stay put.
   *
   * @param group Pieces of the body.
   * @param centre World position of the body.
   * @param blast World blast.
   * @param seed Spin seed.
   * @returns Dynamic body, or null when the pieces stay put.
   */
  private bodyCreate(
    group: readonly PhysicsShatterSimPiece[],
    centre: THREE.Vector3,
    blast: PhysicsShatterSimBlastWorld,
    seed: number,
  ): RAPIER.RigidBody | null {
    const colliders = group.flatMap((piece) => this.partColliderDesc(piece, centre) ?? []);
    if (colliders.length === 0 || !group[0]) return null;
    const body = this.world.createRigidBody(this.bodyDesc(group[0], centre, blast, seed));
    for (const collider of colliders) {
      const created = this.world.createCollider(collider, body);
      physicsShatterBodyLaunchFriction(this.rapier, created, this.material.friction, true);
    }
    return body;
  }

  /**
   * Describes one part's collider: its hull inset towards its own centroid and
   * placed relative to the body's position.
   *
   * @param piece Piece.
   * @param centre World position of the body.
   * @returns Collider description, or null when the hull is unusable.
   */
  private partColliderDesc(piece: PhysicsShatterSimPiece, centre: THREE.Vector3): RAPIER.ColliderDesc | null {
    const part = this.frame.pointToWorld(piece.centroid);
    const local = physicsShatterBodyLocalHull(this.frame.pointsToWorld(piece.hull), part);
    const desc = physicsShatterBodyColliderDesc(this.rapier, local, this.material);
    return desc ? desc.setTranslation(part.x - centre.x, part.y - centre.y, part.z - centre.z) : null;
  }

  /**
   * Describes a moving piece's body: its blast velocity scaled by the
   * material's blast multiplier, its spin by the tumble multiplier, and the
   * material's damping.
   *
   * @param piece Piece.
   * @param centre World centre of the body.
   * @param blast World blast.
   * @param seed Spin seed.
   * @returns Body description.
   */
  private bodyDesc(
    piece: PhysicsShatterSimPiece,
    centre: THREE.Vector3,
    blast: PhysicsShatterSimBlastWorld,
    seed: number,
  ): RAPIER.RigidBodyDesc {
    const launch = physicsShatterBlastVelocity(centre, blast);
    const spin = physicsShatterBlastSpin(seed, piece.index, launch.length()).multiplyScalar(this.material.tumble);
    const velocity = launch.multiplyScalar(this.material.blast);
    return this.rapier.RigidBodyDesc.dynamic()
      .setTranslation(centre.x, centre.y, centre.z)
      .setCcdEnabled(true)
      .setLinvel(velocity.x, velocity.y, velocity.z)
      .setAngvel(spin)
      .setLinearDamping(this.material.linearDamping)
      .setAngularDamping(this.material.angularDamping);
  }

  /**
   * Returns a piece's current transform in the frame, taken from its body's
   * pose; a part of a compound body follows its offset from the body.
   *
   * @param entry Piece and its body.
   * @returns Transform.
   */
  private transformOf({ piece, body, offset }: PhysicsShatterSimBody): PhysicsShatterPieceTransform {
    if (!body) return physicsShatterTransformIdentity();
    const translation = body.translation();
    const rotation = body.rotation();
    const turn = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
    const position = new THREE.Vector3(translation.x, translation.y, translation.z);
    if (offset) position.add(offset.clone().applyQuaternion(turn));
    return this.frame.transformFromWorldPose(position, turn, piece.centroid);
  }
}
