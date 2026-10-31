import type { HostCollaborationEditor } from '@/collaboration/host/host_collaboration_editor.js';
import {
  ReceiverCollaborationPresence,
  RECEIVER_COLLABORATION_PRESENCE_DEFAULTS,
  type ReceiverCollaborationPresenceOptions,
} from '@/collaboration/presence/receiver_collaboration_presence.js';
import {
  SenderCollaborationPresence,
  type SenderCollaborationPresenceLink,
} from '@/collaboration/presence/sender_collaboration_presence.js';
import { presenceFrameDecode } from '@/collaboration/shared/presence_frame.js';
import type { MemberCollaborationRoster } from '@/collaboration/sync/member_collaboration_roster.js';

/**
 * Presence of one room: sends the local cameras and character once synchronized
 * and shows everyone else's. Bonus data only: it never queues behind or ahead
 * of edits.
 */
export class PresenceCollaborationSession {
  readonly receiver: ReceiverCollaborationPresence;
  private readonly sender: SenderCollaborationPresence;
  private self: number;

  /**
   * Creates an idle presence session.
   *
   * @param host Editor services.
   * @param link Relay link.
   * @param roster Member names and colors.
   * @param options Receiver clock, scheduler and character model.
   */
  constructor(
    host: HostCollaborationEditor,
    link: SenderCollaborationPresenceLink,
    roster: MemberCollaborationRoster,
    options: ReceiverCollaborationPresenceOptions = RECEIVER_COLLABORATION_PRESENCE_DEFAULTS,
  ) {
    this.receiver = new ReceiverCollaborationPresence(host, roster, options);
    this.sender = new SenderCollaborationPresence(host, link, options.now);
    this.self = -1;
  }

  /**
   * Starts sending (the relay ignores presence before the snapshot).
   *
   * @param self Own user id.
   */
  start(self: number): void {
    this.self = self;
    this.sender.start();
  }

  /** Stops sending and removes all remote presence. */
  stop(): void {
    this.sender.stop();
    this.receiver.clear();
  }

  /**
   * Applies a relayed presence frame.
   *
   * @param frame Raw binary frame.
   */
  binary(frame: Uint8Array): void {
    const decoded = presenceFrameDecode(frame);
    if (decoded !== null && decoded.sender !== this.self) this.receiver.frame(decoded);
  }

  /**
   * Removes a member's presence.
   *
   * @param user Member id.
   */
  memberLeft(user: number): void {
    this.receiver.memberLeft(user);
  }
}
