import * as THREE from 'three';
import { toyFrameCheck, toyFrameDecode, toyFrameEncode, toyFrameRelay } from '@/collaboration/shared/toy_frame.js';
import { toyTennisBallDecode, toyTennisBallEncode } from '@/collaboration/toys/toy_tennis_ball.js';
import type { PlayerBallLink, PlayerBallLinkListener, PlayerBallSnapshot } from '@/player/ball/player_ball_link.js';
import { PlayerBallSystem } from '@/player/ball/player_ball_system.js';
import { PlayerCollisionWorld } from '@/player/collision/player_collision_world.js';

export const PLAYER_BALL_FAKE_FRAME_MS = 16;

/** One client of the fake room. */
export interface PlayerBallFakeClient {
  readonly user: number;
  readonly system: PlayerBallSystem;
  readonly helpers: THREE.Group;
  readonly world: THREE.Group;
  readonly collision: PlayerCollisionWorld;
  readonly sounds: number[];
  /** Feet of the client's player (others see the same value as presence). */
  readonly feet: THREE.Vector3;
  /** Velocity of the client's player. */
  readonly velocity: THREE.Vector3;
  /** Collision level syncs the client asked for. */
  syncs: number;
  playing: boolean;
  listener: PlayerBallLinkListener | null;
}

/** One snapshot as it went over the fake relay. */
export interface PlayerBallFakeFrame {
  readonly time: number;
  readonly sender: number;
  readonly full: boolean;
  readonly entries: number;
  /** Held toy the frame announces, if any. */
  readonly held?: string | undefined;
  /** Bytes the thrower sent. */
  readonly upBytes: number;
  /** Bytes the relay sent to one member. */
  readonly downBytes: number;
}

/** A relayed frame on its way to one client. */
interface PlayerBallFakeDelivery {
  readonly at: number;
  readonly to: number;
  readonly frame: Uint8Array;
}

/**
 * In-memory room: every client publishes its own balls; frames pass through the
 * shared codec like over the relay (the relay stamps the sender) and reach
 * every other client after the configured latency. Players stand one behind the
 * other at x = -1 unless a test moves them. A client's collision world is
 * active only while it plays, like in the editor.
 */
export class PlayerBallFakeRoom {
  readonly clients = new Map<number, PlayerBallFakeClient>();
  readonly frames: PlayerBallFakeFrame[] = [];
  latencyMs = 40;
  now = 0;
  private deliveries: PlayerBallFakeDelivery[] = [];

  /**
   * Adds a client with its own copy of a level.
   *
   * @param user User id.
   * @param level Builds the level root.
   * @returns Client.
   */
  add(user: number, level: () => THREE.Group = playerBallFakeLevel): PlayerBallFakeClient {
    const world = level();
    const collision = new PlayerCollisionWorld();
    collision.setWorldRoot(world);
    const helpers = new THREE.Group();
    const client: PlayerBallFakeClient = {
      ...{ user, helpers, world, collision, sounds: [], syncs: 0, playing: false, listener: null },
      feet: new THREE.Vector3(-1, 0, -1.5 * user),
      velocity: new THREE.Vector3(),
      system: undefined as never,
    };
    Object.assign(client, { system: this.systemOf(client) });
    this.countSyncs(client);
    this.clients.set(user, client);
    this.setPlaying(client, true);
    client.system.setLink(this.link(client));
    return client;
  }

  /**
   * Adds a client the way a member joins a running room: every other client
   * hears about it, and nothing is replayed to it.
   *
   * @param user User id.
   * @returns Client.
   */
  join(user: number): PlayerBallFakeClient {
    const client = this.add(user);
    this.clients.forEach((other) => other === client || other.listener?.memberJoined(user));
    return client;
  }

  /**
   * Enters or leaves play mode on a client, activating or releasing its
   * collision like the play session does.
   *
   * @param client Client.
   * @param playing Whether it plays.
   */
  setPlaying(client: PlayerBallFakeClient, playing: boolean): void {
    client.playing = playing;
    if (playing) client.collision.activate();
    else client.collision.release();
  }

  /**
   * Advances every client by a number of frames, delivering due frames first.
   *
   * @param frames Frames of 16 ms.
   */
  run(frames: number): void {
    for (let frame = 0; frame < frames; frame++) {
      this.now += PLAYER_BALL_FAKE_FRAME_MS;
      this.deliver();
      this.clients.forEach((client) => client.system.update(this.now));
    }
  }

  /** Hands every due frame to its recipient's link. */
  private deliver(): void {
    const due = this.deliveries.filter((delivery) => delivery.at <= this.now);
    this.deliveries = this.deliveries.filter((delivery) => delivery.at > this.now);
    for (const delivery of due) {
      const decoded = toyFrameDecode(delivery.frame);
      const balls = decoded ? toyTennisBallDecode(decoded) : null;
      if (decoded && balls) this.clients.get(delivery.to)?.listener?.snapshot(decoded.sender, balls);
    }
  }

  /**
   * Counts the level syncs of a client.
   *
   * @param client Client.
   */
  private countSyncs(client: PlayerBallFakeClient): void {
    const sync = client.collision.syncLevelWorld.bind(client.collision);
    client.collision.syncLevelWorld = () => {
      client.syncs++;
      return sync();
    };
  }

  /**
   * Builds the ball system of a client.
   *
   * @param client Client.
   * @returns System driven by the room clock.
   */
  private systemOf(client: PlayerBallFakeClient): PlayerBallSystem {
    return new PlayerBallSystem({
      view: {
        helperAdd: (object) => client.helpers.add(object),
        helperRemove: (object) => client.helpers.remove(object),
      },
      collisionWorld: client.collision,
      isPlaying: () => client.playing,
      localPlayer: () => ({ feet: client.feet, velocity: client.velocity }),
      now: () => this.now,
      schedule: () => undefined,
      sound: (_position, speed) => client.sounds.push(speed),
    });
  }

  /**
   * Builds the link of one client.
   *
   * @param client Client.
   * @returns Link.
   */
  private link(client: PlayerBallFakeClient): PlayerBallLink {
    return {
      self: () => client.user,
      players: () =>
        [...this.clients.values()]
          .filter((other) => other !== client && other.playing)
          .map((other) => ({ member: other.user, feet: other.feet.clone(), velocity: other.velocity.clone() })),
      colorOf: (member) => 0x100000 * member,
      publish: (snapshot) => this.publish(client.user, snapshot),
      listen: (listener) => (client.listener = listener),
    };
  }

  /**
   * Relays a thrower's snapshot through the codec to every other client and
   * logs it.
   *
   * @param sender Thrower.
   * @param snapshot Its balls.
   * @returns True (the fake link never drops).
   */
  private publish(sender: number, snapshot: PlayerBallSnapshot): boolean {
    const frame = toyFrameEncode(toyTennisBallEncode(snapshot));
    if (toyFrameCheck(frame) === false) throw new Error('the relay would close this connection');
    const relayed = toyFrameRelay(frame, sender);
    this.frames.push({
      ...{ time: this.now, sender, full: snapshot.full, entries: snapshot.balls.length, held: snapshot.held },
      ...{ upBytes: frame.byteLength, downBytes: relayed.byteLength },
    });
    for (const to of this.clients.keys())
      if (to !== sender) this.deliveries.push({ at: this.now + this.latencyMs, to, frame: relayed });
    return true;
  }
}

/**
 * Builds a level with a floor and a far wall.
 *
 * @returns World root.
 */
export function playerBallFakeLevel(): THREE.Group {
  const world = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(80, 1, 80));
  floor.position.set(0, -0.5, 0);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 6, 40));
  wall.position.set(9, 3, 0);
  world.add(floor, wall);
  world.updateMatrixWorld(true);
  return world;
}

/**
 * Returns the shown ball positions of a client.
 *
 * @param client Client.
 * @returns Positions keyed by ball key.
 */
export function playerBallFakeShown(client: PlayerBallFakeClient): Map<string, THREE.Vector3> {
  return new Map([...client.system.getMeshes()].map(([key, mesh]) => [key, mesh.position.clone()]));
}
