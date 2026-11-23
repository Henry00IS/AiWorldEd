import * as THREE from 'three';
import type { PlayerCollisionWorld } from '@/player/collision/player_collision_world.js';
import type { PlayerLookState } from '@/player/look/player_look_state.js';
import type { PlayerBodyPull } from '@/player/movement/player_body_state.js';
import type { PlayerHelperLayer } from '@/player/player_helper_layer.js';
import { PLAYER_MIN_WALKABLE_NORMAL_Y } from '@/player/player_constants.js';
import { PlayerGrappleBeam } from './player_grapple_beam.js';
import {
  PLAYER_GRAPPLE_COOLDOWN_SECONDS,
  PLAYER_GRAPPLE_FIZZLE_METERS,
  PLAYER_GRAPPLE_FOV_KICK_DEGREES,
  PLAYER_GRAPPLE_FOV_RATE_PER_SECOND,
  PLAYER_GRAPPLE_FOV_SPEED_START,
  PLAYER_GRAPPLE_HAND_HEIGHT_METERS,
  PLAYER_GRAPPLE_HAND_OFFSET,
  PLAYER_GRAPPLE_HAND_SIDE_METERS,
  PLAYER_GRAPPLE_LEDGE_INSET_METERS,
  PLAYER_GRAPPLE_LEDGE_REACH_METERS,
  PLAYER_GRAPPLE_MAX_SPEED_METERS_PER_SECOND,
  PLAYER_GRAPPLE_RANGE_METERS,
} from './player_grapple_constants.js';
import {
  playerGrappleOffset,
  playerGrapplePull,
  playerGrappleTarget,
  playerGrappleYank,
} from './player_grapple_physics.js';
import { PlayerGrappleSound } from './player_grapple_sound.js';

const DOWN = new THREE.Vector3(0, -1, 0);

/**
 * Writes where the beam leaves a character's right hand.
 *
 * @param feet Feet position.
 * @param yaw Body facing yaw.
 * @param target Destination.
 * @returns The target vector.
 */
export function playerGrappleHand(feet: THREE.Vector3, yaw: number, target: THREE.Vector3): THREE.Vector3 {
  return target.set(
    feet.x - Math.cos(yaw) * PLAYER_GRAPPLE_HAND_SIDE_METERS,
    feet.y + PLAYER_GRAPPLE_HAND_HEIGHT_METERS,
    feet.z + Math.sin(yaw) * PLAYER_GRAPPLE_HAND_SIDE_METERS,
  );
}

/**
 * The grapple beam toy: pressing fires a beam along the look; where it hooks
 * the level, holding pulls the body toward it with physics forces (through the
 * body's pull), so it swings in arcs and flies on with its momentum after
 * letting go. A miss only flickers. Draws the beam, widens the view at speed
 * and plays its sounds.
 */
export class PlayerGrapple implements PlayerBodyPull {
  private readonly beam: PlayerGrappleBeam;
  private readonly sound: PlayerGrappleSound;
  private anchor: THREE.Vector3 | null = null;
  private readonly target = new THREE.Vector3();
  private yankOwed = false;
  private releasedAt = Number.NEGATIVE_INFINITY;
  private fovKick = 0;
  private baseFov: number | null = null;
  private readonly aim = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();
  private readonly hand = new THREE.Vector3();

  /**
   * Creates an idle grapple.
   *
   * @param world Level collision the beam hooks on.
   * @param look Look state (the aim).
   * @param layer Helper layer for the beam.
   * @param announce Tells the others where the beam hooks (null: let go).
   * @param sound Sounds (replaceable in tests).
   */
  constructor(
    private readonly world: PlayerCollisionWorld,
    private readonly look: PlayerLookState,
    layer: PlayerHelperLayer,
    private readonly announce: (anchor: THREE.Vector3 | null) => void,
    sound?: PlayerGrappleSound,
  ) {
    this.beam = new PlayerGrappleBeam(layer);
    this.sound = sound ?? new PlayerGrappleSound();
  }

  /**
   * Fires the beam from the eye along the look (the button went down).
   *
   * @param eye Eye position.
   * @param now Current time in seconds.
   * @returns True when it hooked.
   */
  press(eye: THREE.Vector3, now: number): boolean {
    if (now - this.releasedAt < PLAYER_GRAPPLE_COOLDOWN_SECONDS) return false;
    const forward = this.look.copyLookForwardTo(this.aim);
    const hit = this.world.raycastNearest(eye, forward, PLAYER_GRAPPLE_RANGE_METERS);
    if (!hit) {
      this.beam.fizzle(
        eye.clone().addScaledVector(forward, 0.5),
        eye.clone().addScaledVector(forward, PLAYER_GRAPPLE_FIZZLE_METERS),
      );
      this.sound.miss();
      return false;
    }
    this.anchor = hit.point.clone();
    this.ledgeTarget(hit.point, hit.normal) ?? playerGrappleTarget(hit.point, hit.normal, this.target);
    this.yankOwed = true;
    this.beam.hook(this.anchor);
    this.sound.hook();
    this.announce(this.anchor);
    return true;
  }

  /**
   * Lets go (the button came up); the body keeps its velocity.
   *
   * @param now Current time in seconds.
   */
  release(now: number): void {
    if (!this.anchor) return;
    this.anchor = null;
    this.releasedAt = now;
    this.beam.hide();
    this.sound.release();
    this.announce(null);
  }

  /**
   * Returns the anchor the beam is hooked on.
   *
   * @returns Anchor, or null.
   */
  getAnchor(): THREE.Vector3 | null {
    return this.anchor;
  }

  /** @inheritdoc */
  pull(feet: THREE.Vector3, velocity: THREE.Vector3, grounded: boolean, deltaSeconds: number): boolean {
    if (!this.anchor) return false;
    playerGrappleOffset(feet, this.target, this.offset);
    if (this.yankOwed) playerGrappleYank(velocity, this.offset, grounded);
    this.yankOwed = false;
    playerGrapplePull(velocity, this.offset, this.look.copyLookForwardTo(this.aim), deltaSeconds);
    return true;
  }

  /**
   * Draws the beam from the hand (in front of the first-person camera, or the
   * character's hand), follows the speed with the hum and widens the view at
   * speed. Call after the camera was placed.
   *
   * @param camera Play camera.
   * @param feet Feet position.
   * @param yaw Body facing yaw.
   * @param speed Body speed in meters per second.
   * @param firstPerson Whether the view is first person.
   * @param deltaSeconds Frame time.
   */
  update(
    camera: THREE.PerspectiveCamera,
    feet: THREE.Vector3,
    yaw: number,
    speed: number,
    firstPerson: boolean,
    deltaSeconds: number,
  ): void {
    if (firstPerson) this.hand.set(...PLAYER_GRAPPLE_HAND_OFFSET).applyMatrix4(camera.matrixWorld);
    else playerGrappleHand(feet, yaw, this.hand);
    if (this.anchor) {
      this.beam.show(this.hand, this.anchor);
      this.sound.pulling(speed);
    }
    this.beam.update(deltaSeconds);
    this.fovUpdate(camera, speed, deltaSeconds);
  }

  /**
   * Lets go silently, hides the beam and gives the camera its view back (play
   * mode ended).
   *
   * @param camera Play camera, if any.
   */
  reset(camera: THREE.PerspectiveCamera | null): void {
    if (this.anchor) this.announce(null);
    this.anchor = null;
    this.sound.stop();
    this.beam.hide();
    this.beam.update(Number.POSITIVE_INFINITY);
    if (camera && this.baseFov !== null && this.fovKick > 0) {
      camera.fov = this.baseFov;
      camera.updateProjectionMatrix();
    }
    this.fovKick = 0;
    this.baseFov = null;
  }

  /** Frees the beam. */
  dispose(): void {
    this.beam.dispose();
  }

  /**
   * Aims the pull up onto the ledge when the beam hooks a wall just below its
   * top (a ray drops onto the top from a little behind the face), so hooking
   * near the rim of a pit or the top of a tall wall lands the body on it.
   *
   * @param point Hit point.
   * @param normal Hit normal.
   * @returns The pull target, or null when no ledge is in reach.
   */
  private ledgeTarget(point: THREE.Vector3, normal: THREE.Vector3): THREE.Vector3 | null {
    if (Math.abs(normal.y) >= PLAYER_MIN_WALKABLE_NORMAL_Y) return null;
    const inward = this.offset.set(-normal.x, 0, -normal.z).normalize();
    const above = this.hand.copy(point).addScaledVector(inward, PLAYER_GRAPPLE_LEDGE_INSET_METERS);
    above.y += PLAYER_GRAPPLE_LEDGE_REACH_METERS;
    const top = this.world.raycastNearest(above, DOWN, PLAYER_GRAPPLE_LEDGE_REACH_METERS);
    if (!top || top.distance < 0.05 || top.normal.y < PLAYER_MIN_WALKABLE_NORMAL_Y) return null;
    return playerGrappleTarget(top.point, top.normal, this.target);
  }

  /**
   * Eases the view wider the faster the body flies (above a run).
   *
   * @param camera Play camera.
   * @param speed Body speed.
   * @param deltaSeconds Frame time.
   */
  private fovUpdate(camera: THREE.PerspectiveCamera, speed: number, deltaSeconds: number): void {
    const start = PLAYER_GRAPPLE_FOV_SPEED_START;
    const amount = THREE.MathUtils.clamp((speed - start) / (PLAYER_GRAPPLE_MAX_SPEED_METERS_PER_SECOND - start), 0, 1);
    const wanted = PLAYER_GRAPPLE_FOV_KICK_DEGREES * amount;
    if (this.fovKick === 0) {
      if (wanted === 0) return;
      this.baseFov = camera.fov;
    }
    const kick =
      this.fovKick + (wanted - this.fovKick) * (1 - Math.exp(-PLAYER_GRAPPLE_FOV_RATE_PER_SECOND * deltaSeconds));
    this.fovKick = kick < 0.01 ? 0 : kick;
    camera.fov = (this.baseFov ?? camera.fov) + this.fovKick;
    camera.updateProjectionMatrix();
    if (this.fovKick === 0) this.baseFov = null;
  }
}
