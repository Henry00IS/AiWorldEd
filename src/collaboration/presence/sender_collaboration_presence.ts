import type { HostCollaborationEditor } from '@/collaboration/host/host_collaboration_editor.js';
import { samplerCollaborationPresence } from '@/collaboration/presence/sampler_collaboration_presence.js';
import {
  THROTTLE_COLLABORATION_PRESENCE_SAMPLE_MS,
  ThrottleCollaborationPresence,
} from '@/collaboration/presence/throttle_collaboration_presence.js';
import { presenceFrameEncode } from '@/collaboration/shared/presence_frame.js';

/** Link used for presence frames. */
export interface SenderCollaborationPresenceLink {
  /**
   * Sends a presence frame only when the link is idle.
   *
   * @param frame Presence frame.
   * @returns True when the frame went out.
   */
  sendPresence(frame: Uint8Array): boolean;
}

/**
 * Samples the local viewport cameras and character ten times a second and sends
 * a frame when they changed visibly, about five times a second. A frame the
 * link refuses (busy with edits) is simply retried next sample.
 */
export class SenderCollaborationPresence {
  private readonly host: HostCollaborationEditor;
  private readonly link: SenderCollaborationPresenceLink;
  private readonly throttle: ThrottleCollaborationPresence;
  private readonly now: () => number;
  private timer: ReturnType<typeof setInterval> | null;

  /**
   * Creates an idle sender.
   *
   * @param host Editor services.
   * @param link Relay link.
   * @param now Clock in milliseconds.
   */
  constructor(host: HostCollaborationEditor, link: SenderCollaborationPresenceLink, now: () => number) {
    this.host = host;
    this.link = link;
    this.throttle = new ThrottleCollaborationPresence();
    this.now = now;
    this.timer = null;
  }

  /** Starts sampling. */
  start(): void {
    if (this.timer !== null) return;
    this.throttle.reset();
    this.timer = setInterval(() => this.tick(), THROTTLE_COLLABORATION_PRESENCE_SAMPLE_MS);
    this.tick();
  }

  /** Stops sampling. */
  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  /** Samples once and sends when due. */
  tick(): void {
    const entries = samplerCollaborationPresence(this.host);
    const now = this.now();
    if (!this.throttle.due(entries, now)) return;
    if (this.link.sendPresence(presenceFrameEncode(entries))) this.throttle.mark(entries, now);
  }
}
