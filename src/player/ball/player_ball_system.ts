import * as THREE from 'three';
import { NotificationGlobal } from '@/audio/notification/notification_global.js';
import {
  PHYSICS_BALL_CONTACT_SKIN_METERS,
  PHYSICS_BALL_THROW_LIFT_METERS_PER_SECOND,
  PHYSICS_BALL_THROW_SPEED_METERS_PER_SECOND,
  PHYSICS_PLANE_THROW_SPEED_METERS_PER_SECOND,
  PHYSICS_TOY_SHAPES,
  type PhysicsToyKind,
} from '@/physics/ball/physics_ball_constants.js';
import { PhysicsPlane } from '@/physics/ball/physics_plane.js';
import type { PhysicsBallMover } from '@/physics/ball/physics_ball_contacts.js';
import type { PhysicsBallImpact } from '@/physics/ball/physics_ball_world.js';
import type { PlayerCollisionWorld } from '@/player/collision/player_collision_world.js';
import {
  PLAYER_KEYBOARD_PLACE_FORWARD_METERS,
  PLAYER_KEYBOARD_STAND_RADIUS_METERS,
  PLAYER_KEYBOARD_TOY_ID,
} from '@/player/keyboard/player_keyboard_constants.js';
import type { PlayerKeyboardSynthFactory } from '@/player/keyboard/player_keyboard_instance.js';
import type { PlayerKeyboardPose } from '@/player/keyboard/player_keyboard_pose.js';
import { PlayerKeyboardSystem } from '@/player/keyboard/player_keyboard_system.js';
import { PlayerGrappleRemote, playerGrappleEntry } from '@/player/grapple/player_grapple_remote.js';
import { PlayerBallAuthority, playerBallThrowStart } from './player_ball_authority.js';
import {
  PLAYER_BALL_OFFLINE_COLOR,
  PLAYER_BALL_PLACE_FORWARD_METERS,
  PLAYER_BALL_PLACE_REACH_METERS,
  PLAYER_BALL_THROW_FORWARD_METERS,
} from './player_ball_constants.js';
import type { PlayerBallLink, PlayerBallLinkListener, PlayerBallSnapshot } from './player_ball_link.js';
import { playerBallMover, playerBallMovers, playerBallProxy, type PlayerBallMotion } from './player_ball_players.js';
import { playerBallPlaneCarry } from './player_ball_carry.js';
import { PlayerBallPublisher } from './player_ball_publisher.js';
import { PlayerBallReceiver, type PlayerBallShown } from './player_ball_receiver.js';
import { PlayerBallView, type PlayerBallViewHost, type PlayerBallViewItem } from './player_ball_view.js';

/** Plays a bounce at a world position. */
export type PlayerBallSoundSink = (position: THREE.Vector3, speed: number) => void;

/**
 * Dependencies of the ball system (clock, scheduler and sound replaceable in
 * tests).
 */
export interface PlayerBallSystemOptions {
  view: PlayerBallViewHost;
  collisionWorld: PlayerCollisionWorld;
  isPlaying: () => boolean;
  /** Feet and velocity of the local player while it plays. */
  localPlayer?: () => PlayerBallMotion | null;
  now?: () => number;
  schedule?: (callback: () => void) => void;
  sound?: PlayerBallSoundSink;
  /** Voices of the keyboards (replaceable in tests). */
  keyboardSynth?: PlayerKeyboardSynthFactory;
}

/**
 * Plays a bounce through the editor audio (room reverb and 3D position).
 *
 * @param position Bounce position.
 * @param speed Impact speed in meters per second.
 */
const playerBallSoundDefault: PlayerBallSoundSink = (position, speed) =>
  NotificationGlobal.onBallBounce(position.x, position.y, position.z, speed);

/**
 * Runs a callback on the next animation frame (a timer outside browsers).
 *
 * @param callback Frame callback.
 */
function playerBallScheduleDefault(callback: () => void): void {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(callback);
  else setTimeout(callback, 16);
}

/** Key prefix of this client's own balls in the view. */
const PLAYER_BALL_OWN_PREFIX = 'own:';
const DOWN = new THREE.Vector3(0, -1, 0);
const scratchEuler = new THREE.Euler(0, 0, 0, 'YXZ');

/**
 * Thrown tennis balls. The thrower owns its balls: only this client simulates
 * them, only while it plays, against level collision, every player capsule and
 * the other members' drawn balls (one-way proxies), and publishes their
 * snapshots. The other members' balls are only drawn from their snapshots, with
 * no physics at all, so a client that does not play never builds a level world.
 * Balls disappear when their thrower leaves play mode or the room.
 */
export class PlayerBallSystem implements PlayerBallLinkListener {
  private readonly options: Required<Omit<PlayerBallSystemOptions, 'keyboardSynth'>>;
  private readonly authority: PlayerBallAuthority;
  private readonly receiver: PlayerBallReceiver;
  private readonly publisher: PlayerBallPublisher;
  private readonly view: PlayerBallView;
  private link: PlayerBallLink | null;
  private readonly keyboard: PlayerKeyboardSystem;
  private readonly grapples: PlayerGrappleRemote;
  private grapple: THREE.Vector3 | null = null;
  private held: PhysicsToyKind | null;
  private lastFrame: number | null;
  private scheduled: boolean;
  private disposed: boolean;

  /**
   * Creates an idle ball system.
   *
   * @param options Dependencies.
   */
  constructor(options: PlayerBallSystemOptions) {
    this.options = {
      localPlayer: () => null,
      now: () => performance.now(),
      schedule: playerBallScheduleDefault,
      sound: playerBallSoundDefault,
      ...options,
    };
    this.authority = new PlayerBallAuthority();
    this.receiver = new PlayerBallReceiver();
    this.publisher = new PlayerBallPublisher();
    this.view = new PlayerBallView(options.view);
    this.keyboard = this.keyboardCreate(options);
    this.grapples = new PlayerGrappleRemote(options.view);
    this.link = null;
    this.held = 'tennis';
    this.lastFrame = null;
    this.scheduled = false;
    this.disposed = false;
  }

  /**
   * Builds the keyboards, putting the others' character hands on theirs through
   * the room link.
   *
   * @param options Dependencies.
   * @returns Keyboard system.
   */
  private keyboardCreate(options: PlayerBallSystemOptions): PlayerKeyboardSystem {
    return new PlayerKeyboardSystem({
      view: options.view,
      hands: (member, hands) => this.link?.handsSet?.(member, hands),
      ...(options.keyboardSynth ? { synth: options.keyboardSynth } : {}),
    });
  }

  /**
   * Connects to a room, or back to offline play; every ball is removed.
   *
   * @param link Room link, or null.
   */
  setLink(link: PlayerBallLink | null): void {
    this.link?.listen(null);
    this.link = link;
    this.clear();
    link?.listen(this);
  }

  /**
   * Picks the toy thrown next; the others see it in the player's hand.
   *
   * @param kind Toy kind, or null for empty hands.
   */
  setHeld(kind: PhysicsToyKind | null): void {
    if (kind === this.held) return;
    this.held = kind;
    this.publisher.noteHeld();
    this.wake();
  }

  /**
   * Returns the toy thrown next.
   *
   * @returns Toy kind, or null for empty hands.
   */
  getHeld(): PhysicsToyKind | null {
    return this.held;
  }

  /** Tells the others again which toy is held (play mode was entered). */
  announceHeld(): void {
    this.publisher.noteHeld();
    this.wake();
  }

  /**
   * Returns the color of this client's toys.
   *
   * @returns Hex color.
   */
  getOwnColor(): number {
    return this.colorOf(this.link?.self() ?? 0);
  }

  /**
   * Returns this member's room color, the one the others tint its character
   * with.
   *
   * @returns Hex color, or null outside a room.
   */
  getRoomColor(): number | null {
    return this.link ? this.colorOf(this.link.self()) : null;
  }

  /**
   * Throws the held toy from the eye along the look direction (play mode only):
   * balls arc, paper planes glide, and a soccer ball is put down on the ground
   * in front of the player, resting until someone bumps into it. Toys carry the
   * player's own velocity on top (a put-down ball only the horizontal).
   *
   * @param eye Eye position.
   * @param forward Unit look direction.
   * @param kind Toy kind (the held one unless given; nothing with empty hands).
   * @param from Start position (the first-person hand); a sphere sweep from the
   *   eye keeps it out of walls. In front of the eye when absent.
   * @param power Throw speed factor (a charged throw goes faster).
   * @param carry Player velocity added to the throw.
   * @returns True when a toy was thrown or placed.
   */
  throwFrom(
    eye: THREE.Vector3,
    forward: THREE.Vector3,
    kind: PhysicsToyKind | null = this.held,
    from?: THREE.Vector3,
    power = 1,
    carry = new THREE.Vector3(),
  ): boolean {
    if (this.options.isPlaying() === false || kind === null) return false;
    const carried = playerBallMover({ feet: eye, velocity: carry }).velocity;
    if (kind === 'soccer') return this.place(eye, forward, carried.setY(0));
    const plane = kind === 'plane';
    const start = playerBallThrowStart(
      eye,
      forward,
      PLAYER_BALL_THROW_FORWARD_METERS,
      power * (plane ? PHYSICS_PLANE_THROW_SPEED_METERS_PER_SECOND : PHYSICS_BALL_THROW_SPEED_METERS_PER_SECOND),
      power * (plane ? 0 : PHYSICS_BALL_THROW_LIFT_METERS_PER_SECOND),
    );
    const velocity = start.velocity.add(plane ? playerBallPlaneCarry(carried, forward) : carried);
    this.authority.spawn(this.throwClear(eye, from ?? start.position, kind), velocity, kind);
    this.wake();
    return true;
  }

  /**
   * Moves a throw start back towards the eye until the toy fits there: a sphere
   * of its radius swept from the eye stops short of the first wall in the way.
   *
   * @param eye Eye position (inside the player, never in a wall).
   * @param start Wanted start position.
   * @param kind Toy kind.
   * @returns Start position.
   */
  private throwClear(eye: THREE.Vector3, start: THREE.Vector3, kind: PhysicsToyKind): THREE.Vector3 {
    const offset = start.clone().sub(eye);
    const length = offset.length();
    if (length < 1e-6) return start.clone();
    const direction = offset.divideScalar(length);
    const levelWorld = this.options.collisionWorld.syncLevelWorld();
    const hit = levelWorld?.castSphere(eye, direction, PHYSICS_TOY_SHAPES[kind].radius, length, false);
    const reach = hit ? Math.max(0, hit.distance - PHYSICS_BALL_CONTACT_SKIN_METERS) : length;
    return eye.clone().addScaledVector(direction, reach);
  }

  /**
   * Puts a soccer ball down on the ground in front of the player (no further
   * than a wall in the way), at rest unless the player moves, when it rolls on
   * ahead; with no ground below it falls.
   *
   * @param eye Eye position.
   * @param forward Unit look direction.
   * @param velocity Start velocity (zero when standing still).
   * @returns True when placed.
   */
  private place(eye: THREE.Vector3, forward: THREE.Vector3, velocity: THREE.Vector3): boolean {
    const radius = PHYSICS_TOY_SHAPES.soccer.radius;
    const { position, grounded } = this.groundAhead(eye, forward, radius, PLAYER_BALL_PLACE_FORWARD_METERS);
    this.authority.spawn(position, velocity, 'soccer', grounded && velocity.lengthSq() === 0);
    this.wake();
    return true;
  }

  /**
   * Finds where something put down in front of the player lands: a sphere swept
   * forward at knee height stops at the first wall, then dropped onto the
   * ground.
   *
   * @param eye Eye position.
   * @param forward Unit look direction.
   * @param radius Sphere radius.
   * @param forwardMeters Wanted distance ahead.
   * @returns Sphere center and whether ground was found below it.
   */
  private groundAhead(
    eye: THREE.Vector3,
    forward: THREE.Vector3,
    radius: number,
    forwardMeters: number,
  ): { position: THREE.Vector3; grounded: boolean } {
    const levelWorld = this.options.collisionWorld.syncLevelWorld();
    const feet = this.options.localPlayer()?.feet ?? eye;
    const across = new THREE.Vector3(forward.x, 0, forward.z);
    if (across.lengthSq() < 1e-8) across.set(0, 0, -1);
    across.normalize();
    const start = new THREE.Vector3(eye.x, feet.y + PLAYER_BALL_PLACE_REACH_METERS, eye.z);
    const wall = levelWorld?.castSphere(start, across, radius, forwardMeters, false);
    const reach = wall ? Math.max(0, wall.distance - PHYSICS_BALL_CONTACT_SKIN_METERS) : forwardMeters;
    const position = start.addScaledVector(across, reach);
    const ground = levelWorld?.castSphere(position, DOWN, radius, 2 * PLAYER_BALL_PLACE_REACH_METERS, false);
    if (ground) position.y -= Math.max(0, ground.distance - PHYSICS_BALL_CONTACT_SKIN_METERS);
    return { position, grounded: ground !== null && ground !== undefined };
  }

  /**
   * Puts the own keyboard on its stand on the ground in front of the player,
   * facing the player (play mode only). The highest toy id stays free for it.
   *
   * @param eye Eye position.
   * @param yaw Look yaw (the keyboard is played looking this way).
   * @returns Placement, or null when not playing.
   */
  placeKeyboard(eye: THREE.Vector3, yaw: number): PlayerKeyboardPose | null {
    if (this.options.isPlaying() === false) return null;
    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const radius = PLAYER_KEYBOARD_STAND_RADIUS_METERS;
    const { position } = this.groundAhead(eye, forward, radius, PLAYER_KEYBOARD_PLACE_FORWARD_METERS);
    position.y -= radius;
    const feet = (this.options.localPlayer()?.feet ?? eye).clone();
    const pose = { position, feet, yaw };
    this.authority.reserveTop(1);
    this.keyboard.place(pose, this.getOwnColor(), this.options.now());
    this.publisher.noteHeld();
    this.wake();
    return pose;
  }

  /** Puts the own keyboard away: the others' copies fade out and disappear. */
  putAwayKeyboard(): void {
    if (!this.keyboard.getLocal()) return;
    this.keyboard.putAway();
    this.authority.reserveTop(0);
    this.publisher.noteHeld();
    this.wake();
  }

  /**
   * Shows the others where the own grapple beam hooks, or that it let go.
   *
   * @param anchor Anchor, or null.
   */
  setGrapple(anchor: THREE.Vector3 | null): void {
    this.grapple = anchor?.clone() ?? null;
    this.publisher.noteHeld();
    this.wake();
  }

  /**
   * Returns the current time of the toy clock.
   *
   * @returns Time in milliseconds.
   */
  now(): number {
    return this.options.now();
  }

  /**
   * Plays or releases a key of the own keyboard.
   *
   * @param pitch MIDI pitch.
   * @param down Pressed or released.
   * @param now Time of the key change in milliseconds (one sample shares it).
   */
  keyboardKey(pitch: number, down: boolean, now: number = this.options.now()): void {
    this.keyboard.key(pitch, down, now);
    this.wake();
  }

  /**
   * Shifts the own keyboard an octave up or down.
   *
   * @param step +1 or -1.
   * @returns True when the octave changed.
   */
  keyboardOctaveStep(step: number): boolean {
    const changed = this.keyboard.octaveStep(step, this.options.now());
    this.wake();
    return changed;
  }

  /**
   * Eases the own keyboard's vibrato in or out (held Shift).
   *
   * @param on New state.
   * @param now Time of the change in milliseconds.
   */
  keyboardVibrato(on: boolean, now: number = this.options.now()): void {
    this.keyboard.vibrato(on, now);
    this.wake();
  }

  /**
   * Switches the own keyboard's instrument.
   *
   * @param step +1 or -1.
   * @returns New slot, or null without a keyboard.
   */
  keyboardInstrumentStep(step: number): number | null {
    const slot = this.keyboard.instrumentStep(step, this.options.now());
    this.wake();
    return slot;
  }

  /**
   * Returns the keyboards (own and the other members').
   *
   * @returns Keyboard system.
   */
  getKeyboards(): PlayerKeyboardSystem {
    return this.keyboard;
  }

  /**
   * Takes another member's snapshot of its own balls.
   *
   * @param member Thrower.
   * @param snapshot Its balls.
   */
  snapshot(member: number, snapshot: PlayerBallSnapshot): void {
    this.receiver.snapshot(member, snapshot, this.options.now());
    this.keyboard.incoming(member, snapshot, this.options.now(), this.colorOf(member));
    this.grapples.incoming(member, snapshot);
    this.wake();
  }

  /**
   * Sends all own balls in one full snapshot at the next allowed slot when a
   * new member joins, the only way it learns about resting balls.
   */
  memberJoined(): void {
    if (this.authority.getBodies().length === 0 && !this.options.isPlaying()) return;
    this.publisher.requestFull();
    this.wake();
  }

  /**
   * Removes a leaving member's balls.
   *
   * @param member Member id.
   */
  memberLeft(member: number): void {
    this.receiver.keepMembers((other) => other !== member);
    this.keyboard.keepMembers((other) => other !== member);
    this.grapples.keepMembers((other) => other !== member);
    this.wake();
  }

  /**
   * Advances one frame: simulates and publishes the own balls, draws the
   * others' balls, updates the meshes and plays bounces.
   *
   * @param now Current time in milliseconds.
   * @returns True while there is still something to animate or send.
   */
  update(now: number = this.options.now()): boolean {
    const seconds = this.lastFrame === null ? 0 : (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    const players = this.link?.players() ?? [];
    this.receiver.keepMembers((member) => players.some((player) => player.member === member));
    this.keyboard.keepMembers((member) => players.some((player) => player.member === member));
    this.grapples.keepMembers((member) => players.some((player) => player.member === member));
    if (this.options.isPlaying() === false) this.putAwayKeyboard();
    const keyboards = this.keyboard.update(now);
    const remote = this.receiver.frame(now);
    const impacts = [...this.simulate(players, remote.balls, seconds), ...remote.impacts];
    impacts.forEach((impact) => this.options.sound(impact.position, impact.speed));
    this.view.sync([...this.ownItems(), ...remote.balls.map((ball) => this.remoteItem(ball))]);
    const beams = this.grapples.update(players, seconds);
    const owing = this.publish(now);
    const balls = this.authority.getBodies().length > 0 || this.receiver.isSettled(now) === false;
    return owing || keyboards || balls || beams;
  }

  /**
   * Returns the shown ball meshes.
   *
   * @returns Meshes keyed by ball.
   */
  getMeshes(): ReadonlyMap<string, THREE.Mesh> {
    return this.view.getMeshes();
  }

  /**
   * Returns the own simulation.
   *
   * @returns Authority.
   */
  getAuthority(): PlayerBallAuthority {
    return this.authority;
  }

  /** Removes every ball. */
  clear(): void {
    this.authority.removeWhere(() => true);
    this.authority.takeChanges();
    this.receiver.clear();
    this.keyboard.clear();
    this.grapples.clear();
    this.authority.reserveTop(0);
    this.publisher.reset();
    this.view.sync([]);
    this.lastFrame = null;
  }

  /** Removes every ball and stops animating. */
  dispose(): void {
    this.setLink(null);
    this.view.dispose();
    this.disposed = true;
  }

  /**
   * Steps the own balls while playing; leaving play mode removes them. Only
   * here is the level world needed.
   *
   * @param players Other members in play mode.
   * @param remote Drawn balls of the other members.
   * @param seconds Elapsed time.
   * @returns Audible impacts of the own balls.
   */
  private simulate(
    players: readonly PlayerBallMotion[],
    remote: readonly PlayerBallShown[],
    seconds: number,
  ): PhysicsBallImpact[] {
    if (this.options.isPlaying() === false) {
      this.authority.removeWhere(() => true);
      return [];
    }
    const bodies = this.authority.getBodies();
    this.options.collisionWorld.setFocus(
      'balls',
      bodies.map((body) => body.ball.position),
    );
    if (bodies.length === 0) return [];
    const levelWorld = this.options.collisionWorld.syncLevelWorld();
    if (levelWorld === null) return [];
    return this.authority.advance(levelWorld, this.movers(players, remote), seconds);
  }

  /**
   * Builds what the own balls collide with besides the level: every player
   * capsule and the other members' balls as one-way proxies.
   *
   * @param players Other members in play mode.
   * @param remote Drawn balls of the other members.
   * @returns Movers.
   */
  private movers(players: readonly PlayerBallMotion[], remote: readonly PlayerBallShown[]): PhysicsBallMover[] {
    return [...playerBallMovers(players, this.options.localPlayer()), ...remote.map(playerBallProxy)];
  }

  /**
   * Describes the own balls for the view.
   *
   * @returns View items in this client's color.
   */
  private ownItems(): PlayerBallViewItem[] {
    const color = this.colorOf(this.link?.self() ?? 0);
    return this.authority.getBodies().map((body) => ({
      key: PLAYER_BALL_OWN_PREFIX + body.key,
      color,
      position: body.ball.position,
      kind: body.kind,
      quaternion:
        body.ball instanceof PhysicsPlane
          ? new THREE.Quaternion().setFromEuler(scratchEuler.set(body.ball.pitch, body.ball.yaw, body.ball.roll))
          : undefined,
    }));
  }

  /**
   * Describes another member's ball for the view.
   *
   * @param ball Drawn ball.
   * @returns View item in its thrower's color.
   */
  private remoteItem(ball: PlayerBallShown): PlayerBallViewItem {
    const { key, kind, position, quaternion } = ball;
    return { key, color: this.colorOf(ball.member), position, kind, quaternion };
  }

  /**
   * Sends a snapshot of the own balls when one is due.
   *
   * @param now Current time in milliseconds.
   * @returns True while the others have not seen the current state.
   */
  private publish(now: number): boolean {
    const link = this.link;
    if (link === null) {
      this.authority.takeChanges();
      return false;
    }
    const extraId = this.keyboardExtraId(now);
    this.publisher.note(this.authority.takeChanges());
    const snapshot = this.grappleFrame(
      this.keyboardFrame(this.publisher.next(this.authority, now, this.playingHeld()), now, extraId),
    );
    if (snapshot && link.publish(snapshot)) {
      this.publisher.mark(snapshot, this.authority.isAwake(), now);
      this.keyboard.sent();
    }
    return this.publisher.isOwing() || this.keyboard.isOwing(now);
  }

  /**
   * Returns the held toy to announce: the thrown one while playing.
   *
   * @returns Held kind, null for empty hands, undefined when not playing.
   */
  private playingHeld(): PhysicsToyKind | null | undefined {
    return this.options.isPlaying() ? this.held : undefined;
  }

  /**
   * Finds a toy id for the keyboard's continuation entry while its events
   * overflow one entry: a free ball id, or else the oldest toy's, removing that
   * toy as a new throw would.
   *
   * @param now Current time in milliseconds.
   * @returns Toy id, or null when one entry is enough.
   */
  private keyboardExtraId(now: number): number | null {
    if (!this.keyboard.isOverflowing(now)) return null;
    const bodies = this.authority.getBodies();
    const ids = Array.from({ length: PLAYER_KEYBOARD_TOY_ID - 1 }, (_, index) => index + 1);
    const free = ids.find((id) => bodies.every((body) => body.id !== id));
    if (free !== undefined) return free;
    const oldest = bodies[0];
    if (!oldest) return null;
    this.authority.removeWhere((body) => body === oldest);
    return oldest.id;
  }

  /**
   * Adds the own keyboard to the snapshot due now, or makes a snapshot of its
   * own when only keyboard events are owed and the rate allows one.
   *
   * @param snapshot Ball snapshot due now, or null.
   * @param now Current time in milliseconds.
   * @param extraId Toy id for a continuation entry, or null.
   * @returns Snapshot to send, or null.
   */
  private keyboardFrame(
    snapshot: PlayerBallSnapshot | null,
    now: number,
    extraId: number | null,
  ): PlayerBallSnapshot | null {
    const held = this.playingHeld();
    if (snapshot) return this.keyboard.outgoing(snapshot, now, extraId);
    if (held === undefined || !this.keyboard.isOwing(now) || !this.publisher.isRateReady(now)) return null;
    return this.keyboard.outgoing({ full: false, tick: this.authority.getTick(now), balls: [], held }, now, extraId);
  }

  /**
   * Adds the hooked own grapple beam to a snapshot, under a toy id no own toy
   * uses (the oldest toy makes way when all are out, as a new throw would).
   *
   * @param snapshot Snapshot due now, or null.
   * @returns Snapshot to send, or null.
   */
  private grappleFrame(snapshot: PlayerBallSnapshot | null): PlayerBallSnapshot | null {
    if (!snapshot || this.grapple === null) return snapshot;
    const taken = new Set([
      ...this.authority.getBodies().map((body) => body.id),
      ...(snapshot.keyboard ?? []).map((entry) => entry.id),
    ]);
    let id = [1, 2, 3, PLAYER_KEYBOARD_TOY_ID].find((candidate) => !taken.has(candidate));
    if (id === undefined) {
      const oldest = this.authority.getBodies()[0];
      if (!oldest) return snapshot;
      this.authority.removeWhere((body) => body === oldest);
      id = oldest.id;
    }
    return { ...snapshot, grapple: playerGrappleEntry(id, this.grapple) };
  }

  /**
   * Returns a member's ball color.
   *
   * @param member Member id.
   * @returns Hex color.
   */
  private colorOf(member: number): number {
    return this.link?.colorOf(member) ?? PLAYER_BALL_OFFLINE_COLOR;
  }

  /** Schedules animation frames until nothing is left to animate or send. */
  private wake(): void {
    if (this.scheduled || this.disposed) {
      return;
    }
    this.scheduled = true;
    this.options.schedule(() => {
      this.scheduled = false;
      if (this.disposed) {
        return;
      }
      if (this.update()) this.wake();
      else this.lastFrame = null;
    });
  }
}
