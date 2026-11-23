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
  playerGrappleClimb,
  playerGrappleOffset,
  playerGrapplePull,
  playerGrappleTarget,
  playerGrappleYank,
} from './player_grapple_physics.js';
import { PlayerGrappleSound } from './player_grapple_sound.js';

const DOWN = new THREE.Vector3(0, -1, 0);

/**
 * Writes about where a character's right hand is, for the beam while its rig is
 * not loaded yet.
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
 * The grapple beam toy: pressing fires a beam from the middle of the view;
 * where it hooks the level, holding pulls the body toward it with physics
 * forces (through the body's pull), so it swings in arcs and flies on with its
 * momentum after letting go. A miss only flickers. Draws the beam, widens the
 * view at speed and plays its sounds.
 */
export class PlayerGrapple implements PlayerBodyPull {
  private readonly beam: PlayerGrappleBeam;
  private readonly sound: PlayerGrappleSound;
  private anchor: THREE.Vector3 | null = null;
  private readonly target = new THREE.Vector3();
  private yankOwed = false;
  /**
   * Whether the hook is on a wall, ledge or floor (not a ceiling), so Space
   * climbs past it.
   */
  private climbable = false;
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
   * Fires the beam from the middle of the view (where the crosshair is) along
   * the camera's direction (the button went down).
   *
   * @param origin Camera position.
   * @param forward Unit camera direction.
   * @param now Current time in seconds.
   * @returns True when it hooked.
   */
  press(origin: THREE.Vector3, forward: THREE.Vector3, now: number): boolean {
    if (now - this.releasedAt < PLAYER_GRAPPLE_COOLDOWN_SECONDS) return false;
    const hit = this.world.raycastNearest(origin, forward, PLAYER_GRAPPLE_RANGE_METERS);
    if (!hit) {
      this.beam.fizzle(
        origin.clone().addScaledVector(forward, 0.5),
        origin.clone().addScaledVector(forward, PLAYER_GRAPPLE_FIZZLE_METERS),
      );
      this.sound.miss();
      return false;
    }
    this.anchor = hit.point.clone();
    this.ledgeTarget(hit.point, hit.normal) ?? playerGrappleTarget(hit.point, hit.normal, this.target);
    this.climbable = hit.normal.y > -PLAYER_MIN_WALKABLE_NORMAL_Y;
    this.yankOwed = true;
    this.beam.hook(this.anchor);
    this.sound.hook();
    this.announce(this.anchor);
    return true;
  }

  /**
   * Returns whether a shot from the middle of the view would hook (lights the
   * crosshair).
   *
   * @param origin Camera position.
   * @param forward Unit camera direction.
   * @returns True when something is in reach.
   */
  aims(origin: THREE.Vector3, forward: THREE.Vector3): boolean {
    return this.world.raycastNearest(origin, forward, PLAYER_GRAPPLE_RANGE_METERS) !== null;
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

  /**
   * Pulls toward the target; climbing (Space held) also lifts the body, and on
   * a wall or ledge the rope then lets it rise past the target (it still holds
   * it to the wall), so it can climb over the top. Under a ceiling the rope
   * holds as ever.
   *
   * @inheritdoc
   */
  pull(
    feet: THREE.Vector3,
    velocity: THREE.Vector3,
    grounded: boolean,
    climbing: boolean,
    deltaSeconds: number,
  ): boolean {
    if (!this.anchor) return false;
    playerGrappleOffset(feet, this.target, this.offset);
    if (this.yankOwed) playerGrappleYank(velocity, this.offset, grounded);
    this.yankOwed = false;
    if (climbing && this.climbable) this.offset.y = Math.max(0, this.offset.y);
    playerGrapplePull(velocity, this.offset, this.look.copyLookForwardTo(this.aim), deltaSeconds);
    if (climbing) velocity.y = playerGrappleClimb(velocity.y, deltaSeconds);
    return true;
  }

  /**
   * Draws the beam from the hand (in front of the first-person camera, or the
   * character's right hand), plays the sounds there, follows the speed with the
   * hum and widens the view at speed. Call after the camera and the character
   * were placed.
   *
   * @param camera Play camera.
   * @param hand Character's right hand in third person, or null in first
   *   person.
   * @param speed Body speed in meters per second.
   * @param deltaSeconds Frame time.
   */
  update(camera: THREE.PerspectiveCamera, hand: THREE.Vector3 | null, speed: number, deltaSeconds: number): void {
    if (hand) this.hand.copy(hand);
    else this.hand.set(...PLAYER_GRAPPLE_HAND_OFFSET).applyMatrix4(camera.matrixWorld);
    this.sound.place(this.hand);
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
