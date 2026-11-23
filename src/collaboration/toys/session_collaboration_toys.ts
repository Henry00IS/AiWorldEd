import type * as THREE from 'three';
import type { HostCollaborationEditor } from '@/collaboration/host/host_collaboration_editor.js';
import type { ReceiverCollaborationPresence } from '@/collaboration/presence/receiver_collaboration_presence.js';
import { toyFrameDecode, toyFrameEncode } from '@/collaboration/shared/toy_frame.js';
import type { SessionCollaborationTransport } from '@/collaboration/session/session_collaboration_types.js';
import type { MemberCollaborationRoster } from '@/collaboration/sync/member_collaboration_roster.js';
import type { PlayerCharacterHandTargets } from '@/player/character/player_character_hand_targets.js';
import { PLAYER_TOY_GRAPPLE, PLAYER_TOY_KEYBOARD } from '@/player/toy/player_toy_kind.js';
import type {
  PlayerBallLink,
  PlayerBallLinkListener,
  PlayerBallPlayer,
  PlayerBallSnapshot,
} from '@/player/ball/player_ball_link.js';
import { ToyRespawnFlags } from './toy_respawn_flags.js';
import { toyTennisBallDecode, toyTennisBallEncode } from './toy_tennis_ball.js';

/** Capability a relay announces when it relays toy frames. */
export const TOYS_COLLABORATION_CAPABILITY = 'toys';

/**
 * Toys of one room (thrown balls, paper planes and put-down soccer balls): the
 * room link the play-mode ball system uses. It also shows which toy each player
 * holds on its character. Every member publishes snapshots of its own balls;
 * the relay stamps the sender, so a received snapshot always belongs to its
 * sender. Snapshots are low priority: they go out only when no edit is waiting
 * and are dropped, never queued, otherwise. Relays without the `toys`
 * capability never see a toy frame and the ball system stays offline.
 */
export class ToysCollaborationSession implements PlayerBallLink {
  private readonly host: HostCollaborationEditor;
  private readonly transport: SessionCollaborationTransport;
  private readonly roster: MemberCollaborationRoster;
  private readonly presence: ReceiverCollaborationPresence;
  private listener: PlayerBallLinkListener | null;
  private readonly respawns: ToyRespawnFlags;
  private user: number;
  private running: boolean;

  /**
   * Creates an idle toys session.
   *
   * @param host Editor host.
   * @param transport Room transport.
   * @param roster Member roster (colors).
   * @param presence Presence receiver (players in play mode).
   */
  constructor(
    host: HostCollaborationEditor,
    transport: SessionCollaborationTransport,
    roster: MemberCollaborationRoster,
    presence: ReceiverCollaborationPresence,
  ) {
    this.host = host;
    this.transport = transport;
    this.roster = roster;
    this.presence = presence;
    this.listener = null;
    this.respawns = new ToyRespawnFlags();
    this.user = -1;
    this.running = false;
  }

  /**
   * Hands the link to the editor once the room is synced, when the relay
   * supports toy frames.
   *
   * @param self This client's relay user id.
   */
  start(self: number): void {
    this.user = self;
    if (this.running || !this.transport.caps?.has(TOYS_COLLABORATION_CAPABILITY)) return;
    this.running = true;
    this.host.toyLinkSet?.(this);
  }

  /** Takes the link away from the editor; its balls disappear. */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.host.toyLinkSet?.(null);
    this.listener = null;
  }

  /**
   * Passes another member's relayed toy snapshot to the editor; malformed
   * frames and frames naming this client are ignored.
   *
   * @param frame Relayed toy frame.
   */
  binary(frame: Uint8Array): void {
    const decoded = toyFrameDecode(frame);
    if (!decoded || decoded.sender === this.user) return;
    const balls = toyTennisBallDecode(decoded);
    if (!balls) return;
    this.respawns.incoming(decoded.sender, decoded.respawned, balls.balls);
    const held = balls.held;
    const empty = held === PLAYER_TOY_KEYBOARD || held === PLAYER_TOY_GRAPPLE;
    if (held !== undefined) this.presence.holdSet(decoded.sender, empty ? null : held);
    this.listener?.snapshot(decoded.sender, balls);
  }

  /**
   * Tells play mode that a new member joined, so it sends its toys once.
   *
   * @param member Member id.
   */
  memberJoined(member: number): void {
    this.listener?.memberJoined(member);
  }

  /**
   * Removes a leaving member's toys.
   *
   * @param member Member id.
   */
  memberLeft(member: number): void {
    this.respawns.forget(member);
    this.listener?.memberLeft(member);
  }

  /** @inheritdoc */
  self(): number {
    return this.user;
  }

  /** @inheritdoc */
  players(): PlayerBallPlayer[] {
    return this.presence
      .characters()
      .map((character) => ({ member: character.user, feet: character.feet, velocity: character.velocity }));
  }

  /** @inheritdoc */
  colorOf(member: number): number {
    return this.roster.colorOf(member);
  }

  /** @inheritdoc */
  publish(snapshot: PlayerBallSnapshot): boolean {
    if (!this.running) return false;
    const respawned = this.respawns.outgoing(snapshot.balls, performance.now());
    return this.transport.sendPresence(toyFrameEncode(toyTennisBallEncode(snapshot, respawned)));
  }

  /** @inheritdoc */
  handsSet(member: number, hands: PlayerCharacterHandTargets | null): void {
    this.presence.handsSet(member, hands);
  }

  /** @inheritdoc */
  reachSet(member: number, anchor: THREE.Vector3 | null): void {
    this.presence.reachSet(member, anchor);
  }

  /** @inheritdoc */
  listen(listener: PlayerBallLinkListener | null): void {
    this.listener = listener;
  }
}
