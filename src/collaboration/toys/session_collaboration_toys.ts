import type { HostCollaborationEditor } from '@/collaboration/host/host_collaboration_editor.js';
import type { ReceiverCollaborationPresence } from '@/collaboration/presence/receiver_collaboration_presence.js';
import { toyFrameDecode, toyFrameEncode, type ToyFrame } from '@/collaboration/shared/toy_frame.js';
import type { SessionCollaborationTransport } from '@/collaboration/session/session_collaboration_types.js';
import type { MemberCollaborationRoster } from '@/collaboration/sync/member_collaboration_roster.js';
import {
  playerBallToyKey,
  type PlayerBallLink,
  type PlayerBallLinkListener,
  type PlayerBallPlayer,
  type PlayerBallSnapshot,
} from '@/player/ball/player_ball_link.js';
import { toyHandDecode, toyTennisBallDecode, toyTennisBallEncode } from './toy_tennis_ball.js';

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
  /**
   * Toys (kind and spawn count) by id of each member's latest toys (to spot new
   * ones).
   */
  private readonly types: Map<number, Map<number, string>>;
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
    this.types = new Map();
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
    this.heldUpdate(decoded, balls);
    this.listener?.snapshot(decoded.sender, balls);
  }

  /**
   * Shows the toy a member holds: the one its hand entry names, or else the
   * kind of a toy it just threw or respawned (with four toys out there is no
   * hand entry).
   *
   * @param frame Valid relayed frame.
   * @param balls Its decoded toys.
   */
  private heldUpdate(frame: ToyFrame, balls: PlayerBallSnapshot): void {
    const known = this.types.get(frame.sender) ?? new Map<number, string>();
    const fresh = balls.balls.filter((ball) => known.get(ball.id) !== playerBallToyKey(ball)).at(-1);
    if (frame.full) known.clear();
    balls.balls.forEach((ball) => known.set(ball.id, playerBallToyKey(ball)));
    this.types.set(frame.sender, known);
    const held = toyHandDecode(frame) ?? (fresh ? (fresh.kind ?? 'tennis') : undefined);
    if (held !== undefined) this.presence.holdSet(frame.sender, held);
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
    this.types.delete(member);
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
    return this.transport.sendPresence(toyFrameEncode(toyTennisBallEncode(snapshot)));
  }

  /** @inheritdoc */
  listen(listener: PlayerBallLinkListener | null): void {
    this.listener = listener;
  }
}
