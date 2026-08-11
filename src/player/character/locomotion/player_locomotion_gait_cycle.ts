import * as THREE from 'three';
import type { PlayerCharacterControlRig } from '@/player/character/player_character_control_rig.js';
import { PLAYER_LOCOMOTION_GAIT, playerLocomotionIsBallisticAir } from './player_locomotion_gait_config.js';
import { PlayerLocomotionGaitFootWriter } from './player_locomotion_gait_foot_writer.js';
import { playerLocomotionEaseSmooth, playerLocomotionSwingLift } from './player_locomotion_math.js';
import { PlayerLocomotionWallFootFrame } from './player_locomotion_wall_foot_frame.js';

/** Inputs that drive the gait cycle. */
export interface PlayerLocomotionGaitInput {
  planarSpeed: number;
  /** Vertical velocity meters per second (positive up). */
  verticalVelocity: number;
  wantsRun: boolean;
  isGrounded: boolean;
  /** Exclusive wall idle stance under the body. */
  isWallIdle: boolean;
  /** Exclusive wall side-step open/close cycle. */
  isSideStep: boolean;
  /** +1 = character-left travel, -1 = character-right travel. */
  sideStepSign: number;
  /** Signed lateral speed along character left (m/s). */
  sideStepLateralSpeed: number;
  deltaSeconds: number;
  characterRoot: THREE.Object3D | null;
  /**
   * World outward wall normal while wall-hugging. Used to reseed feet under the
   * body from wall angle rather than stale walk plants.
   */
  wallNormalWorld: THREE.Vector3 | null;
}

/**
 * Walk cycle plus wall side-step driven only by distance traveled.
 *
 * Side-step open: trail locked in world, lead swings one step length along
 * travel. Side-step close: lead locked where it landed, trail swings in.
 * Progress is body displacement along the travel axis divided by step length,
 * never a wall-clock duration.
 */
export class PlayerLocomotionGaitCycle {
  private cyclePhaseRadians: number;
  private sideStepPhase: 'open' | 'close';
  private sideStepMeters: number;
  private distanceAlongCycleMeters: number;
  private hasRootTravelSample: boolean;
  private wasSideStepping: boolean;
  private lastSideStepSign: number;
  private readonly lastRootWorldPosition: THREE.Vector3;
  private readonly rootDisplacementWorld: THREE.Vector3;
  private readonly leftPlantWorld: THREE.Vector3;
  private readonly rightPlantWorld: THREE.Vector3;
  private readonly swingStartWorld: THREE.Vector3;
  private readonly swingEndWorld: THREE.Vector3;
  private readonly characterLeftWorld: THREE.Vector3;
  private readonly travelAxisWorld: THREE.Vector3;
  private readonly scratchLocal: THREE.Vector3;
  private readonly scratchWorld: THREE.Vector3;
  private readonly rootWorldPosition: THREE.Vector3;
  private readonly rootWorldQuaternion: THREE.Quaternion;
  private readonly rootWorldQuaternionInverse: THREE.Quaternion;
  private readonly wallFootFrame: PlayerLocomotionWallFootFrame;
  private needsControlSnap: boolean;
  private readonly footWriter: PlayerLocomotionGaitFootWriter;
  /** True while the previous frame wrote grounded feet (not the jump pose). */
  private wasWritingGroundFeet: boolean;
  /** True only after plants have been reseeded under the live body. */
  private sideStepPlantsValid: boolean;
  private readonly lastWallNormalWorld: THREE.Vector3;
  private readonly scratchWallNormal: THREE.Vector3;

  /** Creates a gait cycle at phase zero. */
  constructor() {
    this.cyclePhaseRadians = 0;
    this.sideStepPhase = 'open';
    this.sideStepMeters = PLAYER_LOCOMOTION_GAIT.sideStepComfortLengthMeters;
    this.distanceAlongCycleMeters = 0;
    this.hasRootTravelSample = false;
    this.wasSideStepping = false;
    this.lastSideStepSign = 0;
    this.needsControlSnap = false;
    this.footWriter = new PlayerLocomotionGaitFootWriter();
    this.wasWritingGroundFeet = true;
    this.sideStepPlantsValid = false;
    this.lastWallNormalWorld = new THREE.Vector3();
    this.scratchWallNormal = new THREE.Vector3();
    this.lastRootWorldPosition = new THREE.Vector3();
    this.rootDisplacementWorld = new THREE.Vector3();
    this.leftPlantWorld = new THREE.Vector3();
    this.rightPlantWorld = new THREE.Vector3();
    this.swingStartWorld = new THREE.Vector3();
    this.swingEndWorld = new THREE.Vector3();
    this.characterLeftWorld = new THREE.Vector3();
    this.travelAxisWorld = new THREE.Vector3();
    this.scratchLocal = new THREE.Vector3();
    this.scratchWorld = new THREE.Vector3();
    this.rootWorldPosition = new THREE.Vector3();
    this.rootWorldQuaternion = new THREE.Quaternion();
    this.rootWorldQuaternionInverse = new THREE.Quaternion();
    this.wallFootFrame = new PlayerLocomotionWallFootFrame();
  }

  /**
   * Returns the live cycle phase used by torso and arm coupling.
   *
   * @returns Phase radians.
   */
  getCyclePhaseRadians(): number {
    return this.cyclePhaseRadians;
  }

  /**
   * Consumes whether control follow must snap to the desired feet this frame.
   *
   * Set when wall-hug plants reseed under the body so stale walk plants cannot
   * keep dragging feet half a meter away from the hips.
   *
   * @returns True once after a plant reseed until consumed.
   */
  consumeNeedsControlSnap(): boolean {
    const needsSnap = this.needsControlSnap;
    this.needsControlSnap = false;
    return needsSnap;
  }

  /**
   * Consumes pending left-foot plant events for footstep audio.
   *
   * @returns True when the left foot planted this frame.
   */
  consumeFootstepLeftPending(): boolean {
    return this.footWriter.consumeFootstepLeftPending();
  }

  /**
   * Consumes pending right-foot plant events for footstep audio.
   *
   * @returns True when the right foot planted this frame.
   */
  consumeFootstepRightPending(): boolean {
    return this.footWriter.consumeFootstepRightPending();
  }

  /**
   * Resets phase, side-step, plant locks, and footstep bookkeeping for a new
   * play session.
   */
  reset(): void {
    this.cyclePhaseRadians = 0;
    this.needsControlSnap = true;
    this.footWriter.reset();
    this.wasWritingGroundFeet = true;
    this.clearSideStepStateFully();
  }

  /**
   * Advances phase and writes desired foot and knee control targets.
   *
   * Only desired targets are written here; control follow interpolates them.
   *
   * @param controls Control rig.
   * @param input Live gait drivers.
   */
  update(controls: PlayerCharacterControlRig, input: PlayerLocomotionGaitInput): void {
    const useJumpPose = playerLocomotionIsBallisticAir(input.isGrounded, input.verticalVelocity, input.planarSpeed);
    this.handleJumpPoseTransition(useJumpPose);
    this.resyncSideStepLead(input);
    this.advancePhase(input, useJumpPose);
    this.writeDesiredFeet(controls, input, useJumpPose);
  }

  /**
   * Snaps out of wall plants when entering a real jump or fall pose.
   *
   * @param useJumpPose True when this frame uses jump/fall feet.
   */
  private handleJumpPoseTransition(useJumpPose: boolean): void {
    if (this.wasWritingGroundFeet && useJumpPose) {
      this.clearSideStepStateFully();
      this.needsControlSnap = true;
    }
    this.wasWritingGroundFeet = !useJumpPose;
  }

  /**
   * Writes desired free gait, jump, wall idle, or side-step feet.
   *
   * Exclusive modes only; control follow interpolates between states.
   *
   * @param controls Control rig.
   * @param input Live gait drivers.
   * @param useJumpPose True when jump/fall feet should be written.
   */
  private writeDesiredFeet(
    controls: PlayerCharacterControlRig,
    input: PlayerLocomotionGaitInput,
    useJumpPose: boolean,
  ): void {
    if (useJumpPose) {
      this.footWriter.clearAirborneTracking();
      this.clearSideStepStateFully();
      this.footWriter.writeJumpFeet(controls);
      return;
    }
    if (input.isWallIdle) {
      this.writeWallIdleFeet(controls, input);
      return;
    }
    if (input.isSideStep && this.sideStepPlantsValid) {
      this.writeSideStepFeet(controls, input);
      return;
    }
    this.writeFreeGroundFeet(controls, input);
  }

  /**
   * Plants both feet under the contact center on the wall stance frame.
   *
   * @param controls Control rig.
   * @param input Live gait drivers.
   */
  private writeWallIdleFeet(controls: PlayerCharacterControlRig, input: PlayerLocomotionGaitInput): void {
    this.wasSideStepping = false;
    this.reseedPlantsUnderBody(input, this.lastSideStepSign !== 0 ? this.lastSideStepSign : 1);
    this.writeWorldFoot(controls, true, this.leftPlantWorld);
    this.writeWorldFoot(controls, false, this.rightPlantWorld);
  }

  /**
   * Returns whether side-step plants are live and should world-lock feet.
   *
   * @returns True while wall plants are valid for this frame's desired pose.
   */
  getSideStepPlantsValid(): boolean {
    return this.sideStepPlantsValid;
  }

  /**
   * Writes idle or walk feet without side-step plants.
   *
   * @param controls Control rig.
   * @param input Live gait drivers.
   */
  private writeFreeGroundFeet(controls: PlayerCharacterControlRig, input: PlayerLocomotionGaitInput): void {
    if (input.planarSpeed < PLAYER_LOCOMOTION_GAIT.settleSpeedMetersPerSecond) {
      this.footWriter.writeIdleFeet(controls);
      return;
    }
    this.footWriter.writeWalkFeet(controls, input.wantsRun, this.cyclePhaseRadians);
  }

  /**
   * Starts or reseeds side-step when entering or reversing travel.
   *
   * Plant targets reseed under the body on enter, flip, or corner. Control
   * follow always interpolates; this path never snap-teleports feet.
   *
   * @param input Live gait drivers.
   */
  private resyncSideStepLead(input: PlayerLocomotionGaitInput): void {
    if (!input.isGrounded) {
      this.clearSideStepStateFully();
      return;
    }
    if (input.isWallIdle) {
      this.wasSideStepping = false;
      return;
    }
    if (!input.isSideStep) {
      this.wasSideStepping = false;
      this.clearSideStepStateFully();
      return;
    }
    const sign = this.resolveAuthoritativeStepSign(input);
    const entered = !this.wasSideStepping;
    const flipped = this.lastSideStepSign !== 0 && this.lastSideStepSign !== sign;
    const cornered = this.wallNormalTurnedCorner(input);
    if (entered || flipped || cornered) {
      this.beginSideStepOpen(input, sign, true);
    }
    this.wasSideStepping = true;
    this.lastSideStepSign = sign;
    this.rememberWallNormal(input);
  }

  /**
   * Clears side-step travel bookkeeping and invalidates world plant locks so
   * free gait or jump cannot inherit a stale global foot target.
   */
  private clearSideStepStateFully(): void {
    this.wasSideStepping = false;
    this.lastSideStepSign = 0;
    this.hasRootTravelSample = false;
    this.sideStepPhase = 'open';
    this.distanceAlongCycleMeters = 0;
    this.sideStepPlantsValid = false;
    this.lastWallNormalWorld.set(0, 0, 0);
  }

  /**
   * Returns whether the wall normal turned enough to need a plant reseed.
   *
   * @param input Live gait drivers.
   * @returns True when the wall plane changed at a corner.
   */
  private wallNormalTurnedCorner(input: PlayerLocomotionGaitInput): boolean {
    if (!this.writePlanarWallNormal(input.wallNormalWorld, this.scratchWallNormal)) {
      return false;
    }
    if (this.lastWallNormalWorld.lengthSq() < 1e-8) {
      return false;
    }
    const angle = this.lastWallNormalWorld.angleTo(this.scratchWallNormal);
    return angle >= PLAYER_LOCOMOTION_GAIT.sideStepWallNormalReseedRadians;
  }

  /**
   * Stores the live planar wall normal for corner detection.
   *
   * @param input Live gait drivers.
   */
  private rememberWallNormal(input: PlayerLocomotionGaitInput): void {
    if (!this.writePlanarWallNormal(input.wallNormalWorld, this.lastWallNormalWorld)) {
      this.lastWallNormalWorld.set(0, 0, 0);
    }
  }

  /**
   * Writes a planar unit wall normal into the destination.
   *
   * @param source Wall normal, or null.
   * @param destination Destination vector.
   * @returns True when destination is usable.
   */
  private writePlanarWallNormal(source: THREE.Vector3 | null, destination: THREE.Vector3): boolean {
    if (!source || source.lengthSq() < 1e-8) {
      return false;
    }
    destination.copy(source);
    destination.y = 0;
    if (destination.lengthSq() < 1e-8) {
      return false;
    }
    destination.normalize();
    return true;
  }

  /**
   * Picks the step sign, preferring live lateral velocity over a stale command.
   *
   * @param input Live gait drivers.
   * @returns +1 left, -1 right.
   */
  private resolveAuthoritativeStepSign(input: PlayerLocomotionGaitInput): number {
    const contrary = PLAYER_LOCOMOTION_GAIT.sideStepContraryVelocityMetersPerSecond;
    if (Math.abs(input.sideStepLateralSpeed) >= contrary) {
      return input.sideStepLateralSpeed >= 0 ? 1 : -1;
    }
    return input.sideStepSign >= 0 ? 1 : -1;
  }

  /**
   * Begins an open phase, optionally reseeding plants under the live body.
   *
   * @param input Live gait drivers.
   * @param sign Travel sign (+1 left, -1 right).
   * @param reseedUnderBody True when entering wall strafe or flipping
   *   direction.
   */
  private beginSideStepOpen(input: PlayerLocomotionGaitInput, sign: number, reseedUnderBody: boolean): void {
    this.sideStepPhase = 'open';
    this.distanceAlongCycleMeters = 0;
    this.captureRoot(input.characterRoot);
    this.writeWallTravelBasis(input, sign);
    this.configureSideStepLength(input);
    if (reseedUnderBody || !this.sideStepPlantsValid) {
      this.reseedPlantsUnderBody(input, sign);
    }
    this.writeOpenSwingTargets(sign);
    this.sampleRootPositionAsBaseline();
  }

  /**
   * Sets travel and plant lateral axes from the wall normal, not body facing.
   *
   * @param input Live gait drivers.
   * @param sign Travel sign along wall-left.
   */
  private writeWallTravelBasis(input: PlayerLocomotionGaitInput, sign: number): void {
    if (this.wallFootFrame.rebuild(input.characterRoot, input.wallNormalWorld)) {
      this.characterLeftWorld.copy(this.wallFootFrame.getWallLeftWorld());
    } else {
      this.writeCharacterLeftAxis();
    }
    this.writeTravelAxis(sign);
  }

  /**
   * Begins close: lock lead at its landing, swing trail in beside it.
   *
   * @param sign Travel sign.
   */
  private beginSideStepClose(sign: number): void {
    this.sideStepPhase = 'close';
    const span = PLAYER_LOCOMOTION_GAIT.stanceWidthMeters * 2;
    if (sign >= 0) {
      this.leftPlantWorld.copy(this.swingEndWorld);
      this.footWriter.queueFootstep(true);
      this.swingStartWorld.copy(this.rightPlantWorld);
      this.swingEndWorld.copy(this.leftPlantWorld).addScaledVector(this.characterLeftWorld, -span);
      return;
    }
    this.rightPlantWorld.copy(this.swingEndWorld);
    this.footWriter.queueFootstep(false);
    this.swingStartWorld.copy(this.leftPlantWorld);
    this.swingEndWorld.copy(this.rightPlantWorld).addScaledVector(this.characterLeftWorld, span);
  }

  /**
   * Chooses step length from speed so stride scales, still matched 1:1 to
   * travel.
   *
   * @param input Live gait drivers.
   */
  private configureSideStepLength(input: PlayerLocomotionGaitInput): void {
    const lateral = Math.abs(input.sideStepLateralSpeed);
    const speed = Math.max(lateral, PLAYER_LOCOMOTION_GAIT.settleSpeedMetersPerSecond);
    const comfort = PLAYER_LOCOMOTION_GAIT.sideStepComfortLengthMeters;
    const minStep = PLAYER_LOCOMOTION_GAIT.sideStepMinLengthMeters;
    const maxStep = PLAYER_LOCOMOTION_GAIT.sideStepMaxLengthMeters;
    const speedScale = PLAYER_LOCOMOTION_GAIT.sideStepLengthSpeedScale;
    const raw = comfort + speed * speedScale;
    this.sideStepMeters = THREE.MathUtils.clamp(raw, minStep, maxStep);
  }

  /**
   * Plants both feet from the wall contact frame under the pelvis.
   *
   * @param input Live gait drivers with optional wall normal.
   * @param sign Travel sign for the open swing axis after reseed.
   */
  private reseedPlantsUnderBody(input: PlayerLocomotionGaitInput, sign: number): void {
    this.captureRoot(input.characterRoot);
    this.writeCharacterLeftAxis();
    if (!this.wallFootFrame.rebuild(input.characterRoot, input.wallNormalWorld)) {
      this.reseedPlantsFromCharacterLeft(sign);
      return;
    }
    this.wallFootFrame.writeStancePlantWorld(true, this.leftPlantWorld);
    this.wallFootFrame.writeStancePlantWorld(false, this.rightPlantWorld);
    this.characterLeftWorld.copy(this.wallFootFrame.getWallLeftWorld());
    this.writeTravelAxis(sign);
    this.sideStepPlantsValid = true;
  }

  /**
   * Fallback reseed when no wall normal is available.
   *
   * @param sign Travel sign.
   */
  private reseedPlantsFromCharacterLeft(sign: number): void {
    const width = PLAYER_LOCOMOTION_GAIT.stanceWidthMeters;
    const groundY = this.rootWorldPosition.y + PLAYER_LOCOMOTION_GAIT.footGroundYMeters;
    this.leftPlantWorld.copy(this.rootWorldPosition).addScaledVector(this.characterLeftWorld, width);
    this.leftPlantWorld.y = groundY;
    this.rightPlantWorld.copy(this.rootWorldPosition).addScaledVector(this.characterLeftWorld, -width);
    this.rightPlantWorld.y = groundY;
    this.writeTravelAxis(sign);
    this.sideStepPlantsValid = true;
  }

  /**
   * Writes lead swing start and end from the current plants.
   *
   * @param sign Travel sign.
   */
  private writeOpenSwingTargets(sign: number): void {
    if (sign >= 0) {
      this.swingStartWorld.copy(this.leftPlantWorld);
      this.swingEndWorld.copy(this.leftPlantWorld).addScaledVector(this.characterLeftWorld, this.sideStepMeters);
      return;
    }
    this.swingStartWorld.copy(this.rightPlantWorld);
    this.swingEndWorld.copy(this.rightPlantWorld).addScaledVector(this.characterLeftWorld, -this.sideStepMeters);
  }

  /** Records the current root world position as the displacement baseline. */
  private sampleRootPositionAsBaseline(): void {
    this.lastRootWorldPosition.copy(this.rootWorldPosition);
    this.hasRootTravelSample = true;
  }

  /**
   * Writes the unit travel axis in the character-left sign direction.
   *
   * @param sign Travel sign.
   */
  private writeTravelAxis(sign: number): void {
    this.travelAxisWorld.copy(this.characterLeftWorld).multiplyScalar(sign >= 0 ? 1 : -1);
  }

  /**
   * Advances walk phase or side-step open/close by distance traveled.
   *
   * Keeps the cycle moving through brief floor gaps so walk does not stutter
   * when collision is grounded only some frames.
   *
   * @param input Live gait drivers.
   * @param useJumpPose True when jump/fall feet are active this frame.
   */
  private advancePhase(input: PlayerLocomotionGaitInput, useJumpPose: boolean): void {
    if (useJumpPose) {
      return;
    }
    if (input.isWallIdle) {
      this.cyclePhaseRadians += PLAYER_LOCOMOTION_GAIT.idleSwayRadiansPerSecond * input.deltaSeconds;
      return;
    }
    if (input.isSideStep) {
      this.advanceSideStepByDistance(input);
      return;
    }
    if (input.planarSpeed < PLAYER_LOCOMOTION_GAIT.settleSpeedMetersPerSecond) {
      this.cyclePhaseRadians += PLAYER_LOCOMOTION_GAIT.idleSwayRadiansPerSecond * input.deltaSeconds;
      return;
    }
    const cadence = input.wantsRun
      ? PLAYER_LOCOMOTION_GAIT.runCadenceRadiansPerMeter
      : PLAYER_LOCOMOTION_GAIT.walkCadenceRadiansPerMeter;
    this.cyclePhaseRadians += input.planarSpeed * cadence * input.deltaSeconds;
  }

  /**
   * Advances side-step open/close using body displacement along the wall only.
   *
   * @param input Live gait drivers.
   */
  private advanceSideStepByDistance(input: PlayerLocomotionGaitInput): void {
    this.captureRoot(input.characterRoot);
    const sign = this.resolveAuthoritativeStepSign(input);
    this.writeWallTravelBasis(input, sign);
    if (this.abortStepIfContraryMotion(input, sign)) {
      this.cyclePhaseRadians = 0;
      return;
    }
    const signedDelta = this.consumeSignedTravelMeters(input);
    if (this.settleSideStepIfStationary(input, sign, signedDelta)) {
      this.cyclePhaseRadians = 0;
      return;
    }
    const remaining = Math.max(0, signedDelta);
    this.consumeSideStepDistance(input, sign, remaining);
    this.cyclePhaseRadians = this.computeSideStepNormalizedProgress() * Math.PI * 2;
  }

  /**
   * Aborts and reseeds when the body is already traveling against the active
   * step.
   *
   * @param input Live gait drivers.
   * @param sign Active step sign.
   * @returns True when the step was aborted.
   */
  private abortStepIfContraryMotion(input: PlayerLocomotionGaitInput, sign: number): boolean {
    if (this.abortStepIfContraryVelocity(input, sign)) {
      return true;
    }
    return this.abortStepIfContraryTravel(input, sign);
  }

  /**
   * Aborts when lateral velocity clearly opposes the active step sign.
   *
   * @param input Live gait drivers.
   * @param sign Active step sign.
   * @returns True when aborted.
   */
  private abortStepIfContraryVelocity(input: PlayerLocomotionGaitInput, sign: number): boolean {
    const speed = input.sideStepLateralSpeed;
    const contrarySpeed = PLAYER_LOCOMOTION_GAIT.sideStepContraryVelocityMetersPerSecond;
    if (Math.abs(speed) < contrarySpeed || speed * sign >= 0) {
      return false;
    }
    const corrected = speed >= 0 ? 1 : -1;
    this.beginSideStepOpen(input, corrected, true);
    this.lastSideStepSign = corrected;
    return true;
  }

  /**
   * Aborts when root travel along the step axis is clearly backward.
   *
   * Travel axis is already step-aligned, so negative delta means reverse
   * motion.
   *
   * @param input Live gait drivers.
   * @param sign Active step sign.
   * @returns True when aborted.
   */
  private abortStepIfContraryTravel(input: PlayerLocomotionGaitInput, sign: number): boolean {
    const forwardDelta = this.peekSignedTravelMeters();
    const contraryTravel = PLAYER_LOCOMOTION_GAIT.sideStepContraryTravelMeters;
    if (forwardDelta >= -contraryTravel) {
      return false;
    }
    const corrected = -sign;
    this.beginSideStepOpen(input, corrected, true);
    this.lastSideStepSign = corrected;
    return true;
  }

  /**
   * Settles feet under the body only when truly stopped.
   *
   * Creep with non-zero lateral speed must keep advancing the cycle even when a
   * single frame reports almost no root travel.
   *
   * @param input Live gait drivers.
   * @param sign Active step sign.
   * @param signedDelta Root travel along the step axis this frame.
   * @returns True when settled without advancing the step.
   */
  private settleSideStepIfStationary(input: PlayerLocomotionGaitInput, sign: number, signedDelta: number): boolean {
    const stationary = PLAYER_LOCOMOTION_GAIT.sideStepStationaryTravelMeters;
    if (Math.abs(signedDelta) > stationary) {
      return false;
    }
    if (Math.abs(input.sideStepLateralSpeed) > 1e-3) {
      return false;
    }
    this.beginSideStepOpen(input, sign, true);
    this.lastSideStepSign = sign;
    return true;
  }

  /**
   * Reads signed travel from root displacement without consuming the baseline.
   *
   * @returns Signed meters along the travel axis this frame.
   */
  private peekSignedTravelMeters(): number {
    if (!this.hasRootTravelSample) {
      return 0;
    }
    this.rootDisplacementWorld.subVectors(this.rootWorldPosition, this.lastRootWorldPosition);
    return this.rootDisplacementWorld.dot(this.travelAxisWorld);
  }

  /**
   * Reads signed travel from root displacement and advances the baseline.
   *
   * Uses per-frame displacement (not absolute projections) so yaw changes on
   * angled wall contact cannot invent multi-meter false steps.
   *
   * @param input Live gait drivers.
   * @returns Signed meters along the travel axis this frame.
   */
  private consumeSignedTravelMeters(input: PlayerLocomotionGaitInput): number {
    if (!this.hasRootTravelSample) {
      this.sampleRootPositionAsBaseline();
      return 0;
    }
    this.rootDisplacementWorld.subVectors(this.rootWorldPosition, this.lastRootWorldPosition);
    this.lastRootWorldPosition.copy(this.rootWorldPosition);
    const raw = this.rootDisplacementWorld.dot(this.travelAxisWorld);
    const travel = this.resolveCreepTravelMeters(input, raw);
    return this.clampTravelToPhysicalBudget(input, travel);
  }

  /**
   * Falls back to speed * dt only for true creep (slow lateral motion).
   *
   * Faster motion still requires real root travel so stuck or yaw-only frames
   * cannot invent steps.
   *
   * @param input Live gait drivers.
   * @param rawMeters Measured root travel along the step axis.
   * @returns Travel meters to feed the step cycle.
   */
  private resolveCreepTravelMeters(input: PlayerLocomotionGaitInput, rawMeters: number): number {
    if (Math.abs(rawMeters) > PLAYER_LOCOMOTION_GAIT.sideStepStationaryTravelMeters) {
      return rawMeters;
    }
    const alongStep = input.sideStepLateralSpeed * (this.lastSideStepSign >= 0 ? 1 : -1);
    if (alongStep <= 1e-3 || alongStep > 0.4) {
      return rawMeters;
    }
    return alongStep * Math.max(0, input.deltaSeconds);
  }

  /**
   * Clamps measured travel so a single frame cannot invent more than body speed
   * allows.
   *
   * @param input Live gait drivers.
   * @param rawMeters Raw displacement along the travel axis.
   * @returns Clamped meters.
   */
  private clampTravelToPhysicalBudget(input: PlayerLocomotionGaitInput, rawMeters: number): number {
    const speed = Math.max(Math.abs(input.sideStepLateralSpeed), input.planarSpeed);
    const budget =
      speed * Math.max(0, input.deltaSeconds) * PLAYER_LOCOMOTION_GAIT.sideStepTravelBudgetScale +
      PLAYER_LOCOMOTION_GAIT.sideStepTravelBudgetSlackMeters;
    if (budget <= 1e-6) {
      return THREE.MathUtils.clamp(
        rawMeters,
        -PLAYER_LOCOMOTION_GAIT.sideStepTravelBudgetSlackMeters,
        PLAYER_LOCOMOTION_GAIT.sideStepTravelBudgetSlackMeters,
      );
    }
    return THREE.MathUtils.clamp(rawMeters, -budget, budget);
  }

  /**
   * Consumes travel distance through open and close events without skipping
   * either.
   *
   * @param input Live gait drivers.
   * @param sign Travel sign.
   * @param remainingMeters Unprocessed forward travel.
   */
  private consumeSideStepDistance(input: PlayerLocomotionGaitInput, sign: number, remainingMeters: number): void {
    let remaining = remainingMeters;
    while (remaining > 1e-6) {
      const openEnd = this.openEndDistanceMeters();
      if (this.sideStepPhase === 'open') {
        remaining = this.consumeOpenDistance(sign, remaining, openEnd);
        continue;
      }
      remaining = this.consumeCloseDistance(input, sign, remaining);
    }
  }

  /**
   * Advances open-phase distance and switches to close when the lead lands.
   *
   * @param sign Travel sign.
   * @param remaining Unprocessed meters.
   * @param openEnd Distance at which open ends.
   * @returns Leftover meters after this event.
   */
  private consumeOpenDistance(sign: number, remaining: number, openEnd: number): number {
    const need = openEnd - this.distanceAlongCycleMeters;
    if (remaining < need) {
      this.distanceAlongCycleMeters += remaining;
      return 0;
    }
    this.distanceAlongCycleMeters = openEnd;
    this.beginSideStepClose(sign);
    return remaining - Math.max(0, need);
  }

  /**
   * Advances close-phase distance and starts the next open when the trail
   * joins.
   *
   * @param input Live gait drivers.
   * @param sign Travel sign.
   * @param remaining Unprocessed meters.
   * @returns Leftover meters after this event.
   */
  private consumeCloseDistance(input: PlayerLocomotionGaitInput, sign: number, remaining: number): number {
    const need = this.sideStepMeters - this.distanceAlongCycleMeters;
    if (remaining < need) {
      this.distanceAlongCycleMeters += remaining;
      return 0;
    }
    const leftover = remaining - Math.max(0, need);
    this.finishClosePlants(sign);
    this.beginSideStepOpen(input, sign, false);
    return leftover;
  }

  /**
   * Locks the trail plant at the close landing before the next open begins.
   *
   * @param sign Travel sign.
   */
  private finishClosePlants(sign: number): void {
    if (sign >= 0) {
      this.rightPlantWorld.copy(this.swingEndWorld);
      this.footWriter.queueFootstep(false);
      return;
    }
    this.leftPlantWorld.copy(this.swingEndWorld);
    this.footWriter.queueFootstep(true);
  }

  /**
   * Distance along the cycle where the lead foot lands and close begins.
   *
   * @returns Open-end meters within the current step.
   */
  private openEndDistanceMeters(): number {
    return this.sideStepMeters * PLAYER_LOCOMOTION_GAIT.sideStepOpenFraction;
  }

  /**
   * Normalized progress through the current open/close step in [0, 1].
   *
   * @returns Progress fraction.
   */
  private computeSideStepNormalizedProgress(): number {
    const step = Math.max(1e-4, this.sideStepMeters);
    return THREE.MathUtils.clamp(this.distanceAlongCycleMeters / step, 0, 1);
  }

  /**
   * Writes world-planted side-step feet for the current open/close phase.
   *
   * @param controls Control rig.
   * @param input Live gait drivers.
   */
  private writeSideStepFeet(controls: PlayerCharacterControlRig, input: PlayerLocomotionGaitInput): void {
    this.captureRoot(input.characterRoot);
    this.syncSideStepPlantHeightsToRoot();
    const sign = this.lastSideStepSign !== 0 ? this.lastSideStepSign : this.resolveAuthoritativeStepSign(input);
    if (this.sideStepPhase === 'open') {
      this.writeSideStepOpen(controls, sign, this.openPhaseT());
      return;
    }
    this.writeSideStepClose(controls, sign, this.closePhaseT());
  }

  /**
   * Keeps world-locked plants at the current root ground height so side-step
   * feet follow slopes and stairs instead of freezing absolute Y.
   */
  private syncSideStepPlantHeightsToRoot(): void {
    const groundY = this.rootWorldPosition.y + PLAYER_LOCOMOTION_GAIT.footGroundYMeters;
    this.leftPlantWorld.y = groundY;
    this.rightPlantWorld.y = groundY;
    this.swingStartWorld.y = groundY;
    this.swingEndWorld.y = groundY;
  }

  /**
   * Open-phase blend weight from distance within the open segment.
   *
   * @returns Progress in [0, 1].
   */
  private openPhaseT(): number {
    const openEnd = Math.max(1e-4, this.openEndDistanceMeters());
    return THREE.MathUtils.clamp(this.distanceAlongCycleMeters / openEnd, 0, 1);
  }

  /**
   * Close-phase blend weight from distance within the close segment.
   *
   * @returns Progress in [0, 1].
   */
  private closePhaseT(): number {
    const openEnd = this.openEndDistanceMeters();
    const span = Math.max(1e-4, this.sideStepMeters - openEnd);
    return THREE.MathUtils.clamp((this.distanceAlongCycleMeters - openEnd) / span, 0, 1);
  }

  /**
   * Lead swings out; trail stays world-locked.
   *
   * @param controls Control rig.
   * @param sign Travel sign.
   * @param t Open progress in [0, 1].
   */
  private writeSideStepOpen(controls: PlayerCharacterControlRig, sign: number, t: number): void {
    const eased = playerLocomotionEaseSmooth(t);
    const lift = playerLocomotionSwingLift(t) * PLAYER_LOCOMOTION_GAIT.sideStepHeightMeters;
    if (sign >= 0) {
      this.writeWorldFoot(controls, false, this.rightPlantWorld);
      this.writeWorldSwing(controls, true, eased, lift);
      return;
    }
    this.writeWorldFoot(controls, true, this.leftPlantWorld);
    this.writeWorldSwing(controls, false, eased, lift);
  }

  /**
   * Trail swings in; lead stays world-locked on its landing.
   *
   * @param controls Control rig.
   * @param sign Travel sign.
   * @param t Close progress in [0, 1].
   */
  private writeSideStepClose(controls: PlayerCharacterControlRig, sign: number, t: number): void {
    const eased = playerLocomotionEaseSmooth(t);
    const lift = playerLocomotionSwingLift(t) * PLAYER_LOCOMOTION_GAIT.sideStepHeightMeters;
    if (sign >= 0) {
      this.writeWorldFoot(controls, true, this.leftPlantWorld);
      this.writeWorldSwing(controls, false, eased, lift);
      return;
    }
    this.writeWorldFoot(controls, false, this.rightPlantWorld);
    this.writeWorldSwing(controls, true, eased, lift);
  }

  /**
   * Lerps the swinging foot between fixed world start and end.
   *
   * @param controls Control rig.
   * @param isLeft Left foot.
   * @param eased Blend weight.
   * @param liftMeters Vertical arc.
   */
  private writeWorldSwing(
    controls: PlayerCharacterControlRig,
    isLeft: boolean,
    eased: number,
    liftMeters: number,
  ): void {
    this.scratchWorld.lerpVectors(this.swingStartWorld, this.swingEndWorld, eased);
    this.scratchWorld.y = this.rootWorldPosition.y + PLAYER_LOCOMOTION_GAIT.footGroundYMeters + liftMeters;
    this.writeWorldFoot(controls, isLeft, this.scratchWorld);
  }

  /**
   * Writes one foot from a pure world position.
   *
   * @param controls Control rig.
   * @param isLeft Left foot.
   * @param worldPoint World foot position.
   */
  private writeWorldFoot(controls: PlayerCharacterControlRig, isLeft: boolean, worldPoint: THREE.Vector3): void {
    this.worldToLocal(worldPoint, this.scratchLocal);
    this.footWriter.writeFoot(controls, isLeft, this.scratchLocal.x, this.scratchLocal.y, this.scratchLocal.z);
    this.footWriter.writeKneePole(controls, isLeft, this.scratchLocal.x, this.scratchLocal.z, true);
  }

  /**
   * Captures character root world pose.
   *
   * @param characterRoot Character root, or null.
   */
  private captureRoot(characterRoot: THREE.Object3D | null): void {
    if (!characterRoot) {
      this.rootWorldPosition.set(0, 0, 0);
      this.rootWorldQuaternion.identity();
      this.rootWorldQuaternionInverse.identity();
      return;
    }
    characterRoot.updateMatrixWorld(true);
    characterRoot.getWorldPosition(this.rootWorldPosition);
    characterRoot.getWorldQuaternion(this.rootWorldQuaternion);
    this.rootWorldQuaternionInverse.copy(this.rootWorldQuaternion).invert();
  }

  /** Writes the character-left world axis from the current root rotation. */
  private writeCharacterLeftAxis(): void {
    this.characterLeftWorld.set(1, 0, 0).applyQuaternion(this.rootWorldQuaternion);
    this.characterLeftWorld.y = 0;
    if (this.characterLeftWorld.lengthSq() < 1e-8) {
      this.characterLeftWorld.set(1, 0, 0);
      return;
    }
    this.characterLeftWorld.normalize();
  }

  /**
   * Converts a world point to character-local space.
   *
   * @param worldPoint World point.
   * @param localPoint Destination.
   */
  private worldToLocal(worldPoint: THREE.Vector3, localPoint: THREE.Vector3): void {
    localPoint.copy(worldPoint).sub(this.rootWorldPosition);
    localPoint.applyQuaternion(this.rootWorldQuaternionInverse);
  }
}
